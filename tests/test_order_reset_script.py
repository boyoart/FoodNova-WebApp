import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from database import Base  # noqa: E402
from models import (  # noqa: E402
    AppSetting,
    DeliveryAssignmentLog,
    DeliveryOffer,
    DeliveryWorker,
    Notification,
    Order,
    OrderItem,
    Product,
    Rider,
    User,
)


class OrderResetScriptTests(unittest.TestCase):
    def setUp(self):
        handle, name = tempfile.mkstemp(suffix=".db")
        os.close(handle)
        self.path = Path(name)
        self.url = f"sqlite:///{self.path.as_posix()}"
        self.engine = create_engine(self.url, connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        db = self.Session()
        customer = User(full_name="Customer", email="customer@example.test", password="hash", role="customer")
        rider_user = User(full_name="Rider", email="rider@example.test", password="hash", role="rider")
        product = Product(name="Test product", stock_qty=8, stock=8)
        db.add_all([customer, rider_user, product])
        db.flush()
        worker = DeliveryWorker(
            user_id=rider_user.id, full_name="Rider", phone="100", email=rider_user.email,
            operational_status="BUSY",
        )
        db.add(worker)
        db.flush()
        db.add(Rider(delivery_worker_id=worker.id, user_id=rider_user.id, email=rider_user.email))
        order = Order(
            order_code="FN-009", customer_email=customer.email,
            delivery_worker_id=worker.id, delivery_status="ASSIGNED",
        )
        db.add(order)
        db.flush()
        db.add_all([
            OrderItem(order_id=order.id, product_id=product.id, name=product.name, quantity=2, qty=2),
            DeliveryOffer(order_id=order.id, order_code=order.order_code, worker_id=worker.id,
                          expires_at=datetime.utcnow() + timedelta(minutes=10)),
            DeliveryAssignmentLog(order_id=order.id, order_code=order.order_code, worker_id=worker.id),
            Notification(order_id=order.id, order_code=order.order_code,
                         user_email=customer.email, customer_email=customer.email,
                         title="Order", message="Created"),
            AppSetting(key="public_order_sequence", value="9"),
        ])
        db.commit()
        db.close()

    def tearDown(self):
        self.engine.dispose()
        self.path.unlink(missing_ok=True)

    def run_reset(self, *args):
        environment = os.environ.copy()
        environment.update({"DATABASE_URL": self.url, "ENVIRONMENT": "test"})
        return subprocess.run(
            [sys.executable, "scripts/reset_foodnova_orders.py", *args],
            cwd=BACKEND, env=environment, capture_output=True, text=True, check=False,
        )

    def test_dry_run_changes_nothing(self):
        result = self.run_reset("--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        db = self.Session()
        self.assertEqual(db.query(Order).count(), 1)
        self.assertEqual(db.query(User).count(), 2)
        self.assertEqual(db.query(Product).count(), 1)
        db.close()

    def test_confirmed_reset_clears_operations_and_preserves_business_data(self):
        result = self.run_reset("--confirm-local-order-reset")
        self.assertEqual(result.returncode, 0, result.stderr)
        db = self.Session()
        self.assertEqual(db.query(Order).count(), 0)
        self.assertEqual(db.query(OrderItem).count(), 0)
        self.assertEqual(db.query(DeliveryOffer).count(), 0)
        self.assertEqual(db.query(DeliveryAssignmentLog).count(), 0)
        self.assertEqual(db.query(Notification).count(), 0)
        self.assertEqual(db.query(User).count(), 2)
        self.assertEqual(db.query(Rider).count(), 1)
        self.assertEqual(db.query(Product).count(), 1)
        self.assertEqual(db.query(Product).one().stock_qty, 10)
        self.assertEqual(db.query(DeliveryWorker).one().operational_status, "ONLINE")
        self.assertEqual(db.query(AppSetting).filter_by(key="public_order_sequence").one().value, "0")
        db.close()


if __name__ == "__main__":
    unittest.main()
