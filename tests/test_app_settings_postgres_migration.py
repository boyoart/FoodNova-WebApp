import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier, Event
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DATABASE_URL", "sqlite://")
import main
from scripts.apply_app_settings_unique_index import migrate


@pytest.fixture
def postgres():
    url = os.environ.get("FOODNOVA_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("FOODNOVA_TEST_POSTGRES_URL is not set")
    target = make_url(url)
    if target.host not in ("127.0.0.1", "localhost", "::1") or target.database != "foodnova_ticker_migration_test":
        pytest.fail("PostgreSQL migration tests require the named isolated local database")
    schema = f"ticker_test_{uuid4().hex}"
    control = create_engine(url, isolation_level="AUTOCOMMIT")
    with control.connect() as connection:
        version = connection.execute(text("SHOW server_version_num")).scalar_one()
        if not 180000 <= int(version) < 190000:
            pytest.fail(f"Expected PostgreSQL 18, got server_version_num={version}")
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    try:
        for table in (main.DBAppSetting.__table__, main.DBAnnouncement.__table__, main.DBAdminAuditLog.__table__):
            table.create(engine)
        with engine.begin() as connection:
            connection.execute(text("DROP INDEX ix_app_settings_key"))
        yield engine
    finally:
        engine.dispose()
        with control.connect() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        control.dispose()


def test_migration_is_idempotent_and_initialization_is_concurrent_safe(postgres):
    sessions = sessionmaker(bind=postgres)
    with sessions.begin() as db:
        db.add_all([
            main.DBAppSetting(key="website_settings", value='{"siteName":"Existing"}'),
            main.DBAppSetting(key="delivery_assignment_mode", value="automatic"),
            main.DBAnnouncement(title="Existing", message="Banner", display_type="hero_banner", is_active=True),
            main.DBAnnouncement(title="Inactive", message="Popup", display_type="popup", is_active=False),
            main.DBAdminAuditLog(action="existing_audit", entity_type="announcement"),
        ])
    with postgres.connect() as connection:
        before = {
            table: connection.execute(text(f"SELECT * FROM {table} ORDER BY id")).all()
            for table in ("app_settings", "announcements", "admin_audit_logs")
        }
    with postgres.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        assert migrate(connection, False) == "index_required"
        with pytest.raises(ProgrammingError, match="no unique or exclusion constraint"):
            connection.execute(text("INSERT INTO app_settings (key, value) VALUES ('probe', 'x') ON CONFLICT (key) DO NOTHING"))
        assert migrate(connection, True) == "created"
        assert migrate(connection, True) == "already_present"
        for table, rows in before.items():
            assert connection.execute(text(f"SELECT * FROM {table} ORDER BY id")).all() == rows

    app = FastAPI()
    app.post("/admin/announcements/initialize-ticker")(main.initialize_ticker_announcements)
    with patch.object(main, "SessionLocal", sessions), \
            patch.object(main, "require_permission", return_value={"id": 1}), \
            patch.object(main, "create_admin_audit_log"):
        def initialize(_):
            with TestClient(app) as client:
                return client.post("/admin/announcements/initialize-ticker")
        with ThreadPoolExecutor(max_workers=6) as pool:
            responses = list(pool.map(initialize, range(6)))
    assert all(response.status_code == 200 for response in responses)
    assert sorted(response.json()["status"] for response in responses) == ["already_initialized"] * 5 + ["created"]
    with sessions() as db:
        assert sorted((row.key, row.value) for row in db.query(main.DBAppSetting).all()) == [
            ("delivery_assignment_mode", "automatic"),
            ("homepage_ticker_initialized_v1", "true"),
            ("website_settings", '{"siteName":"Existing"}'),
        ]
        assert db.query(main.DBAnnouncement).filter_by(display_type="top_bar").count() == 5
        assert [(a.title, a.message, a.is_active) for a in db.query(main.DBAnnouncement).filter(
            main.DBAnnouncement.display_type != "top_bar").order_by(main.DBAnnouncement.id)] == [
            ("Existing", "Banner", True), ("Inactive", "Popup", False),
        ]
        assert [row.action for row in db.query(main.DBAdminAuditLog)] == ["existing_audit"]


@pytest.mark.parametrize("with_index", [False, True])
def test_concurrent_first_writes_are_serialized(postgres, with_index):
    if with_index:
        with postgres.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            assert migrate(connection, True) == "created"
    sessions = sessionmaker(bind=postgres)
    with sessions() as first, sessions() as second:
        main.set_app_setting(first, "new_setting", "first")
        second_lock = Event()
        connection = second.connection()
        def watch_insert(_connection, _cursor, statement, _parameters, _context, _executemany):
            if "pg_advisory_xact_lock" in statement:
                second_lock.set()
        event.listen(connection, "before_cursor_execute", watch_insert)
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(main.set_app_setting, second, "new_setting", "second")
            try:
                assert second_lock.wait(10), "Second writer did not reach the lock"
                assert not future.done()
            finally:
                first.commit()
            future.result(timeout=10)
            second.commit()
    with sessions() as db:
        rows = db.query(main.DBAppSetting).filter_by(key="new_setting").all()
        assert len(rows) == 1
        assert rows[0].value == "second"


@pytest.mark.parametrize("with_index", [False, True])
def test_multiple_first_writes_and_category_creation(postgres, with_index):
    if with_index:
        with postgres.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            assert migrate(connection, True) == "created"
    sessions = sessionmaker(bind=postgres)
    barrier = Barrier(6)
    def write(index):
        with sessions.begin() as db:
            barrier.wait(timeout=15)
            main.set_app_setting(db, "shared_setting", str(index))
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(write, range(6)))
    with sessions() as db:
        assert db.query(main.DBAppSetting).filter_by(key="shared_setting").count() == 1

    barrier = Barrier(6)
    def add_category(index):
        with sessions() as db:
            barrier.wait(timeout=15)
            categories = main.load_category_records(db)
            categories.append({"id": index + 1, "name": f"category-{index}"})
            main.save_category_records(db, categories)
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(add_category, range(6)))
    with sessions() as db:
        assert db.query(main.DBAppSetting).filter_by(key=main.PRODUCT_CATEGORIES_KEY).count() == 1
        assert len(main.load_category_records(db)) == 6


