# Backend Patch Spec — Email OR Phone login for Riders

**Target endpoint:** `POST /delivery/auth/login` (FastAPI, on Render — your repo, not this one)
**Goal:** allow a rider to authenticate with **either** their email **or** phone number, without breaking the
existing phone-only clients. Response shape stays identical (returns the JWT).

> Current behaviour: body requires `phone_number` and validates it as a Nigerian phone; email is rejected
> with `"Enter a valid Nigerian phone number."`. The Rider App already sends email to `/auth/login` as a
> fallback, but that token may not authorize `/delivery/*`. This patch makes the dedicated rider login accept email.

---

## 1. Request model (backward-compatible)

```python
# schemas/delivery_auth.py
from typing import Optional
from pydantic import BaseModel, model_validator

class DeliveryLoginRequest(BaseModel):
    password: str
    # Either identifier works. phone_number kept for backward compatibility.
    phone_number: Optional[str] = None
    email: Optional[str] = None
    identifier: Optional[str] = None  # optional single-field convenience

    @model_validator(mode="after")
    def _at_least_one(self):
        if not (self.phone_number or self.email or self.identifier):
            raise ValueError("Provide email or phone_number")
        return self
```

## 2. Identifier resolution helper

```python
import re

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def split_identifier(req: "DeliveryLoginRequest") -> tuple[Optional[str], Optional[str]]:
    """Return (email, phone_number) from whichever fields were supplied."""
    email = req.email
    phone = req.phone_number
    if req.identifier:
        if EMAIL_RE.match(req.identifier.strip()):
            email = req.identifier.strip()
        else:
            phone = req.identifier.strip()
    return (email.strip().lower() if email else None, phone.strip() if phone else None)
```

## 3. Endpoint logic

```python
@router.post("/delivery/auth/login")
async def delivery_auth_login(req: DeliveryLoginRequest):
    email, phone = split_identifier(req)

    worker = None
    if email:
        worker = await get_delivery_worker_by_email(email)        # existing lookup (used at signup)
    elif phone:
        normalized = normalize_ng_phone(phone)                    # keep existing validation ONLY for phone path
        worker = await get_delivery_worker_by_phone(normalized)

    if not worker:
        # Keep the existing 404 contract the app already handles.
        raise HTTPException(status_code=404, detail="Delivery account not found.")

    if not verify_password(req.password, worker.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password.")

    token = create_access_token(sub=str(worker.id), audience="delivery")  # SAME token you issue today
    return {"success": True, "access_token": token, "worker": serialize_worker(worker)}
```

## 4. Rules / gotchas
- **Only run the Nigerian-phone validator on the phone path.** Do not validate email as a phone (that's the current bug).
- Reuse the **same** email lookup you already use in signup/`check-email`; emails should be stored lowercased/unique.
- Return the **same JWT** (same `sub`/audience) so it keeps working on all `/delivery/*` routes.
- Keep the existing `phone_number`-only payload working (backward compatible) — old app builds won't break.
- 404 for unknown account and 401 for wrong password match what the Rider App already expects.

## 5. Client behavior after this ships
Once deployed, update the Rider App to send email directly to the rider endpoint (one-line change in
`src/api/endpoints.ts` → `smartLogin`): for the email branch call `/delivery/auth/login` with
`{ email, password }` instead of `/auth/login`. Until then, the app's current fallback still works if the
unified token authorizes delivery routes.

## 6. Quick test after deploy
```bash
# email login
curl -s -X POST https://foodnova-webapp.onrender.com/delivery/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rider@example.com","password":"..."}'
# phone login (must still work)
curl -s -X POST https://foodnova-webapp.onrender.com/delivery/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone_number":"080...","password":"..."}'
```
Both should return `{"success":true,"access_token":"..."}`.
