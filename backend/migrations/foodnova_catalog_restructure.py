"""Run the FoodNova catalog restructure against the configured database.

This script is idempotent. It creates missing variant/order columns through the
application startup schema helper, syncs the new catalog, and leaves existing
orders and packs untouched.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import Base, SessionLocal, engine
from main import ensure_database_compatibility, json_dump, sync_foodnova_catalog


def main():
    Base.metadata.create_all(bind=engine)
    ensure_database_compatibility()
    db = SessionLocal()
    try:
        report = sync_foodnova_catalog(db)
        db.commit()
        print(json_dump(report))
    finally:
        db.close()


if __name__ == "__main__":
    main()
