"""Production-readiness security regressions. Synthetic peers and in-memory DB only."""
import os
from datetime import datetime

import pytest
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.orm import Session
from unittest.mock import patch

from fastapi.testclient import TestClient
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from tests.test_public_order_tracking import setup, lookup
import main
from services import order_tracking as tracking


class SocketPeer:
    def __init__(self, app, host):
        self.app, self.host = app, host

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'http':
            scope = dict(scope, client=(self.host, 43210))
        await self.app(scope, receive, send)


def observed_identity(setup, peer, forwarded, trusted, upstream=None):
    keys = []
    app = setup[3].app
    if upstream is not None:
        app = ProxyHeadersMiddleware(app, trusted_hosts=upstream)
    client = TestClient(SocketPeer(app, peer))
    try:
        with patch.dict(os.environ, {'ORDER_TRACKING_TRUSTED_PROXIES': trusted}), patch.object(tracking, 'limited', side_effect=lambda db, key, secret, **kw: keys.append(key) or False):
            result = lookup(client, headers={'x-forwarded-for': forwarded})
        assert result.status_code == 200
        return next(key for key in keys if key.startswith('public-ip:'))
    finally:
        client.close()


def test_multiple_trusted_hops_resolve_actual_client_not_nearest_proxy(setup):
    assert observed_identity(setup, '10.0.0.9', '192.0.2.99, 198.51.100.7, 10.0.0.8', '10.0.0.0/24') == 'public-ip:198.51.100.7'


def test_ipv6_equivalent_spellings_share_one_ip_budget(setup):
    first = observed_identity(setup, '2001:db8:abcd::7', '192.0.2.1', '')
    second = observed_identity(setup, '2001:0db8:abcd:0:0:0:0:7', '192.0.2.2', '')
    assert first == second


def test_ipv4_mapped_ipv6_and_ipv4_share_one_ip_budget(setup):
    assert observed_identity(setup, '::ffff:198.51.100.7', '', '') == observed_identity(setup, '198.51.100.7', '', '')


def test_validated_uvicorn_client_is_not_parsed_twice(setup):
    assert observed_identity(setup, '10.0.0.9', '192.0.2.99, 198.51.100.7, 10.0.0.8', '', upstream='10.0.0.0/24') == 'public-ip:198.51.100.7'


def test_upstream_wildcard_trust_is_demonstrably_not_an_approved_release_configuration(setup):
    # Evidence for the operational NO-GO gate, not an assertion that this unsafe mode is secure.
    first = observed_identity(setup, '10.0.0.9', '192.0.2.1, 198.51.100.7, 10.0.0.8', '', upstream='*')
    second = observed_identity(setup, '10.0.0.9', '192.0.2.2, 198.51.100.7, 10.0.0.8', '', upstream='*')
    assert first != second


def test_forwarded_duplicate_fields_are_processed_as_one_right_to_left_chain(setup):
    assert observed_identity(setup, '10.0.0.9', 'not-an-ip, 198.51.100.7, 10.0.0.8', '10.0.0.0/24') == 'public-ip:198.51.100.7'
    keys=[]
    client=TestClient(SocketPeer(setup[3].app,'10.0.0.9'))
    try:
        with patch.dict(os.environ,{'ORDER_TRACKING_TRUSTED_PROXIES':'10.0.0.0/24'}), patch.object(tracking,'limited',side_effect=lambda db,key,secret,**kw: keys.append(key) or False):
            result=lookup(client,headers=[('x-forwarded-for','192.0.2.99, 198.51.100.7'),('x-forwarded-for','10.0.0.8')])
        assert result.status_code==200 and 'public-ip:198.51.100.7' in keys
    finally: client.close()


@pytest.mark.parametrize('trusted,forwarded',[
    ('*','198.51.100.7'), ('0.0.0.0/0','198.51.100.7'), ('::/0','198.51.100.7'),
    ('not-a-network','198.51.100.7'), ('10.0.0.0/24',''), ('10.0.0.0/24','10.0.0.8'),
    ('10.0.0.0/24','198.51.100.7, invalid'), ('10.0.0.0/24','198.51.100.7,'),
    ('10.0.0.0/24','2001:db8::1%scope'), ('10.0.0.0/24',','.join(['10.0.0.8']*33)),
    ('10.0.0.0/24','x'*4097),
])
def test_unsafe_application_trust_and_unverifiable_chains_fail_closed(setup,trusted,forwarded,caplog):
    client=TestClient(SocketPeer(setup[3].app,'10.0.0.9'))
    try:
        with patch.dict(os.environ,{'ORDER_TRACKING_TRUSTED_PROXIES':trusted}):
            result=lookup(client,headers={'x-forwarded-for':forwarded})
        assert result.status_code==503
        assert result.headers['cache-control']=='no-store, private'
        assert 'noindex' in result.headers['x-robots-tag']
        assert '198.51.100.7' not in result.text
        assert 'FN-001' not in caplog.text and '10.0.0.9' not in caplog.text
    finally: client.close()


