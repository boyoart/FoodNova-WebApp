import json
import os
import socket
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from uuid import uuid4


DEFAULT_CHECKMYNINBVN_BASE_URL = "https://checkmyninbvn.com.ng/api"
LOW_BALANCE_THRESHOLD = 500
_ACTIVE_NIN_REQUESTS = set()
_ACTIVE_NIN_REQUESTS_LOCK = threading.Lock()


@dataclass
class CheckMyNINBVNError(Exception):
    message: str
    code: str = "verification_failed"
    status_code: int = 400
    retryable: bool = False
    provider_status: Optional[int] = None

    def __str__(self) -> str:
        return self.message


def _env_value(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def _timeout_seconds() -> int:
    try:
        return max(3, min(int(os.getenv("CHECKMYNINBVN_TIMEOUT_SECONDS", "10")), 10))
    except ValueError:
        return 10


def checkmyninbvn_config() -> dict:
    api_key = _env_value("CHECKMYNINBVN_API_KEY")
    base_url = _env_value("CHECKMYNINBVN_API_BASE_URL", "CHECKMYNINBVN_BASE_URL") or DEFAULT_CHECKMYNINBVN_BASE_URL
    return {
        "api_key": api_key,
        "base_url": base_url.rstrip("/"),
        "configured": bool(api_key),
    }


def validate_checkmyninbvn_config() -> dict:
    config = checkmyninbvn_config()
    if not config["api_key"]:
        return {
            "configured": False,
            "message": "CHECKMYNINBVN_API_KEY is missing. Add it to the Render environment before enabling live NIN checks.",
        }
    if not config["base_url"].startswith("https://"):
        return {
            "configured": False,
            "message": "CHECKMYNINBVN_API_BASE_URL must be an HTTPS URL.",
        }
    return {
        "configured": True,
        "message": "CheckMyNINBVN configuration is ready.",
    }


def _raise_config_error(message: str) -> None:
    raise CheckMyNINBVNError(
        message=message,
        code="provider_not_configured",
        status_code=503,
        retryable=False,
    )


def _provider_message(data: dict, fallback: str) -> str:
    value = data.get("message") or data.get("detail") or data.get("error") or fallback
    return str(value)


def _log_provider_event(event: str, request_id: str, payload: dict) -> None:
    safe_payload = {
        **payload,
        "event": event,
        "request_id": request_id,
        "provider": "checkmyninbvn",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    safe_payload.pop("api_key", None)
    print("CHECKMYNINBVN_DIAGNOSTIC", json.dumps(safe_payload, default=str))


def _redact_provider_body(data):
    if isinstance(data, dict):
        redacted = {}
        for key, value in data.items():
            lower_key = str(key).lower()
            if lower_key in {"photo", "image", "base64", "signature"}:
                redacted[key] = "[redacted]"
            elif lower_key in {"nin", "bvn"}:
                redacted[key] = f"*******{str(value)[-4:]}" if value else ""
            else:
                redacted[key] = _redact_provider_body(value)
        return redacted
    if isinstance(data, list):
        return [_redact_provider_body(item) for item in data]
    return data


def _parse_provider_body(raw_body: str) -> dict:
    try:
        parsed = json.loads(raw_body or "{}")
        return parsed if isinstance(parsed, dict) else {"raw_type": type(parsed).__name__, "data": parsed}
    except json.JSONDecodeError:
        return {"raw_text_preview": (raw_body or "")[:300]}


def _provider_response_log(data: dict) -> dict:
    return {
        "keys": sorted(list(data.keys())) if isinstance(data, dict) else [],
        "status": data.get("status") if isinstance(data, dict) else "",
        "message": data.get("message") if isinstance(data, dict) else "",
        "has_data": bool(data.get("data")) if isinstance(data, dict) else False,
        "report_id_present": bool((data.get("reportID") or data.get("report_id")) if isinstance(data, dict) else False),
    }


def _sanitized_unavailable_message() -> str:
    return "Verification service unavailable. Please retry shortly."


def _is_insufficient_balance(message: str) -> bool:
    lower_message = str(message or "").lower()
    return "insufficient" in lower_message and ("balance" in lower_message or "wallet" in lower_message)


def _map_provider_http_error(error: urllib.error.HTTPError, request_id: str, duration_ms: int) -> CheckMyNINBVNError:
    try:
        body = error.read().decode("utf-8")
        data = _parse_provider_body(body)
    except Exception:
        data = {}

    provider_message = _provider_message(data, "NIN verification failed.")
    lower_message = provider_message.lower()
    _log_provider_event(
        "http_failure",
        request_id,
        {
            "http_status": error.code,
            "duration_ms": duration_ms,
            "response": _provider_response_log(data),
            "response_body": _redact_provider_body(data),
        },
    )

    if error.code in (401, 403) or "api key" in lower_message or "credential" in lower_message or "unauthorized" in lower_message:
        _log_provider_event(
            "invalid_api_key",
            request_id,
            {"http_status": error.code, "duration_ms": duration_ms},
        )
        return CheckMyNINBVNError(
            message=_sanitized_unavailable_message(),
            code="invalid_provider_credentials",
            status_code=503,
            retryable=False,
            provider_status=error.code,
        )
    if _is_insufficient_balance(lower_message):
        return CheckMyNINBVNError(
            message="Unable to verify NIN currently. Please retry shortly.",
            code="insufficient_wallet_balance",
            status_code=503,
            retryable=False,
            provider_status=error.code,
        )
    if error.code == 400 and ("invalid" in lower_message or "nin" in lower_message or "number" in lower_message):
        return CheckMyNINBVNError(
            message="The NIN could not be verified. Please check the number and try again.",
            code="invalid_nin",
            status_code=422,
            retryable=False,
            provider_status=error.code,
        )
    if error.code == 429:
        return CheckMyNINBVNError(
            message="Unable to verify NIN currently. Please retry shortly.",
            code="provider_rate_limited",
            status_code=503,
            retryable=True,
            provider_status=error.code,
        )
    if error.code >= 500:
        return CheckMyNINBVNError(
            message="Unable to verify NIN currently. Please retry shortly.",
            code="provider_unavailable",
            status_code=503,
            retryable=True,
            provider_status=error.code,
        )
    if "internal" in lower_message or "unauthorized" in lower_message:
        return CheckMyNINBVNError(
            message="Unable to verify NIN currently. Please retry shortly.",
            code="provider_error",
            status_code=503,
            retryable=True,
            provider_status=error.code,
        )
    return CheckMyNINBVNError(
        message=provider_message or "The NIN could not be verified. Please check the number and try again.",
        code="provider_rejected_request",
        status_code=400,
        retryable=False,
        provider_status=error.code,
    )


def verify_nin(nin_number: str, consent: bool = True) -> dict:
    request_id = f"nin_{uuid4().hex[:12]}"
    nin = "".join(ch for ch in str(nin_number or "") if ch.isdigit())
    if len(nin) != 11:
        raise CheckMyNINBVNError("NIN must be exactly 11 digits.", code="invalid_nin", status_code=422)
    if consent is not True:
        raise CheckMyNINBVNError("Consent is required before NIN verification.", code="consent_required", status_code=422)
    with _ACTIVE_NIN_REQUESTS_LOCK:
        if nin in _ACTIVE_NIN_REQUESTS:
            _log_provider_event(
                "duplicate_request_blocked",
                request_id,
                {"nin_last4": nin[-4:], "env_api_key_loaded": bool(checkmyninbvn_config().get("api_key"))},
            )
            raise CheckMyNINBVNError(
                "A verification request is already running for this NIN. Please wait.",
                code="verification_in_progress",
                status_code=429,
                retryable=True,
            )
        _ACTIVE_NIN_REQUESTS.add(nin)

    try:
        validation = validate_checkmyninbvn_config()
        if not validation["configured"]:
            _log_provider_event(
                "configuration_failure",
                request_id,
                {
                    "configured": False,
                    "reason": validation["message"],
                    "base_url": checkmyninbvn_config().get("base_url"),
                    "api_key_present": bool(checkmyninbvn_config().get("api_key")),
                    "env_api_key_loaded": bool(os.getenv("CHECKMYNINBVN_API_KEY", "").strip()),
                },
            )
            _raise_config_error(validation["message"])

        config = checkmyninbvn_config()
        payload = json.dumps({"nin": nin, "consent": True}).encode("utf-8")
        url = f"{config['base_url']}/nin-verification"
        request = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "x-api-key": config["api_key"],
                "Authorization": f"Bearer {config['api_key']}",
            },
            method="POST",
        )

        _log_provider_event(
            "request",
            request_id,
            {
                "url": url,
                "method": "POST",
                "base_url": config["base_url"],
                "api_key_present": bool(config["api_key"]),
                "env_api_key_loaded": bool(os.getenv("CHECKMYNINBVN_API_KEY", "").strip()),
                "headers": {
                    "content_type": "application/json",
                    "accept": "application/json",
                    "x_api_key_present": bool(config["api_key"]),
                    "authorization_bearer_present": bool(config["api_key"]),
                },
                "body": {"nin": f"*******{nin[-4:]}", "consent": True},
                "body_keys": ["nin", "consent"],
                "nin_last4": nin[-4:],
                "timeout_seconds": _timeout_seconds(),
            },
        )

        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=_timeout_seconds()) as response:
                response_status = response.status
                raw_body = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            duration_ms = int((time.monotonic() - started) * 1000)
            raise _map_provider_http_error(error, request_id, duration_ms) from error
        except (urllib.error.URLError, TimeoutError, socket.timeout) as error:
            duration_ms = int((time.monotonic() - started) * 1000)
            reason = getattr(error, "reason", error)
            event = "timeout_failure" if isinstance(reason, (TimeoutError, socket.timeout)) or "timed out" in str(reason).lower() else "network_failure"
            _log_provider_event(
                event,
                request_id,
                {
                    "duration_ms": duration_ms,
                    "retryable": True,
                    "error_type": type(error).__name__,
                    "error": str(reason),
                },
            )
            raise CheckMyNINBVNError(
                message=_sanitized_unavailable_message(),
                code="provider_unavailable",
                status_code=503,
                retryable=True,
            ) from error
        except Exception as error:
            duration_ms = int((time.monotonic() - started) * 1000)
            _log_provider_event(
                "network_failure",
                request_id,
                {
                    "duration_ms": duration_ms,
                    "retryable": True,
                    "error_type": type(error).__name__,
                    "error": str(error),
                },
            )
            raise CheckMyNINBVNError(
                message="Unable to verify NIN currently. Please retry shortly.",
                code="provider_error",
                status_code=503,
                retryable=True,
            ) from error

        result = _parse_provider_body(raw_body)
        duration_ms = int((time.monotonic() - started) * 1000)
        _log_provider_event(
            "response",
            request_id,
            {
                "http_status": response_status,
                "duration_ms": duration_ms,
                "response": _provider_response_log(result),
                "response_body": _redact_provider_body(result),
            },
        )
        if "raw_text_preview" in result:
            raise CheckMyNINBVNError(
                message="NIN verification returned an invalid response. Please try again shortly.",
                code="invalid_provider_response",
                status_code=503,
                retryable=True,
            )

        status = str(result.get("status", "")).lower()
        provider_message = result.get("message") or ""
        if status != "success" and _is_insufficient_balance(provider_message):
            raise CheckMyNINBVNError(
                message="Unable to verify NIN currently. Please retry shortly.",
                code="insufficient_wallet_balance",
                status_code=503,
                retryable=False,
                provider_status=response_status,
            )
        if status != "success" and ("internal" in provider_message.lower() or "unauthorized" in provider_message.lower() or "api key" in provider_message.lower()):
            raise CheckMyNINBVNError(
                message="Unable to verify NIN currently. Please retry shortly.",
                code="provider_error",
                status_code=503,
                retryable=True,
                provider_status=response_status,
            )
        verified = status == "success"
        data = result.get("data") or {}
        address = data.get("residence_address") or data.get("address") or data.get("residential_address") or ""
        return {
            "verified": verified,
            "message": result.get("message") or ("NIN verified successfully." if verified else "NIN verification failed."),
            "report_id": result.get("reportID") or result.get("reportId") or result.get("report_id") or "",
            "provider_status": status,
            "provider_http_status": response_status,
            "request_id": request_id,
            "duration_ms": duration_ms,
            "provider": "checkmyninbvn",
            "raw_response": result,
            "data": {
                "first_name": data.get("firstname") or data.get("first_name") or "",
                "middle_name": data.get("middlename") or data.get("middle_name") or "",
                "surname": data.get("surname") or data.get("lastname") or "",
                "phone": data.get("telephoneno") or data.get("phone") or "",
                "gender": data.get("gender") or "",
                "birthdate": data.get("birthdate") or data.get("dob") or "",
                "dob": data.get("birthdate") or data.get("dob") or "",
                "address": address,
                "residence_state": data.get("residence_state") or "",
                "residence_town": data.get("residence_town") or "",
                "residence_lga": data.get("residence_lga") or "",
                "photo": data.get("photo") or "",
            },
        }
    finally:
        with _ACTIVE_NIN_REQUESTS_LOCK:
            _ACTIVE_NIN_REQUESTS.discard(nin)