@pytest.mark.parametrize("with_index", [False, True])
def test_concurrent_website_updates_preserve_distinct_fields(postgres, with_index):
    if with_index:
        with postgres.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            assert migrate(connection, True) == "created"
    sessions = sessionmaker(bind=postgres)
    app = FastAPI()
    app.patch("/admin/website-settings")(main.update_admin_website_settings)
    barrier = Barrier(2)
    def update(payload):
        with TestClient(app) as client:
            barrier.wait(timeout=15)
            return client.patch("/admin/website-settings", json=payload)
    with patch.object(main, "SessionLocal", sessions), \
            patch.object(main, "require_any_permission", return_value={"id": 1}), \
            patch.object(main, "create_admin_audit_log"):
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(update, [{"siteName": "Concurrent name"}, {"headline": "Concurrent headline"}]))
    assert all(response.status_code == 200 for response in responses)
    with sessions() as db:
        assert db.query(main.DBAppSetting).filter_by(key=main.WEBSITE_SETTINGS_KEY).count() == 1
        settings = main.get_website_settings_from_db(db)
        assert settings["siteName"] == "Concurrent name"
        assert settings["headline"] == "Concurrent headline"


def test_migration_refuses_duplicates_and_index_name_collision(postgres):
    with postgres.begin() as connection:
        connection.execute(text("INSERT INTO app_settings (key, value) VALUES ('duplicate', 'a'), ('duplicate', 'b')"))
    with postgres.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        with pytest.raises(RuntimeError, match="Duplicate or null"):
            migrate(connection, True)
        assert connection.execute(text("SELECT count(*) FROM app_settings")).scalar_one() == 2
    with postgres.begin() as connection:
        connection.execute(text("DELETE FROM app_settings WHERE key = 'duplicate'"))
        connection.execute(text("CREATE INDEX uq_app_settings_key_release_a ON app_settings (value)"))
    with postgres.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        with pytest.raises(RuntimeError, match="not usable"):
            migrate(connection, True)


def test_command_requires_explicit_target_and_backup_confirmation(postgres):
    with postgres.connect() as connection:
        schema = connection.execute(text("SELECT current_schema()")).scalar_one()
    url = os.environ["FOODNOVA_TEST_POSTGRES_URL"]
    target = make_url(url)
    env = {**os.environ, "DATABASE_URL": url, "PGOPTIONS": f"-csearch_path={schema}"}
    command = [sys.executable, str(ROOT / "backend" / "scripts" / "apply_app_settings_unique_index.py")]
    dry_run = subprocess.run(command, env=env, capture_output=True, text=True, check=True)
    assert "index_required" in dry_run.stdout
    refused = subprocess.run(command + ["--apply"], env=env, capture_output=True, text=True)
    assert refused.returncode != 0
    assert "Apply requires exact" in refused.stderr
    missing_schema = command + ["--apply", "--confirm-host", target.host, "--confirm-database", target.database, "--confirm-reviewed-backup"]
    assert subprocess.run(missing_schema, env=env, capture_output=True, text=True).returncode != 0
    confirmed = missing_schema + ["--confirm-schema", schema]
    assert "created" in subprocess.run(confirmed, env=env, capture_output=True, text=True, check=True).stdout
    assert "already_present" in subprocess.run(confirmed, env=env, capture_output=True, text=True, check=True).stdout
