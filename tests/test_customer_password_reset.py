import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{ROOT / 'test_foodnova_contracts.db'}")

import main  # noqa: E402
from database import Base  # noqa: E402


def request() -> Request:
    return Request({
        "type": "http",
        "method": "POST",
        "path": "/",
        "headers": [],
        "client": ("127.0.0.1", 5000),
        "server": ("testserver", 80),
        "scheme": "http",
        "query_string": b"",
    })


@pytest.fixture()
def reset_store():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    main.PASSWORD_RESET_RATE_LIMIT.clear()
    with patch.object(main, "SessionLocal", session_factory):
        yield session_factory
    Base.metadata.drop_all(engine)
    engine.dispose()
    main.PASSWORD_RESET_RATE_LIMIT.clear()


def create_customer(session_factory, email="customer@example.com"):
    db = session_factory()
    user = main.DBUser(
        full_name="FoodNova Customer",
        email=email,
        phone="",
        password=main._hash_new_password("old-password"),
        role="customer",
        is_active=True,
        session_version=0,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    user_id = user.id
    db.close()
    return user_id


def request_reset(email, sent_tokens):
    def capture_email(user, token, expires_minutes):
        sent_tokens.append((user.email, token, expires_minutes))
        return {"status": "sent"}

    with patch.object(main, "send_customer_password_reset_email", side_effect=capture_email):
        return main.request_password_reset(
            main.PasswordResetRequestPayload(email=email), request()
        )


def test_valid_request_is_generic_and_stores_only_token_hash(reset_store):
    create_customer(reset_store)
    sent = []
    response = request_reset("customer@example.com", sent)
    assert response == {"success": True, "message": main.PASSWORD_RESET_GENERIC_MESSAGE}
    assert "token" not in response
    assert len(sent) == 1

    db = reset_store()
    stored = db.query(main.DBPasswordResetToken).one()
    assert stored.token_hash == main._token_hash(sent[0][1])
    assert stored.token_hash != sent[0][1]
    assert stored.expires_at > datetime.utcnow()
    db.close()


def test_unknown_email_has_identical_generic_response(reset_store):
    sent = []
    response = request_reset("unknown@example.com", sent)
    assert response == {"success": True, "message": main.PASSWORD_RESET_GENERIC_MESSAGE}
    assert sent == []


def test_request_rate_limit_keeps_generic_response_and_stops_new_email(reset_store):
    create_customer(reset_store)
    sent = []
    responses = [request_reset("customer@example.com", sent) for _ in range(4)]
    assert all(item["message"] == main.PASSWORD_RESET_GENERIC_MESSAGE for item in responses)
    assert len(sent) == main.PASSWORD_RESET_RATE_LIMIT_MAX_REQUESTS


@pytest.mark.parametrize("state", ["invalid", "expired", "used"])
def test_invalid_expired_and_used_tokens_are_rejected(reset_store, state):
    user_id = create_customer(reset_store)
    raw_token = "secure-test-token"
    if state != "invalid":
        db = reset_store()
        db.add(main.DBPasswordResetToken(
            user_id=user_id,
            token_hash=main._token_hash(raw_token),
            expires_at=datetime.utcnow() + (timedelta(minutes=-1) if state == "expired" else timedelta(minutes=10)),
            used_at=datetime.utcnow() if state == "used" else None,
            requested_by="customer",
        ))
        db.commit()
        db.close()
    with pytest.raises(HTTPException) as error:
        main.confirm_password_reset(main.PasswordResetConfirmPayload(
            token=raw_token if state != "invalid" else "not-a-token",
            new_password="new-password",
            confirm_password="new-password",
        ))
    assert error.value.status_code == 400


def test_success_changes_password_consumes_token_and_revokes_existing_session(reset_store):
    user_id = create_customer(reset_store)
    db = reset_store()
    user = db.get(main.DBUser, user_id)
    old_access_token = main.create_access_token(user)
    raw_token = main._issue_customer_password_reset(db, user, "customer")
    db.close()

    response = main.confirm_password_reset(main.PasswordResetConfirmPayload(
        token=raw_token,
        new_password="new-password",
        confirm_password="new-password",
    ))
    assert response["success"] is True

    db = reset_store()
    user = db.get(main.DBUser, user_id)
    stored_reset = db.query(main.DBPasswordResetToken).one()
    assert not main._password_matches("old-password", user.password)
    assert main._password_matches("new-password", user.password)
    assert user.session_version == 1
    assert stored_reset.used_at is not None
    db.close()
    assert main._get_user_from_token(f"Bearer {old_access_token}") is None

    with pytest.raises(HTTPException):
        main.confirm_password_reset(main.PasswordResetConfirmPayload(
            token=raw_token,
            new_password="another-password",
            confirm_password="another-password",
        ))


def test_admin_uses_same_reset_service_and_records_audit(reset_store):
    user_id = create_customer(reset_store)
    sent = []
    audit = []

    def capture_email(user, token, expires_minutes):
        sent.append(token)
        return {"status": "sent"}

    with patch.object(main, "require_permission", return_value={"id": 9, "email": "admin@example.com"}), \
         patch.object(main, "send_customer_password_reset_email", side_effect=capture_email), \
         patch.object(main, "create_admin_audit_log", side_effect=lambda *args, **kwargs: audit.append(args)):
        response = main.admin_customer_password_reset(user_id, request())
    assert response == {"success": True, "message": "Password reset instructions sent."}
    assert len(sent) == 1
    assert len(audit) == 1

    db = reset_store()
    stored = db.query(main.DBPasswordResetToken).one()
    assert stored.requested_by == "admin"
    assert stored.token_hash == main._token_hash(sent[0])
    db.close()


def test_non_admin_cannot_trigger_admin_reset(reset_store):
    user_id = create_customer(reset_store)
    with patch.object(main, "require_permission", side_effect=HTTPException(status_code=403, detail="Forbidden")):
        with pytest.raises(HTTPException) as error:
            main.admin_customer_password_reset(user_id, request())
    assert error.value.status_code == 403
