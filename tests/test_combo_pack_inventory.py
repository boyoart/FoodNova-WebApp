import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{ROOT / 'test_foodnova_contracts.db'}")

import main  # noqa: E402


class ComboPackInventoryTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        main.Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()
        self.rice = main.DBProduct(name="Inventory Rice", stock_qty=20, stock=20, stock_unit="kg", is_active=True)
        self.beans = main.DBProduct(name="Inventory Beans", stock_qty=10, stock=10, stock_unit="kg", is_active=True)
        self.db.add_all([self.rice, self.beans])
        self.db.flush()
        self.first_pack = self.make_pack(
            "Starter Combo",
            [(self.rice, 2, "kg"), (self.beans, 1, "kg")],
        )
        self.second_pack = self.make_pack("Gift Combo", [(self.rice, 3, "kg")])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def make_pack(self, name, components):
        pack = main.DBPack(name=name, price=2000, is_active=True)
        self.db.add(pack)
        self.db.flush()
        for product, quantity, unit in components:
            self.db.add(main.DBComboPackComponent(
                pack_id=pack.id,
                product_id=product.id,
                quantity_per_pack=quantity,
                unit=unit,
            ))
        self.db.flush()
        return pack

    def test_customer_pack_contract_returns_real_contents_and_calculated_availability(self):
        self.rice.stock_qty = self.rice.stock = 10
        self.beans.stock_qty = self.beans.stock = 3
        self.db.flush()

        payload = main.pack_to_dict(self.first_pack)

        self.assertEqual(payload["available_combo_quantity"], 3)
        self.assertTrue(payload["is_available"])
        self.assertEqual(
            {(item["name"], item["quantity_per_pack"], item["unit"]) for item in payload["components"]},
            {("Inventory Rice", 2, "kg"), ("Inventory Beans", 1, "kg")},
        )
        self.assertNotIn("stock_qty", payload["components"][0])

    def test_single_and_multiple_packs_deduct_component_quantities(self):
        single_item = {"item_type": "pack", "product_id": self.first_pack.id, "quantity": 1}
        main.validate_and_deduct_inventory(self.db, [single_item])
        self.assertEqual((self.rice.stock_qty, self.beans.stock_qty), (18, 9))
        self.db.rollback()
        self.db.refresh(self.rice)
        self.db.refresh(self.beans)

        triple_item = {"item_type": "pack", "product_id": self.first_pack.id, "quantity": 3}
        main.validate_and_deduct_inventory(self.db, [triple_item])

        self.assertEqual((self.rice.stock_qty, self.beans.stock_qty), (14, 7))
        self.assertEqual(len(triple_item["_combo_components_snapshot"]), 2)

    def test_mixed_orders_aggregate_individual_and_multiple_pack_components(self):
        order_items = [
            {"item_type": "product", "product_id": self.rice.id, "quantity": 2},
            {"item_type": "pack", "product_id": self.first_pack.id, "quantity": 1},
            {"item_type": "pack", "product_id": self.second_pack.id, "quantity": 1},
        ]

        deductions = main.validate_and_deduct_inventory(self.db, order_items)

        rice_deduction = next(entry for entry in deductions if entry["product_id"] == self.rice.id)
        self.assertEqual(rice_deduction["quantity"], 7)
        self.assertEqual(rice_deduction["combo_pack_names"], ["Gift Combo", "Starter Combo"])
        self.assertEqual(self.rice.stock_qty, 13)
        self.assertEqual(self.beans.stock_qty, 9)

    def test_insufficient_aggregated_stock_rejects_without_partial_deduction(self):
        self.rice.stock_qty = self.rice.stock = 3
        self.beans.stock_qty = self.beans.stock = 10
        self.db.flush()

        with self.assertRaises(HTTPException) as raised:
            main.validate_and_deduct_inventory(self.db, [
                {"item_type": "product", "product_id": self.rice.id, "quantity": 2},
                {"item_type": "pack", "product_id": self.first_pack.id, "quantity": 1},
            ])

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(self.rice.stock_qty, 3)
        self.assertEqual(self.beans.stock_qty, 10)

    def test_legacy_pack_without_components_cannot_deduct_stock(self):
        legacy = main.DBPack(name="Legacy Combo", price=1000, is_active=True)
        self.db.add(legacy)
        self.db.flush()

        with self.assertRaises(HTTPException) as raised:
            main.validate_and_deduct_inventory(self.db, [{"item_type": "pack", "product_id": legacy.id, "quantity": 1}])

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual((self.rice.stock_qty, self.beans.stock_qty), (20, 10))
        self.assertFalse(main.pack_to_dict(legacy)["is_available"])

    def test_second_purchase_of_last_pack_is_rejected(self):
        self.rice.stock_qty = self.rice.stock = 2
        self.beans.stock_qty = self.beans.stock = 1
        self.db.flush()
        item = {"item_type": "pack", "product_id": self.first_pack.id, "quantity": 1}
        main.validate_and_deduct_inventory(self.db, [dict(item)])
        with self.assertRaises(HTTPException):
            main.validate_and_deduct_inventory(self.db, [dict(item)])
        self.assertEqual((self.rice.stock_qty, self.beans.stock_qty), (0, 0))

    def test_reset_script_restores_pack_components_from_snapshot(self):
        import json
        from scripts import reset_foodnova_orders

        snapshot = [{"product_id": self.rice.id, "variant_id": None, "quantity_per_pack": 2}]
        order = main.DBOrder(order_code="FN-RESET-1", status="pending_payment", payment_status="pending_payment")
        self.db.add(order)
        self.db.flush()
        self.db.add(main.DBOrderItem(
            order_id=order.id, pack_id=self.first_pack.id, item_type="pack", name="Starter Combo",
            quantity=3, qty=3, combo_components_snapshot=json.dumps(snapshot),
        ))
        self.db.flush()
        self.db.refresh(order)

        restored = reset_foodnova_orders.restore_inventory(self.db, [order])

        self.assertEqual(restored, 6)
        self.assertEqual(self.rice.stock_qty, 26)

    def test_order_snapshot_restores_original_components_once_after_pack_edit(self):
        submitted = {"item_type": "pack", "product_id": self.first_pack.id, "quantity": 2}
        main.validate_and_deduct_inventory(self.db, [submitted])
        order = main.DBOrder(
            order_code="FN-COMBO-1",
            status="pending_payment",
            payment_status="pending_payment",
        )
        self.db.add(order)
        self.db.flush()
        order_item = main.DBOrderItem(
            order_id=order.id,
            pack_id=self.first_pack.id,
            item_type="pack",
            name=self.first_pack.name,
            quantity=2,
            qty=2,
            combo_components_snapshot=main.json_dump(submitted["_combo_components_snapshot"]),
        )
        self.db.add(order_item)
        self.db.flush()
        self.first_pack.components.clear()
        self.db.flush()
        self.db.add(main.DBComboPackComponent(
            pack_id=self.first_pack.id,
            product_id=self.rice.id,
            quantity_per_pack=5,
            unit="kg",
        ))
        self.db.flush()

        restored = main.restock_order_inventory(self.db, order)
        self.assertEqual(self.rice.stock_qty, 20)
        self.assertEqual(self.beans.stock_qty, 10)
        self.assertEqual([entry["quantity"] for entry in restored], [4, 2])
        self.assertEqual(order_item.combo_components_snapshot, main.json_dump(submitted["_combo_components_snapshot"]))
        self.assertEqual(main.restock_order_inventory(self.db, order), [])

    def test_variant_components_deduct_from_the_selected_variant_inventory(self):
        variant = main.DBProductVariant(
            product_id=self.rice.id,
            sku="INVENTORY-RICE-2KG",
            weight="2kg",
            stock_qty=5,
            stock=5,
            is_active=True,
        )
        self.db.add(variant)
        self.db.flush()
        pack = self.make_pack("Variant Combo", [(self.beans, 1, "kg")])
        pack.components.append(main.DBComboPackComponent(
            product_id=self.rice.id,
            variant_id=variant.id,
            quantity_per_pack=1,
            unit="2kg",
        ))
        self.db.flush()

        main.validate_and_deduct_inventory(self.db, [{"item_type": "pack", "product_id": pack.id, "quantity": 2}])

        self.assertEqual(variant.stock_qty, 3)
        self.assertEqual(self.beans.stock_qty, 8)

    def test_unit_mismatch_is_rejected_when_admin_saves_pack_components(self):
        with self.assertRaises(HTTPException) as raised:
            main.save_combo_pack_components(self.db, self.first_pack, [{
                "product_id": self.rice.id,
                "quantity_per_pack": 1,
                "unit": "litres",
            }])

        self.assertEqual(raised.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
