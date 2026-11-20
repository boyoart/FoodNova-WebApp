import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
os.environ.setdefault('DATABASE_URL', f'sqlite:///{ROOT / "test_foodnova_contracts.db"}')
import main


@pytest.fixture
def client():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    main.Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    app = FastAPI()
    app.get('/announcements/active')(main.get_active_announcements)
    app.get('/admin/announcements')(main.get_admin_announcements)
    app.post('/admin/announcements')(main.create_announcement)
    app.patch('/admin/announcements/{announcement_id}')(main.update_announcement)
    app.delete('/admin/announcements/{announcement_id}')(main.delete_announcement)
    app.get('/admin/website-settings')(main.get_admin_website_settings)
    app.patch('/admin/website-settings')(main.update_admin_website_settings)
    actor = {'id': 1, 'role': 'admin', 'admin_role': 'broadcast_manager'}
    with patch.object(main, 'SessionLocal', sessions), \
            patch.object(main, 'require_any_permission', return_value=actor), \
            patch.object(main, 'require_permission', return_value=actor), \
            patch.object(main, 'create_admin_audit_log'):
        yield TestClient(app)
    engine.dispose()


def test_ticker_defaults_on_and_legacy_settings_normalize_to_on():
    assert main.default_website_settings()['tickerEnabled'] is True
    assert main.normalize_website_settings({'siteName': 'FoodNova'})['tickerEnabled'] is True
    assert main.normalize_website_settings({'tickerEnabled': False})['tickerEnabled'] is False


def test_admin_can_persist_global_ticker_switch_and_public_feed_returns_it(client):
    initial = client.get('/admin/website-settings')
    assert initial.status_code == 200
    assert initial.json()['settings']['tickerEnabled'] is True

    updated = client.patch('/admin/website-settings', json={'tickerEnabled': False})
    assert updated.status_code == 200
    assert updated.json()['settings']['tickerEnabled'] is False
    assert client.get('/admin/website-settings').json()['settings']['tickerEnabled'] is False
    assert client.get('/announcements/active').json()['ticker_enabled'] is False

    client.patch('/admin/website-settings', json={'tickerEnabled': True})
    assert client.get('/announcements/active').json()['ticker_enabled'] is True


def test_starters_are_persisted_editable_and_never_reseeded(client):
    public = client.get('/announcements/active').json()['announcements']
    assert [item['message'] for item in public] == [
        'WELCOME TO FOODNOVA — Your everyday food shopping made easier.',
        'FOOD COMBO PACKS — Explore affordable food packs for individuals and families.',
        'SHOP YOUR ESSENTIALS — Discover Rice, Beans, Garri, Oils and more.',
        'FOODNOVA GIFT PACKS — Share thoughtful food packages with loved ones.',
        'GOOD FOOD. BETTER VALUE. — Discover more with FoodNova.',
    ]
    admin = client.get('/admin/announcements').json()['announcements']
    assert {item['id'] for item in admin} == {item['id'] for item in public}
    first = admin[0]['id']
    assert client.patch(f'/admin/announcements/{first}', json={'message': 'Edited notice', 'priority': 100}).status_code == 200
    assert client.get('/announcements/active').json()['announcements'][0]['message'] == 'Edited notice'
    assert client.patch(f'/admin/announcements/{first}', json={'is_active': False}).status_code == 200
    for item in admin:
        assert client.delete(f"/admin/announcements/{item['id']}").status_code == 200
    assert client.get('/announcements/active').json()['announcements'] == []
    assert client.get('/admin/announcements').json()['announcements'] == []


def test_admin_first_read_initializes_and_disabled_records_stay_disabled(client):
    admin = client.get('/admin/announcements').json()['announcements']
    assert len(admin) == 5
    for item in admin:
        assert client.patch(f"/admin/announcements/{item['id']}", json={'is_active': False}).status_code == 200
    assert client.get('/announcements/active').json()['announcements'] == []
    assert len(client.get('/admin/announcements').json()['announcements']) == 5


def test_existing_custom_notice_takes_precedence_and_is_not_overwritten(client):
    result = client.post('/admin/announcements', json={'title': 'Custom', 'message': 'Custom notice', 'display_type': 'top_bar'})
    assert result.status_code == 200
    assert [item['message'] for item in client.get('/announcements/active').json()['announcements']] == ['Custom notice']
    assert client.patch(f"/admin/announcements/{result.json()['announcement']['id']}", json={'is_active': False}).status_code == 200
    assert client.get('/announcements/active').json()['announcements'] == []


def test_existing_disabled_notice_and_historical_deletion_prevent_seeding(client):
    with main.SessionLocal() as db:
        db.add(main.DBAnnouncement(title='Disabled', message='Do not publish', display_type='top_bar', is_active=False))
        db.commit()
    assert client.get('/announcements/active').json()['announcements'] == []
    assert len(client.get('/admin/announcements').json()['announcements']) == 1


def test_historical_deletion_keeps_empty_cms_empty(client):
    with main.SessionLocal() as db:
        db.add(main.DBAdminAuditLog(action='announcement_deleted', entity_type='announcement'))
        db.commit()
    assert client.get('/announcements/active').json()['announcements'] == []
    assert client.get('/admin/announcements').json()['announcements'] == []


def test_seed_failure_is_explicit_and_rolls_back_marker(client):
    with patch.object(main, 'TICKER_STARTERS', (('Broken', None),)):
        assert client.get('/announcements/active').status_code == 503
    with main.SessionLocal() as db:
        assert db.query(main.DBAppSetting).filter_by(key=main.TICKER_INITIALIZED_KEY).first() is None
    assert len(client.get('/announcements/active').json()['announcements']) == 5


def test_simultaneous_first_reads_create_one_set(tmp_path):
    engine = create_engine(f'sqlite:///{tmp_path / "ticker.db"}', connect_args={'check_same_thread': False, 'timeout': 30})
    main.Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    app = FastAPI()
    app.get('/announcements/active')(main.get_active_announcements)
    try:
        with patch.object(main, 'SessionLocal', sessions):
            def read_feed(_):
                with TestClient(app) as local:
                    return local.get('/announcements/active')
            with ThreadPoolExecutor(max_workers=4) as executor:
                responses = list(executor.map(read_feed, range(4)))
        assert all(response.status_code == 200 and len(response.json()['announcements']) == 5 for response in responses)
        with sessions() as db:
            assert db.query(main.DBAnnouncement).count() == 5
            assert db.query(main.DBAppSetting).filter_by(key=main.TICKER_INITIALIZED_KEY).count() == 1
    finally:
        engine.dispose()
