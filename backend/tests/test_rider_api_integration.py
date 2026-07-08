"""
FoodNova Dispatch Rider – READ-ONLY integration tests against the LIVE
production backend (https://foodnova-webapp.onrender.com).

STRICT RULES enforced in this suite:
  * Only ONE write call is allowed by the review request: POST /delivery/auth/login.
  * Every other endpoint hit here is a GET.
  * No status changes, no accept/decline, no proof, no go-online/offline,
    no location-ping, no panic-alert.

The purpose is to confirm the response SHAPES the app depends on after
the main-agent's field-mapping fixes:
  - approval_status at TOP LEVEL of /delivery/me (not nested in `worker`)
  - stats object keys + confirm NO earnings fields
  - offers array shape
  - orders unfiltered vs ?status filter behaviour (server ignores filter)
  - order card / tracking / PIN field mapping on the live in-flight order
"""

import os
import re
import pytest
import requests


BASE_URL = "https://foodnova-webapp.onrender.com"

RIDER_PHONE = "08034622339"
RIDER_PASSWORD = "Spider1234#"

TIMEOUT = 30  # onrender cold-start friendly


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Accept": "application/json"})
    return s


@pytest.fixture(scope="session")
def login_payload(api):
    """One-shot login. Every downstream test reuses this response + token."""
    r = api.post(
        f"{BASE_URL}/delivery/auth/login",
        json={"phone_number": RIDER_PHONE, "password": RIDER_PASSWORD},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:400]}"
    data = r.json()
    return data


@pytest.fixture(scope="session")
def token(login_payload):
    tok = login_payload.get("access_token") or login_payload.get("token")
    assert tok, f"no access_token in login response: keys={list(login_payload.keys())}"
    return tok


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def me(api, auth_headers):
    r = api.get(f"{BASE_URL}/delivery/me", headers=auth_headers, timeout=TIMEOUT)
    assert r.status_code == 200, f"/delivery/me failed: {r.status_code} {r.text[:400]}"
    return r.json()


@pytest.fixture(scope="session")
def orders_unfiltered(api, auth_headers):
    r = api.get(f"{BASE_URL}/delivery/orders", headers=auth_headers, timeout=TIMEOUT)
    assert r.status_code == 200, f"/delivery/orders failed: {r.status_code} {r.text[:400]}"
    return r.json()


# --------------------------------------------------------------------------- #
# 1. AUTH — POST /delivery/auth/login (only allowed write)
# --------------------------------------------------------------------------- #
class TestAuthLogin:
    def test_login_status_and_success_flag(self, login_payload):
        assert login_payload.get("success") is True, f"success!=True: {login_payload}"

    def test_login_returns_jwt_in_access_token(self, login_payload):
        tok = login_payload.get("access_token")
        assert isinstance(tok, str) and tok, "access_token missing/empty"
        # JWT = 3 dot-separated base64url segments
        assert len(tok.split(".")) == 3, f"access_token is not a JWT: {tok[:40]}..."

    def test_login_also_exposes_token_alias(self, login_payload):
        # App's extractToken() reads either. Confirm alias present too.
        alias = login_payload.get("token")
        assert alias, "token alias missing (app fallback path relies on it)"
        assert alias == login_payload.get("access_token"), "token alias != access_token"


# --------------------------------------------------------------------------- #
# 2. APPROVAL MAPPING — /delivery/me top-level approval_status
# --------------------------------------------------------------------------- #
class TestApprovalMapping:
    def test_me_has_top_level_approval_status_active(self, me):
        assert "approval_status" in me, (
            f"approval_status NOT at top level of /delivery/me; keys={list(me.keys())}"
        )
        assert me["approval_status"] == "ACTIVE", (
            f"expected approval_status=ACTIVE, got {me['approval_status']!r}"
        )

    def test_me_has_top_level_kyc_status(self, me):
        assert "kyc_status" in me, (
            f"kyc_status missing at top level; keys={list(me.keys())}"
        )

    def test_top_level_is_preferred_over_nested_worker(self, me):
        # The fix: app reads top-level FIRST. If a nested worker.approval_status
        # exists it must NOT disagree with the top-level ACTIVE value.
        worker = me.get("worker") or {}
        if isinstance(worker, dict) and "approval_status" in worker:
            assert worker["approval_status"] in (None, "ACTIVE", me["approval_status"]), (
                f"nested worker.approval_status ({worker['approval_status']!r}) "
                f"disagrees with top-level ({me['approval_status']!r})"
            )