def check_balance() -> dict:
    request_id = f"balance_{uuid4().hex[:12]}"
    validation = validate_checkmyninbvn_config()
    if not validation["configured"]:
        _log_provider_event(
            "balance_configuration_failure",
            request_id,
            {"configured": False, "reason": validation["message"], "api_key_present": bool(checkmyninbvn_config().get("api_key"))},
        )
        _raise_config_error(validation["message"])

    config = checkmyninbvn_config()
    url = f"{config['base_url']}/balance"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "x-api-key": config["api_key"],
            "Authorization": f"Bearer {config['api_key']}",
        },
        method="GET",
    )
    _log_provider_event(
        "balance_request",
        request_id,
        {
            "url": url,
            "method": "GET",
            "api_key_present": bool(config["api_key"]),
            "headers": {"x_api_key_present": True, "authorization_bearer_present": True},
            "timeout_seconds": _timeout_seconds(),
        },
    )
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=_timeout_seconds()) as response:
            raw_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        duration_ms = int((time.monotonic() - started) * 1000)
        raise _map_provider_http_error(error, request_id, duration_ms) from error
    except (urllib.error.URLError, TimeoutError, socket.timeout) as error:
        duration_ms = int((time.monotonic() - started) * 1000)
        _log_provider_event("balance_network_failure", request_id, {"duration_ms": duration_ms, "retryable": True, "error_type": type(error).__name__})
        raise CheckMyNINBVNError(
            message=_sanitized_unavailable_message(),
            code="provider_unavailable",
            status_code=503,
            retryable=True,
        ) from error

    result = _parse_provider_body(raw_body)
    duration_ms = int((time.monotonic() - started) * 1000)
    _log_provider_event("balance_response", request_id, {"http_status": response.status, "duration_ms": duration_ms, "response": _provider_response_log(result), "response_body": _redact_provider_body(result)})
    if "raw_text_preview" in result:
        raise CheckMyNINBVNError(
            message="Unable to verify NIN currently. Please retry shortly.",
            code="invalid_provider_response",
            status_code=503,
            retryable=True,
        )

    data = result.get("data") or {}
    balance_value = data.get("balance") if isinstance(data, dict) else None
    try:
        balance = float(balance_value or 0)
    except (TypeError, ValueError):
        balance = 0
    return {
        "success": str(result.get("status", "")).lower() == "success",
        "message": result.get("message") or "",
        "report_id": result.get("reportID") or result.get("reportId") or result.get("report_id") or "",
        "balance": balance,
        "formatted_balance": data.get("formatted_balance") or "",
        "api_requests_today": data.get("api_requests_today"),
        "api_limit": data.get("api_limit"),
        "is_low": balance < LOW_BALANCE_THRESHOLD,
        "low_balance_threshold": LOW_BALANCE_THRESHOLD,
        "request_id": request_id,
        "duration_ms": duration_ms,
        "raw_response": result,
    }
