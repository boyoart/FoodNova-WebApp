"""Explicit additive migration. Never run against production without approval."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database import engine
from services.order_tracking import metadata

if __name__ == '__main__':
    metadata.create_all(engine)
    print('Secure tracking capability and abuse-limit tables ready. No orders changed.')
