import json
import os
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Optional


DEFAULT_CHECKMYNINBVN_BASE_URL = "https://checkmyninbvn.com.ng/api"


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


def _map_provider_http_error(error: urllib.error.HTTPError) -> CheckMyNINBVNError:
    try:
        body = error.read().decode("utf-8")
        data = json.loads(body) if body else {}
    except Exception:
        data = {}

    provider_message = _provider_message(data, "NIN verification failed.")
    lower_message = provider_message.lower()

    if error.code in (401, 403) or "api key" in lower_message or "credential" in lower_message:
        return CheckMyNINBVNError(
            message="NIN verification is temporarily unavailable. FoodNova support has been notified.",
            code="invalid_provider_credentials",
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
            message="NIN verification is busy right now. Please retry in a few minutes.",
            code="provider_rate_limited",
            status_code=503,
            retryable=True,
            provider_status=error.code,
        )
    if error.code >= 500:
        return CheckMyNINBVNError(
            message="NIN verification provider is unavailable. Please try again shortly.",
            code="provider_unavailable",
            status_code=503,
            retryable=True,
            provider_status=error.code,
        )
    return CheckMyNINBVNError(
        message=provider_message or "NIN verification failed. Please check the number and try again.",
        code="provider_rejected_request",
        status_code=400,
        retryable=False,
        provider_status=error.code,
    )


def verify_nin(nin_number: str, consent: bool = True) -> dict:
    nin = "".join(ch for ch in str(nin_number or "") if ch.isdigit())
    if len(nin) != 11:
        raise CheckMyNINBVNError("NIN must be exactly 11 digits.", code="invalid_nin", status_code=422)
    if consent is not True:
        raise CheckMyNINBVNError("Consent is required before NIN verification.", code="consent_required", status_code=422)

    validation = validate_checkmyninbvn_config()
    if not validation["configured"]:
        _raise_config_error(validation["message"])

    config = checkmyninbvn_config()
    payload = json.dumps({"number": nin, "consent": True}).encode("utf-8")
    request = urllib.request.Request(
        f"{config['base_url']}/nin-verification",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-api-key": config["api_key"],
            "Authorization": f"Bearer {config['api_key']}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            raw_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        raise _map_provider_http_error(error) from error
    except (urllib.error.URLError, TimeoutError, socket.timeout) as error:
        raise CheckMyNINBVNError(
            message="NIN verification provider is unavailable. Please try again shortly.",
            code="provider_unavailable",
            status_code=503,
            retryable=True,
        ) from error
    except Exception as error:
        raise CheckMyNINBVNError(
            message="NIN verification could not be completed right now. Please try again shortly.",
            code="provider_error",
            status_code=503,
            retryable=True,
        ) from error

    try:
        result = json.loads(raw_body)
    except json.JSONDecodeError as error:
        raise CheckMyNINBVNError(
            message="NIN verification returned an invalid response. Please try again shortly.",
            code="invalid_provider_response",
            status_code=503,
            retryable=True,
        ) from error

    status = str(result.get("status", "")).lower()
    verified = status == "success"
    data = result.get("data") or {}
    return {
        "verified": verified,
        "message": result.get("message") or ("NIN verified successfully." if verified else "NIN verification failed."),
        "report_id": result.get("reportID") or result.get("report_id") or "",
        "provider_status": status,
        "data": {
            "first_name": data.get("firstname") or data.get("first_name") or "",
            "middle_name": data.get("middlename") or data.get("middle_name") or "",
            "surname": data.get("surname") or data.get("lastname") or "",
            "phone": data.get("telephoneno") or data.get("phone") or "",
            "gender": data.get("gender") or "",
            "birthdate": data.get("birthdate") or data.get("dob") or "",
            "photo": data.get("photo") or "",
        },
    }
