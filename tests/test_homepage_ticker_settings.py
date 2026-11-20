import os
import sys
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
    app.get('/admin/website-settings')(main.get_admin_website_settings)
    app.patch('/admin/website-settings')(main.update_admin_website_settings)
    actor = {'id': 1, 'role': 'admin', 'admin_role': 'broadcast_manager'}
    with patch.object(main, 'SessionLocal', sessions), \
            patch.object(main, 'require_any_permission', return_value=actor), \
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
