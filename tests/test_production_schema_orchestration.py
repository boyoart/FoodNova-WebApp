import sys
from pathlib import Path
from unittest.mock import MagicMock, patch


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts import apply_product_images_migration as images  # noqa: E402
from scripts import apply_production_schema_migrations as orchestration  # noqa: E402
from scripts import apply_password_reset_migration as password_reset  # noqa: E402


def test_product_image_migration_is_idempotent_and_preserves_catalog_fields():
    assert "CREATE TABLE IF NOT EXISTS product_images" in images.CREATE_SQL
    assert "CREATE INDEX IF NOT EXISTS" in images.INDEX_SQL
    assert "NOT EXISTS" in images.BACKFILL_SQL
    assert "p.image_url" in images.BACKFILL_SQL
    combined = " ".join((images.CREATE_SQL, images.INDEX_SQL, images.ID_INDEX_SQL, images.BACKFILL_SQL)).lower()
    for forbidden in ("update products", "delete from products", "stock_qty", " price ", "is_active"):
        assert forbidden not in combined


def test_orchestration_runs_known_migrations_before_final_verification():
    connection = MagicMock()
    context = MagicMock()
    context.__enter__.return_value = connection
    fake_engine = MagicMock()
    fake_engine.connect.return_value.execution_options.return_value = context
    reports = [{"has_drift": True}, {"has_drift": False}]
    with patch.object(orchestration, "engine", fake_engine), \
         patch.object(orchestration, "build_schema_report", side_effect=reports), \
         patch.object(orchestration.order_schema, "validate_definitions_match_models"), \
         patch.object(orchestration.legacy_indexes, "validate_expected_indexes_match_models"), \
         patch.object(orchestration.product_images, "validate_definition_matches_models"), \
         patch.object(orchestration.password_reset, "validate_definition_matches_models"), \
         patch.object(orchestration.order_schema, "require_postgresql"), \
         patch.object(orchestration.order_schema, "run_migration") as order_run, \
         patch.object(orchestration.product_images, "run_migration") as image_run, \
         patch.object(orchestration.password_reset, "run_migration") as password_reset_run, \
         patch.object(orchestration.legacy_indexes, "missing_indexes", return_value=[]), \
         patch.object(sys, "argv", ["migration", "--confirm-production-schema-migration", "--confirm-recent-backup"]):
        assert orchestration.main() == 0
        order_run.assert_called_once_with()
        image_run.assert_called_once_with()
        password_reset_run.assert_called_once_with()


def test_password_reset_migration_is_idempotent_and_data_safe():
    assert "ADD COLUMN IF NOT EXISTS session_version" in password_reset.ADD_SESSION_VERSION_SQL
    assert "CREATE TABLE IF NOT EXISTS password_reset_tokens" in password_reset.CREATE_TABLE_SQL
    assert "WHERE session_version IS NULL" in password_reset.BACKFILL_SESSION_VERSION_SQL
    combined = " ".join((
        password_reset.ADD_SESSION_VERSION_SQL,
        password_reset.BACKFILL_SESSION_VERSION_SQL,
        password_reset.CREATE_TABLE_SQL,
        *password_reset.INDEX_SQL,
    )).lower()
    for forbidden in ("delete from users", "update products", "stock_qty", "product price"):
        assert forbidden not in combined


def test_orchestration_fails_when_genuine_drift_remains():
    unresolved = {"has_drift": True, "missing_tables": ["unknown_table"]}
    with patch.object(orchestration, "build_schema_report", side_effect=[unresolved, unresolved]), \
         patch.object(orchestration, "run_all"), \
         patch.object(sys, "argv", ["migration", "--confirm-production-schema-migration", "--confirm-recent-backup"]):
        try:
            orchestration.main()
            assert False, "expected unresolved drift to fail deployment"
        except RuntimeError as error:
            assert "unresolved drift remains" in str(error)
