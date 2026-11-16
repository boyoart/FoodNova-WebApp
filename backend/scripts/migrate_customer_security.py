"""Additive migration. Default is a plan; --apply explicitly changes the selected DB."""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import inspect, text
from models import EmailVerificationToken, AccountActionLimit

USER_COLUMNS = {
    'account_status': "VARCHAR(24) NOT NULL DEFAULT 'active'",
    'account_status_reason': "TEXT DEFAULT ''",
    'account_deleted_at': 'TIMESTAMP NULL',
    'email_verified_at': 'TIMESTAMP NULL',
    'email_verification_required': 'BOOLEAN NOT NULL DEFAULT FALSE',
}


def migrate(engine):
    with engine.begin() as connection:
        existing = {column['name'] for column in inspect(connection).get_columns('users')}
        for name, ddl in USER_COLUMNS.items():
            if name not in existing:
                connection.execute(text(f'ALTER TABLE users ADD COLUMN {name} {ddl}'))
        if 'account_status' not in existing:
            connection.execute(text("UPDATE users SET account_status = 'deactivated' WHERE is_active = FALSE"))
        order_columns = {column['name'] for column in inspect(connection).get_columns('orders')}
        if 'checkout_request_hash' not in order_columns:
            connection.execute(text('ALTER TABLE orders ADD COLUMN checkout_request_hash VARCHAR(64) NULL'))
        EmailVerificationToken.__table__.create(connection, checkfirst=True)
        AccountActionLimit.__table__.create(connection, checkfirst=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if args.apply:
        from database import engine
        migrate(engine)
        print('Additive customer security migration applied. No accounts marked verified; no transaction records removed.')
    else:
        print('Plan only: add customer status/verification fields, checkout request hash, verification-token and abuse-limit tables. Use --apply after database backup and approval. Rollback requires the reviewed security gates and checkout pause described in CUSTOMER_SECURITY_RELEASE.md; retain additive schema and revoked sessions.')