# --------------------------------------------------------------------------- #
# 3. STATS — /delivery/stats shape + confirm NO earnings fields
# --------------------------------------------------------------------------- #
class TestStats:
    REQUIRED_KEYS = {
        "today_deliveries",
        "completed",
        "active",
        "lifetime_completed",
        "acceptance_rate",
        "average_rating",
    }
    # Any of these appearing would contradict the review's "no earnings exposed" note.
    EARNINGS_KEYS = {
        "earnings",
        "today_earnings",
        "lifetime_earnings",
        "weekly_earnings",
        "balance",
        "wallet",
        "wallet_balance",
        "payout",
        "payout_balance",
    }

    @pytest.fixture(scope="class")
    def stats_root(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/delivery/stats", headers=auth_headers, timeout=TIMEOUT)
        assert r.status_code == 200, f"/delivery/stats failed: {r.status_code} {r.text[:400]}"
        return r.json()

    @pytest.fixture(scope="class")
    def stats(self, stats_root):
        assert isinstance(stats_root, dict), f"stats response not object: {type(stats_root)}"
        assert "stats" in stats_root, (
            f"'stats' object missing at top-level of /delivery/stats response; "
            f"keys={list(stats_root.keys())}"
        )
        s = stats_root["stats"]
        assert isinstance(s, dict), f"stats.stats not object: {type(s)}"
        return s

    def test_stats_has_required_keys(self, stats):
        missing = self.REQUIRED_KEYS - set(stats.keys())
        assert not missing, f"stats object missing required keys: {missing}"

    def test_stats_has_no_earnings_fields(self, stats, stats_root):
        # Neither the wrapper nor the inner object should expose earnings.
        leaked_inner = self.EARNINGS_KEYS & set(stats.keys())
        leaked_outer = self.EARNINGS_KEYS & set(stats_root.keys())
        assert not leaked_inner and not leaked_outer, (
            f"earnings-like fields leaked: inner={leaked_inner} outer={leaked_outer}"
        )


# --------------------------------------------------------------------------- #
# 4. OFFERS — /delivery/offers
# --------------------------------------------------------------------------- #
class TestOffers:
    def test_offers_success_and_array(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/delivery/offers", headers=auth_headers, timeout=TIMEOUT)
        assert r.status_code == 200, f"/delivery/offers failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        # Response could be either {success, offers:[...]} or a bare list.
        if isinstance(body, dict):
            assert body.get("success") is True, f"offers.success != True: {body}"
            offers = body.get("offers")
        else:
            offers = body
        assert isinstance(offers, list), f"offers is not a list: type={type(offers)}"
        # Review notes it is currently empty; we don't hard-assert length, just log.
        print(f"[offers] count={len(offers)}")


# --------------------------------------------------------------------------- #
# 5. ORDERS + STATUS FILTER BUG
# --------------------------------------------------------------------------- #
def _extract_orders(body):
    """API sometimes returns {orders:[...]}, sometimes a bare list."""
    if isinstance(body, dict):
        for k in ("orders", "data", "results", "items"):
            v = body.get(k)
            if isinstance(v, list):
                return v
        return []
    if isinstance(body, list):
        return body
    return []


class TestOrders:
    def test_unfiltered_orders_returns_at_least_one(self, orders_unfiltered):
        orders = _extract_orders(orders_unfiltered)
        assert len(orders) >= 1, (
            f"unfiltered /delivery/orders returned 0 orders "
            f"(expected in-flight FN-00030). body keys="
            f"{list(orders_unfiltered.keys()) if isinstance(orders_unfiltered, dict) else 'list'}"
        )

    @pytest.mark.parametrize("status", ["active", "completed", "cancelled"])
    def test_status_filter_is_ignored_returns_zero(self, api, auth_headers, status):
        """
        Confirms the documented backend bug: ?status= is IGNORED and returns 0.
        The app compensates by bucketing client-side. If this ever starts
        returning >0, the client-side bucketing becomes redundant.
        """
        r = api.get(
            f"{BASE_URL}/delivery/orders",
            params={"status": status},
            headers=auth_headers,
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, (
            f"/delivery/orders?status={status} failed: {r.status_code} {r.text[:300]}"
        )
        orders = _extract_orders(r.json())
        assert len(orders) == 0, (
            f"status={status} unexpectedly returned {len(orders)} orders — "
            f"filter may now be honored; revisit client-side bucketing."
        )


# --------------------------------------------------------------------------- #
# 6. ORDER FIELD MAPPING — the in-flight FN-00030 order
# --------------------------------------------------------------------------- #
class TestOrderFieldMapping:
    @pytest.fixture(scope="class")
    def order(self, orders_unfiltered):
        orders = _extract_orders(orders_unfiltered)
        assert orders, "no orders to map — cannot verify field mapping"
        return orders[0]

    def test_order_code_present(self, order):
        code = order.get("order_code")
        assert code, f"order_code missing; keys={list(order.keys())}"
        # e.g. FN-00030
        assert re.match(r"^FN-\d+", str(code)), f"order_code shape unexpected: {code!r}"
        print(f"[order] order_code={code}")

    def test_order_status_fields(self, order):
        status = order.get("status") or order.get("order_status")
        assert status, f"neither status nor order_status present; keys={list(order.keys())}"
        print(f"[order] status={status}")

    def test_delivery_status_in_transit_or_similar(self, order):
        ds = order.get("delivery_status")
        assert ds, f"delivery_status missing; keys={list(order.keys())}"
        print(f"[order] delivery_status={ds}")

    def test_total_amount_present(self, order):
        assert "total_amount" in order, f"total_amount missing; keys={list(order.keys())}"
        print(f"[order] total_amount={order['total_amount']}")

    def test_customer_fields(self, order):
        assert order.get("customer_name"), "customer_name missing"
        assert order.get("customer_phone"), "customer_phone missing"

    def test_delivery_address_present(self, order):
        assert order.get("delivery_address"), "delivery_address missing"

    def test_delivery_pin_or_code(self, order):
        # App uses either delivery_pin or delivery_code for the PIN flow.
        pin = order.get("delivery_pin") or order.get("delivery_code")
        assert pin, (
            f"neither delivery_pin nor delivery_code present; "
            f"keys={list(order.keys())}"
        )

    def test_snapshot_has_lat_lng(self, order):
        snap = order.get("delivery_address_snapshot")
        assert isinstance(snap, dict), (
            f"delivery_address_snapshot missing or not object; got {type(snap).__name__}"
        )
        lat = snap.get("latitude")
        lng = snap.get("longitude")
        assert isinstance(lat, (int, float)), f"snapshot.latitude bad: {lat!r}"
        assert isinstance(lng, (int, float)), f"snapshot.longitude bad: {lng!r}"
        print(f"[order] snapshot=({lat},{lng})")
