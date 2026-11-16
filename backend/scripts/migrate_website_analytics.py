"""Explicit additive migration: python scripts/migrate_website_analytics.py"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database import engine
from services.analytics_purchase import metadata

if __name__ == '__main__':
    metadata.create_all(engine)
    print('Website analytics purchase ledger ready. No orders changed.')
