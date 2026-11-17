"""Offline safety checks. Never connect to a staging or production database."""
import importlib.util
from pathlib import Path
from unittest.mock import patch

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / 'backend/scripts/rehearse_customer_security.py'
spec = importlib.util.spec_from_file_location('staging_rehearsal', SCRIPT)
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


def environment():
    return {
        'STAGING_RESOURCE_NAME': 'foodnova-staging-db',
        'STAGING_ISOLATION_CONFIRMED': 'yes',
        'STAGING_WRITERS_PAUSED': 'yes',
        'STAGING_DATABASE_URL': 'postgresql://fixture:fixture@staging.invalid/foodnova_staging?sslmode=require',
        'EXPECTED_STAGING_HOST': 'staging.invalid',
        'EXPECTED_STAGING_DATABASE': 'foodnova_staging',
    }


def test_default_does_not_connect(capsys):
    with patch.object(r, 'create_engine', side_effect=AssertionError('connection')):
        assert r.main([]) == 0
    assert 'NOT EXECUTED' in capsys.readouterr().out


@pytest.mark.parametrize('key,value', [
    ('STAGING_RESOURCE_NAME', 'foodnova'),
    ('STAGING_ISOLATION_CONFIRMED', ''),
    ('STAGING_WRITERS_PAUSED', ''),
    ('EXPECTED_STAGING_HOST', 'other.invalid'),
    ('EXPECTED_STAGING_DATABASE', 'foodnova'),
    ('STAGING_DATABASE_URL', ''),
    ('STAGING_DATABASE_URL', 'sqlite:///:memory:'),
    ('STAGING_DATABASE_URL', 'postgresql://fixture:fixture@staging.invalid/foodnova_staging'),
    ('STAGING_DATABASE_URL', 'postgresql://fixture:fixture@staging.invalid/foodnova_staging?sslmode=disable'),
    ('STAGING_DATABASE_URL', 'postgresql://fixture:fixture@staging.invalid/foodnova_staging?sslmode=require&host=other.invalid'),
    ('STAGING_DATABASE_URL', 'postgresql://fixture:fixture@staging.invalid/foodnova_staging?sslmode=require&dbname=foodnova'),
])
def test_unsafe_identity_rejected_before_connection(key, value):
    env = environment()
    env[key] = value
    with patch.dict(r.os.environ, env, clear=True), patch.object(r, 'create_engine', side_effect=AssertionError('connection')) as connect:
        assert r.main(['--execute']) == 1
    connect.assert_not_called()


def test_application_database_url_is_never_a_fallback():
    env = environment()
    env.pop('STAGING_DATABASE_URL')
    env['DATABASE_URL'] = 'postgresql://fixture:fixture@production.invalid/foodnova'
    with pytest.raises(Exception):
        r.staging_url(env)


def test_reviewed_migration_hash_and_no_application_imports():
    module = r.load_migration()
    assert callable(module.migrate) and callable(module.verify)
    source = SCRIPT.read_text()
    assert 'from models' not in source and 'from database' not in source


def test_pinned_staging_url():
    url = r.staging_url(environment())
    assert url.database == 'foodnova_staging'
    assert url.drivername == 'postgresql+psycopg2'


def test_cli_scopes_and_restores_existing_environment():
    module = r.load_migration()
    url = r.staging_url(environment())
    with patch.dict(r.os.environ, {'DATABASE_URL': 'do-not-use'}, clear=True), patch.object(module, 'main', return_value=0) as call:
        r.cli(module, url, '--verify')
        call.assert_called_once_with(['--verify'])
        assert r.os.environ['DATABASE_URL'] == 'do-not-use'


@pytest.mark.parametrize('key,value', [('PGHOSTADDR', '192.0.2.1'), ('PGSERVICE', 'production'), ('EXPECTED_STAGING_PORT', '5433')])
def test_libpq_overrides_and_wrong_port_rejected(key, value):
    env = environment()
    env[key] = value
    with pytest.raises(ValueError):
        r.staging_url(env)
