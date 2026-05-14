import json
import os
import urllib.error
import urllib.request


class CheckMyNINBVNError(Exception):
    pass


def _clean_base_url() -> str:
    return os.getenv("CHECKMYNINBVN_BASE_URL", "https://checkmyninbvn.com.ng/api").rstrip("/")


def verify_nin(nin_number: str, consent: bool = True) -> dict:
    nin = "".join(ch for ch in str(nin_number or "") if ch.isdigit())
    if len(nin) != 11:
        raise CheckMyNINBVNError("NIN must be exactly 11 digits.")
    if consent is not True:
        raise CheckMyNINBVNError("Consent is required before NIN verification.")

    api_key = os.getenv("CHECKMYNINBVN_API_KEY", "").strip()
    if not api_key:
        raise CheckMyNINBVNError("NIN verification is not configured.")

    payload = json.dumps({"nin": nin, "consent": True}).encode("utf-8")
    request = urllib.request.Request(
        f"{_clean_base_url()}/nin-verification",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        try:
            body = error.read().decode("utf-8")
            data = json.loads(body)
            message = data.get("message") or "NIN verification failed."
        except Exception:
            message = "NIN verification failed."
        raise CheckMyNINBVNError(message)
    except Exception as error:
        raise CheckMyNINBVNError("NIN verification service is unavailable.") from error

    try:
        result = json.loads(raw_body)
    except json.JSONDecodeError as error:
        raise CheckMyNINBVNError("NIN verification returned an invalid response.") from error

    verified = str(result.get("status", "")).lower() == "success"
    data = result.get("data") or {}
    return {
        "verified": verified,
        "message": result.get("message") or ("NIN verified successfully." if verified else "NIN verification failed."),
        "report_id": result.get("reportID") or result.get("report_id") or "",
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