def test_two_clients_behind_same_proxy_have_separate_ip_budgets_but_spoofed_prefix_does_not(setup):
    client=TestClient(SocketPeer(setup[3].app,'10.0.0.9'))
    try:
        with patch.dict(os.environ,{'ORDER_TRACKING_TRUSTED_PROXIES':'10.0.0.0/24'}):
            for i in range(30):
                assert lookup(client,headers={'x-forwarded-for':f'192.0.2.{i+1},198.51.100.7,10.0.0.8'}).status_code==200
            assert lookup(client,headers={'x-forwarded-for':'192.0.2.90,198.51.100.7,10.0.0.8'}).status_code==429
            assert lookup(client,headers={'x-forwarded-for':'192.0.2.91,198.51.100.8,10.0.0.8'}).status_code==200
    finally: client.close()


def test_untrusted_socket_does_not_accept_any_identity_header(setup):
    client=TestClient(SocketPeer(setup[3].app,'198.51.100.7'))
    try:
        with patch.dict(os.environ,{'ORDER_TRACKING_TRUSTED_PROXIES':'10.0.0.0/24'}):
            for i in range(30):
                headers={'x-forwarded-for':f'192.0.2.{i+1}','true-client-ip':'203.0.113.1','cf-connecting-ip':'203.0.113.2','x-real-ip':'203.0.113.3','forwarded':'for=203.0.113.4'}
                assert lookup(client,headers=headers).status_code==200
            assert lookup(client).status_code==429
    finally: client.close()


def seed_budget(db, identity):
    assert db.get_bind().dialect.name=='sqlite'
    tracking.limited(db,identity,main.JWT_SECRET,maximum=300)
    rows=db.execute(select(tracking.limits)).mappings().all()
    assert len(rows)==1
    db.execute(tracking.limits.update().where(tracking.limits.c.key_hash==rows[0]['key_hash']).values(count=300)); db.commit()


def test_network_budget_is_shared_and_other_networks_are_not_blocked(setup):
    seed_budget(setup[0],'public-network:198.51.100.0/24')
    one=TestClient(SocketPeer(setup[3].app,'198.51.100.7'))
    two=TestClient(SocketPeer(setup[3].app,'203.0.113.7'))
    try:
        with patch.dict(os.environ,{'ORDER_TRACKING_TRUSTED_PROXIES':''}):
            assert lookup(one).status_code==429
            assert lookup(two).status_code==200
    finally: one.close(); two.close()


def test_per_reference_budget_is_shared_across_clients_but_not_other_references(setup):
    seed_budget(setup[0],'public-number:FN-001')
    client=TestClient(SocketPeer(setup[3].app,'203.0.113.7'))
    try:
        with patch.dict(os.environ,{'ORDER_TRACKING_TRUSTED_PROXIES':''}):
            assert lookup(client,'001').status_code==429
            assert lookup(client,'FN-002').status_code==404
    finally: client.close()


def test_cms_writes_require_permission_and_survive_new_sessions_and_clients(setup):
    db=setup[0]
    app=FastAPI()
    app.post('/admin/announcements')(main.create_announcement)
    app.patch('/admin/announcements/{announcement_id}')(main.update_announcement)
    app.get('/admin/announcements')(main.get_admin_announcements)
    app.get('/announcements/active')(main.get_active_announcements)
    app.patch('/admin/website-settings')(main.update_admin_website_settings)
    client=TestClient(app)
    payload={'title':'Fixture ticker','message':'Draft text','display_type':'top_bar','is_active':False}
    try:
        assert client.post('/admin/announcements',json=payload).status_code==401
        for actor in [{'role':'customer'},{'role':'admin','admin_role':'stock_manager'}]:
            with patch.object(main,'require_user',return_value=actor):
                assert client.post('/admin/announcements',json=payload).status_code==403
        actor={'id':999,'role':'admin','admin_role':'broadcast_manager','full_name':'Fixture editor','email':'editor@example.test'}
        with patch.object(main,'require_user',return_value=actor):
            created=client.post('/admin/announcements',json=payload)
            assert created.status_code==200
            record_id=created.json()['announcement']['id']
            edited=client.patch(f'/admin/announcements/{record_id}',json={'message':'Persisted revision','priority':80,'is_active':True,'button_link':'/products','start_date':'2000-01-01T00:00:00Z','end_date':'2099-01-01T00:00:00Z'})
            assert edited.status_code==200
            assert client.patch('/admin/website-settings',json={'tickerEnabled':False}).status_code==200
        with Session(bind=db.get_bind()) as fresh:
            row=fresh.get(main.DBAnnouncement,record_id)
            assert row.message=='Persisted revision' and row.priority==80 and row.is_active
            assert row.start_date==datetime(2000,1,1) and row.end_date==datetime(2099,1,1)
            assert main.get_website_settings_from_db(fresh)['tickerEnabled'] is False
            assert fresh.query(main.DBAdminAuditLog).count()==3
        second=TestClient(app)
        try:
            active=second.get('/announcements/active').json()
            assert active['ticker_enabled'] is False
            assert active['announcements'][0]['message']=='Persisted revision'
        finally: second.close()
        with patch.object(main,'require_user',return_value={'role':'customer'}):
            assert client.patch(f'/admin/announcements/{record_id}',json={'message':'Unauthorized overwrite'}).status_code==403
        with Session(bind=db.get_bind()) as fresh:
            assert fresh.get(main.DBAnnouncement,record_id).message=='Persisted revision'
    finally: client.close()
