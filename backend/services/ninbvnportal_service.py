import json
import io
import os
import socket
import threading
import time
import http.client
import urllib.error
import urllib.parse
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from uuid import uuid4


DEFAULT_NINBVNPORTAL_BASE_URL = "https://ninbvnportal.com.ng/api"
LOW_BALANCE_THRESHOLD = 500
_ACTIVE_NIN_REQUESTS = set()
_ACTIVE_NIN_REQUESTS_LOCK = threading.Lock()
_NIN_ENDPOINT_PATH = "nin-verification"


@dataclass
class NINBVNPortalError(Exception):
    message: str
    code: str = "verification_failed"
    status_code: int = 400
    retryable: bool = False
    provider_status: Optional[int] = None
    provider_body: Optional[dict] = None
    provider_response: Optional[str] = None
    provider_attempts: Optional[list] = None

    def __str__(self) -> str:
        return self.message


def _env_value(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def _clean_api_key(value: str) -> str:
    key = str(value or "").strip().strip("\"'")
    if key.lower().startswith("bearer "):
        key = key[7:].strip()
    return key


def _normalize_base_url(value: str) -> str:
    url = str(value or DEFAULT_NINBVNPORTAL_BASE_URL).strip().strip("\"'").rstrip("/")
    if not url:
        url = DEFAULT_NINBVNPORTAL_BASE_URL
    if url.endswith(f"/{_NIN_ENDPOINT_PATH}"):
        url = url[: -(len(_NIN_ENDPOINT_PATH) + 1)]
    return url


def _timeout_seconds() -> int:
    try:
        return max(3, min(int(os.getenv("NINBVNPORTAL_TIMEOUT_SECONDS", "10")), 10))
    except ValueError:
        return 10


def ninbvnportal_config() -> dict:
    api_key = _clean_api_key(_env_value("NINBVNPORTAL_API_KEY"))
    configured_base_url = _env_value("NINBVNPORTAL_BASE_URL")
    base_url = _normalize_base_url(configured_base_url or DEFAULT_NINBVNPORTAL_BASE_URL)
    return {
        "api_key": api_key,
        "base_url": base_url,
        "configured_base_url": configured_base_url,
        "configured": bool(api_key),
    }


def validate_ninbvnportal_config() -> dict:
    config = ninbvnportal_config()
    if not config["api_key"]:
        return {
            "configured": False,
            "message": "NIN API key missing from server configuration",
        }
    if not config["base_url"].startswith("https://ninbvnportal.com.ng/api"):
        return {
            "configured": False,
            "message": "NINBVNPortal provider URL must point to https://ninbvnportal.com.ng/api.",
        }
    return {
        "configured": True,
        "message": "NINBVNPortal configuration is ready.",
    }


def _raise_config_error(message: str) -> None:
    raise NINBVNPortalError(
        message=message or "NIN API key missing from server configuration",
        code="provider_not_configured",
        status_code=503,
        retryable=False,
        provider_status=None,
    )


def _provider_message(data: dict, fallback: str) -> str:
    value = data.get("message") or data.get("detail") or data.get("error") or fallback
    return str(value)


def _log_provider_event(event: str, request_id: str, payload: dict) -> None:
    safe_payload = {
        **payload,
        "event": event,
        "request_id": request_id,
        "provider": "ninbvnportal",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    safe_payload.pop("api_key", None)
    print("NINBVNPORTAL_DIAGNOSTIC", json.dumps(safe_payload, default=str))


def _auth_headers(api_key: str, mode: str = "x-api-key") -> dict:
    return {"x-api-key": api_key}


def current_nin_auth_mode() -> str:
    return "x-api-key"


def _auth_log(api_key: str, mode: str = "x-api-key") -> dict:
    return {
        "auth_mode": "x-api-key",
        "header_name": "x-api-key",
        "x_api_key_present": bool(api_key),
        "api_key_length": len(api_key or ""),
    }


def _safe_headers_for_print(headers: dict) -> dict:
    safe = {}
    for key, value in headers.items():
        lower = str(key).lower()
        if lower in {"x-api-key", "authorization"}:
            safe[key] = "[redacted]"
        else:
            safe[key] = value
    return safe


def _send_provider_request(method: str, url: str, body: bytes = None, headers: dict = None, timeout: int = 10) -> tuple[int, str]:
    parsed = urllib.parse.urlparse(url)
    connection_cls = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    connection = connection_cls(parsed.netloc, timeout=timeout)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    try:
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        raw_body = response.read().decode("utf-8", errors="replace")
        return response.status, raw_body
    finally:
        connection.close()


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


def _provider_message_from_body(data: dict, fallback: str = "") -> str:
    if not isinstance(data, dict):
        return fallback
    return str(data.get("message") or data.get("detail") or data.get("error") or fallback)


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
    return "Identity verification currently unavailable."


def _timeout_message() -> str:
    return "Verification service is taking too long to respond."


def _is_insufficient_balance(message: str) -> bool:
    lower_message = str(message or "").lower()
    return "insufficient" in lower_message and ("balance" in lower_message or "wallet" in lower_message)


def _map_provider_http_error(error: urllib.error.HTTPError, request_id: str, duration_ms: int) -> NINBVNPortalError:
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
        return NINBVNPortalError(
            message=provider_message or "Provider rejected API credentials. Verify API key or wallet status.",
            code="invalid_provider_credentials",
            status_code=503,
            retryable=False,
            provider_status=error.code,
            provider_body=data,
            provider_response=body,
        )
    if _is_insufficient_balance(lower_message):
        return NINBVNPortalError(
            message=provider_message or "Insufficient wallet balance.",
            code="insufficient_wallet_balance",
            status_code=503,
            retryable=False,
            provider_status=error.code,
            provider_body=data,
            provider_response=body,
        )
    if error.code == 400 and ("invalid" in lower_message or "nin" in lower_message or "number" in lower_message):
        return NINBVNPortalError(
            message="Invalid NIN detected.",
            code="invalid_nin",
            status_code=422,
            retryable=False,
            provider_status=error.code,
            provider_body=data,
            provider_response=body,
        )
    if error.code == 429:
        return NINBVNPortalError(
            message="Identity verification currently unavailable.",
            code="provider_rate_limited",
            status_code=503,
            retryable=True,
            provider_status=error.code,
            provider_body=data,
            provider_response=body,
        )
    if error.code >= 500:
        return NINBVNPortalError(
            message="Identity verification currently unavailable.",
            code="provider_unavailable",
            status_code=503,
            retryable=True,
            provider_status=error.code,
            provider_body=data,
            provider_response=body,
        )
    if "internal" in lower_message or "unauthorized" in lower_message:
        return NINBVNPortalError(
            message="Identity verification currently unavailable.",
            code="provider_error",
            status_code=503,
            retryable=True,
            provider_status=error.code,
            provider_body=data,
            provider_response=body,
        )
    return NINBVNPortalError(
        message="Invalid NIN detected.",
        code="provider_rejected_request",
        status_code=400,
        retryable=False,
        provider_status=error.code,
        provider_body=data,
        provider_response=body,
    )


def _map_provider_status_error(status_code: int, body: str, request_id: str, duration_ms: int) -> NINBVNPortalError:
    data = _parse_provider_body(body)
    provider_message = _provider_message(data, "NIN verification failed.")
    lower_message = provider_message.lower()
    _log_provider_event(
        "http_failure",
        request_id,
        {
            "http_status": status_code,
            "duration_ms": duration_ms,
            "response": _provider_response_log(data),
            "response_body": _redact_provider_body(data),
        },
    )
    if status_code in (401, 403) or "api key" in lower_message or "credential" in lower_message or "unauthorized" in lower_message:
        _log_provider_event(
            "invalid_api_key",
            request_id,
            {"http_status": status_code, "duration_ms": duration_ms, "provider_response": body},
        )
        return NINBVNPortalError(
            message=provider_message or "Provider rejected API credentials. Verify API key or wallet status.",
            code="invalid_provider_credentials",
            status_code=503,
            retryable=False,
            provider_status=status_code,
            provider_body=data,
            provider_response=body,
        )
    if _is_insufficient_balance(lower_message):
        return NINBVNPortalError(
            message=provider_message or "Insufficient wallet balance.",
            code="insufficient_wallet_balance",
            status_code=503,
            retryable=False,
            provider_status=status_code,
            provider_body=data,
            provider_response=body,
        )
    if status_code == 400 and ("invalid" in lower_message or "nin" in lower_message or "number" in lower_message):
        return NINBVNPortalError(
            message="Invalid NIN detected.",
            code="invalid_nin",
            status_code=422,
            retryable=False,
            provider_status=status_code,
            provider_body=data,
            provider_response=body,
        )
    if status_code == 429:
        return NINBVNPortalError(
            message="Identity verification currently unavailable.",
            code="provider_rate_limited",
            status_code=503,
            retryable=True,
            provider_status=status_code,
            provider_body=data,
            provider_response=body,
        )
    if status_code >= 500:
        return NINBVNPortalError(
            message="Identity verification currently unavailable.",
            code="provider_unavailable",
            status_code=503,
            retryable=True,
            provider_status=status_code,
            provider_body=data,
            provider_response=body,
        )
    return NINBVNPortalError(
        message=provider_message or "Invalid NIN detected.",
        code="provider_rejected_request",
        status_code=400,
        retryable=False,
        provider_status=status_code,
        provider_body=data,
        provider_response=body,
    )


def verify_nin(nin_number: str, consent: bool = True) -> dict:
    request_id = f"nin_{uuid4().hex[:12]}"
    nin = "".join(ch for ch in str(nin_number or "") if ch.isdigit())
    if len(nin) != 11:
        print("NIN_VERIFY_FAILURE", json.dumps({"request_id": request_id, "error_code": "invalid_nin", "message": "NIN must be exactly 11 digits."}))
        _log_provider_event(
            "invalid_payload",
            request_id,
            {
                "reason": "nin_must_be_11_digits",
                "body": {"nin": f"*******{nin[-4:]}" if nin else "", "consent": bool(consent)},
                "body_keys": ["nin", "consent"],
                "env_api_key_loaded": bool(os.getenv("NINBVNPORTAL_API_KEY", "").strip()),
            },
        )
        raise NINBVNPortalError("NIN must be exactly 11 digits.", code="invalid_nin", status_code=422)
    if consent is not True:
        print("NIN_VERIFY_FAILURE", json.dumps({"request_id": request_id, "error_code": "consent_required", "message": "Consent is required before NIN verification."}))
        _log_provider_event(
            "invalid_payload",
            request_id,
            {
                "reason": "consent_required",
                "body": {"nin": f"*******{nin[-4:]}", "consent": bool(consent)},
                "body_keys": ["nin", "consent"],
                "env_api_key_loaded": bool(os.getenv("NINBVNPORTAL_API_KEY", "").strip()),
            },
        )
        raise NINBVNPortalError("Consent is required before NIN verification.", code="consent_required", status_code=422)
    with _ACTIVE_NIN_REQUESTS_LOCK:
        if nin in _ACTIVE_NIN_REQUESTS:
            _log_provider_event(
                "duplicate_request_blocked",
                request_id,
                {"nin_last4": nin[-4:], "env_api_key_loaded": bool(ninbvnportal_config().get("api_key"))},
            )
            raise NINBVNPortalError(
                "A verification request is already running for this NIN. Please wait.",
                code="verification_in_progress",
                status_code=429,
                retryable=True,
            )
        _ACTIVE_NIN_REQUESTS.add(nin)

    try:
        validation = validate_ninbvnportal_config()
        if not validation["configured"]:
            config = ninbvnportal_config()
            print("NIN_VERIFY_FAILURE", json.dumps({"request_id": request_id, "error_code": "provider_not_configured", "message": validation["message"]}))
            _log_provider_event(
                "configuration_failure",
                request_id,
                {
                    "configured": False,
                    "reason": validation["message"],
                    "base_url": config.get("base_url"),
                    "endpoint": f"{config.get('base_url')}/nin-verification",
                    "auth_mode": current_nin_auth_mode(),
                    "header_name_used": "x-api-key",
                    "api_key_present": bool(config.get("api_key")),
                    "api_key_length": len(config.get("api_key") or ""),
                    "env_api_key_loaded": bool(os.getenv("NINBVNPORTAL_API_KEY", "").strip()),
                },
            )
            _raise_config_error(validation["message"])

        config = ninbvnportal_config()
        request_body = {"nin": nin, "consent": True}
        payload = json.dumps(request_body).encode("utf-8")
        url = f"{config['base_url']}/nin-verification"

        _log_provider_event(
            "request",
            request_id,
            {
                "url": url,
                "method": "POST",
                "base_url": config["base_url"],
                "configured_base_url_present": bool(config.get("configured_base_url")),
                "api_key_present": bool(config["api_key"]),
                "env_api_key_loaded": bool(os.getenv("NINBVNPORTAL_API_KEY", "").strip()),
                "headers": {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    **_auth_log(config["api_key"], "x-api-key"),
                },
                "payload": {"nin": f"*******{nin[-4:]}", "consent": True},
                "body_keys": ["nin", "consent"],
                "nin_last4": nin[-4:],
                "timeout_seconds": _timeout_seconds(),
            },
        )
        print("BASE URL:", config["base_url"])
        print("Calling:", url)
        print("ENDPOINT USED:", url)
        print("NINBVNPORTAL_API_KEY exists:", bool(os.getenv("NINBVNPORTAL_API_KEY", "").strip()))
        print("NINBVNPORTAL_API_KEY length:", len(config["api_key"] or ""))
        print("Payload:", json.dumps(request_body))
        print("NIN_VERIFICATION_STARTED", json.dumps({"endpoint": url, "nin_last4": nin[-4:], "request_id": request_id}))

        started = time.monotonic()
        response_status = None
        raw_body = ""
        attempts = []
        try:
            auth_mode = "x-api-key"
            request_headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                **_auth_headers(config["api_key"], auth_mode),
            }
            auth_meta = _auth_log(config["api_key"], auth_mode)
            safe_request_headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "x-api-key": "[configured]" if config["api_key"] else "[missing]",
            }
            print("NIN_VERIFY_REQUEST", json.dumps({
                "request_id": request_id,
                "method": "POST",
                "endpoint": url,
                "headers": safe_request_headers,
                "payload": request_body,
            }))
            print("AUTH MODE USED:", auth_meta["auth_mode"])
            print("HEADER NAME USED:", auth_meta["header_name"])
            print("Headers:", json.dumps(_safe_headers_for_print(request_headers), default=str))
            print("NIN_VERIFICATION_REQUEST_SENT", json.dumps({"endpoint": url, "auth_mode": auth_meta["auth_mode"], "header_name": auth_meta["header_name"], "request_id": request_id}))
            _log_provider_event(
                "request_attempt",
                request_id,
                {
                    "url": url,
                    "method": "POST",
                    "headers": {
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        **auth_meta,
                    },
                    "payload": {"nin": f"*******{nin[-4:]}", "consent": True},
                },
            )
            response_status, raw_body = _send_provider_request(
                "POST",
                url,
                body=payload,
                headers=request_headers,
                timeout=_timeout_seconds(),
            )
            parsed_body = _parse_provider_body(raw_body)
            print("NIN_VERIFY_STATUS", response_status)
            print("NIN_VERIFY_RESPONSE", raw_body)
            print("Status:", response_status)
            print("Body:", raw_body)
            attempts.append({
                "auth_method": auth_meta["auth_mode"],
                "header_name": auth_meta["header_name"],
                "endpoint": url,
                "response_code": response_status,
                "response_body": raw_body,
                "response": _redact_provider_body(parsed_body),
            })
            if response_status >= 400:
                mapped = _map_provider_status_error(response_status, raw_body, request_id, int((time.monotonic() - started) * 1000))
                mapped.provider_attempts = attempts
                raise mapped
        except (urllib.error.URLError, TimeoutError, socket.timeout, OSError, http.client.HTTPException) as error:
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
            raise NINBVNPortalError(
                message=_timeout_message() if event == "timeout_failure" else _sanitized_unavailable_message(),
                code="provider_timeout" if event == "timeout_failure" else "provider_unavailable",
                status_code=503,
                retryable=True,
                provider_attempts=attempts,
            ) from error
        except NINBVNPortalError as error:
            print("NIN_VERIFY_FAILURE", json.dumps({
                "request_id": request_id,
                "error_code": error.code,
                "provider_status": error.provider_status,
                "message": str(error),
            }))
            raise
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
            raise NINBVNPortalError(
                message="Identity verification currently unavailable.",
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
            raise NINBVNPortalError(
                message="NIN verification returned an invalid response. Please try again shortly.",
                code="invalid_provider_response",
                status_code=503,
                retryable=True,
                provider_status=response_status,
                provider_response=raw_body,
                provider_attempts=attempts,
            )

        status = str(result.get("status", "")).lower()
        provider_message = result.get("message") or ""
        if status != "success" and _is_insufficient_balance(provider_message):
            print("NIN_VERIFY_FAILURE", json.dumps({"request_id": request_id, "status": status, "message": provider_message, "http_status": response_status}))
            print("NIN_VERIFICATION_FAILED", json.dumps({"request_id": request_id, "status": status, "message": provider_message, "http_status": response_status}))
            raise NINBVNPortalError(
                message="Verification service temporarily unavailable.",
                code="insufficient_wallet_balance",
                status_code=503,
                retryable=False,
                provider_status=response_status,
                provider_body=result,
                provider_response=raw_body,
                provider_attempts=attempts,
            )
        if status != "success" and ("internal" in provider_message.lower() or "unauthorized" in provider_message.lower() or "api key" in provider_message.lower()):
            print("NIN_VERIFY_FAILURE", json.dumps({"request_id": request_id, "status": status, "message": provider_message, "http_status": response_status}))
            print("NIN_VERIFICATION_FAILED", json.dumps({"request_id": request_id, "status": status, "message": provider_message, "http_status": response_status}))
            raise NINBVNPortalError(
                message="Provider rejected API credentials. Verify API key or wallet status." if ("unauthorized" in provider_message.lower() or "api key" in provider_message.lower()) else "Identity verification currently unavailable.",
                code="invalid_provider_credentials" if ("unauthorized" in provider_message.lower() or "api key" in provider_message.lower()) else "provider_error",
                status_code=response_status or 401,
                retryable=False,
                provider_status=response_status,
                provider_body=result,
                provider_response=raw_body,
                provider_attempts=attempts,
            )
        verified = status == "success"
        print(("NIN_VERIFY_SUCCESS" if verified else "NIN_VERIFY_FAILURE"), json.dumps({"request_id": request_id, "status": status, "message": provider_message, "http_status": response_status}))
        print(("NIN_VERIFICATION_SUCCESS" if verified else "NIN_VERIFICATION_FAILED"), json.dumps({"request_id": request_id, "status": status, "message": provider_message, "http_status": response_status}))
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
            "provider": "ninbvnportal",
            "request_endpoint": url,
            "request_method": "POST",
            "request_headers": safe_request_headers,
            "request_payload": request_body,
            "raw_response_body": raw_body,
            "parsed_response_body": result,
            "failure_stage": "" if verified else "provider_rejection",
            "raw_response": result,
            "provider_attempts": attempts,
            "data": {
                "first_name": data.get("firstname") or data.get("first_name") or "",
                "middle_name": data.get("middlename") or data.get("middle_name") or "",
                "surname": data.get("surname") or data.get("lastname") or "",
                "phone": data.get("telephoneno") or data.get("phone") or "",
                "gender": data.get("gender") or "",
                "birthdate": data.get("birthdate") or data.get("dob") or "",
                "dob": data.get("birthdate") or data.get("dob") or "",
                "address": address,
                "full_name": " ".join([data.get("firstname") or data.get("first_name") or "", data.get("middlename") or data.get("middle_name") or "", data.get("surname") or data.get("lastname") or ""]).strip(),
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
    validation = validate_ninbvnportal_config()
    if not validation["configured"]:
        print("NIN_BALANCE_FAILURE", json.dumps({"request_id": request_id, "error_code": "provider_not_configured", "message": validation["message"]}))
        _log_provider_event(
            "balance_configuration_failure",
            request_id,
            {"configured": False, "reason": validation["message"], "api_key_present": bool(ninbvnportal_config().get("api_key"))},
        )
        _raise_config_error(validation["message"])

    config = ninbvnportal_config()
    url = f"{config['base_url']}/balance"
    print("NIN_PROVIDER_REQUEST", json.dumps({
        "request_id": request_id,
        "method": "GET",
        "url": url,
        "header_name": "x-api-key",
        "api_key_loaded": bool(config["api_key"]),
        "api_key_length": len(config["api_key"] or ""),
    }))
    _log_provider_event(
        "balance_request",
        request_id,
        {
            "url": url,
            "method": "GET",
            "api_key_present": bool(config["api_key"]),
            "configured_base_url_present": bool(config.get("configured_base_url")),
            "headers": {"accept": "application/json", **_auth_log(config["api_key"])},
            "timeout_seconds": _timeout_seconds(),
        },
    )
    started = time.monotonic()
    raw_body = ""
    response_status = None
    try:
        request_headers = {
            "Accept": "application/json",
            **_auth_headers(config["api_key"]),
        }
        _log_provider_event(
            "balance_request_attempt",
            request_id,
            {
                "url": url,
                "method": "GET",
                "headers": {"accept": "application/json", **_auth_log(config["api_key"])},
            },
        )
        response_status, raw_body = _send_provider_request(
            "GET",
            url,
            headers=request_headers,
            timeout=_timeout_seconds(),
        )
        print("NIN_PROVIDER_STATUS_CODE", response_status)
        print("NIN_PROVIDER_RESPONSE", raw_body)
        if response_status >= 400:
            duration_ms = int((time.monotonic() - started) * 1000)
            raise _map_provider_status_error(response_status, raw_body, request_id, duration_ms)
    except NINBVNPortalError as error:
        print("NIN_BALANCE_FAILURE", json.dumps({
            "request_id": request_id,
            "error_code": error.code,
            "provider_status": error.provider_status,
            "message": str(error),
        }))
        raise
    except (urllib.error.URLError, TimeoutError, socket.timeout, OSError, http.client.HTTPException) as error:
        duration_ms = int((time.monotonic() - started) * 1000)
        reason = getattr(error, "reason", error)
        _log_provider_event(
            "balance_network_failure",
            request_id,
            {
                "duration_ms": duration_ms,
                "retryable": True,
                "error_type": type(error).__name__,
                "error": str(reason),
            },
        )
        print("NIN_BALANCE_FAILURE", json.dumps({
            "request_id": request_id,
            "error_type": type(error).__name__,
            "message": str(reason),
        }))
        raise NINBVNPortalError(
            message=_sanitized_unavailable_message(),
            code="provider_unavailable",
            status_code=503,
            retryable=True,
        ) from error

    result = _parse_provider_body(raw_body)
    duration_ms = int((time.monotonic() - started) * 1000)
    _log_provider_event("balance_response", request_id, {"http_status": response_status, "duration_ms": duration_ms, "response": _provider_response_log(result), "response_body": _redact_provider_body(result)})
    if "raw_text_preview" in result:
        raise NINBVNPortalError(
            message="Identity verification currently unavailable.",
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
    balance_result = {
        "success": str(result.get("status", "")).lower() == "success",
        "message": result.get("message") or "",
        "provider_http_status": response_status,
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
        "raw_response_body": raw_body,
    }
    print(("NIN_BALANCE_SUCCESS" if balance_result["success"] else "NIN_BALANCE_FAILURE"), json.dumps({
        "request_id": request_id,
        "provider_http_status": response_status,
        "authenticated": balance_result["success"],
        "balance": balance_result["balance"] if balance_result["success"] else None,
        "message": balance_result["message"],
    }))
    return balance_result


def check_provider_connectivity() -> dict:
    request_id = f"health_{uuid4().hex[:12]}"
    config = ninbvnportal_config()
    api_key_loaded = bool(config.get("api_key"))
    url = f"{config.get('base_url')}/balance"
    if not api_key_loaded:
        _log_provider_event(
            "startup_configuration_failure",
            request_id,
            {
                "url": url,
                "api_key_present": False,
                "env_api_key_loaded": bool(os.getenv("NINBVNPORTAL_API_KEY", "").strip()),
            },
        )
        return {
            "apiKeyLoaded": False,
            "endpointReachable": False,
            "providerAuthStatus": "missing_api_key",
            "lastProviderStatus": None,
            "lastProviderMessage": "NINBVNPORTAL_API_KEY is missing.",
            "providerUrl": f"{config.get('base_url')}/nin-verification",
            "balanceUrl": url,
            "latencyMs": None,
        }
    started = time.monotonic()
    try:
        balance = check_balance()
        return {
            "apiKeyLoaded": True,
            "endpointReachable": bool(balance.get("success")),
            "providerAuthStatus": "authenticated" if balance.get("success") else "unknown",
            "lastProviderStatus": balance.get("provider_http_status") or 200,
            "lastProviderMessage": balance.get("message") or "Provider reachable.",
            "providerUrl": f"{config.get('base_url')}/nin-verification",
            "balanceUrl": url,
            "latencyMs": balance.get("duration_ms"),
        }
    except NINBVNPortalError as error:
        duration_ms = int((time.monotonic() - started) * 1000)
        provider_auth_failed = error.code == "invalid_provider_credentials" or error.provider_status in (401, 403)
        body_message = "Provider authentication failed. Check API credentials." if provider_auth_failed else _provider_message_from_body(error.provider_body or {}, str(error))
        _log_provider_event(
            "health_failure",
            request_id,
            {
                "url": url,
                "duration_ms": duration_ms,
                "error_code": error.code,
                "provider_status": error.provider_status,
                "provider_message": body_message,
                "response_body": _redact_provider_body(error.provider_body or {}),
            },
        )
        return {
            "apiKeyLoaded": True,
            "endpointReachable": False,
            "providerAuthStatus": "failed" if provider_auth_failed else "unknown",
            "lastProviderStatus": error.provider_status,
            "lastProviderMessage": body_message,
            "providerUrl": f"{config.get('base_url')}/nin-verification",
            "balanceUrl": url,
            "latencyMs": duration_ms,
        }
