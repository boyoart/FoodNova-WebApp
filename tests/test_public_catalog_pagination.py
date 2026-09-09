import os
import inspect
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


class PublicCatalogPaginationTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        main.Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)
        db = self.Session()
        products = [
            main.DBProduct(
                name=f"Product {index:02d}",
                category="Rice" if index <= 12 else "Beans",
                category_name="Rice" if index <= 12 else "Beans",
                price=1000 + index,
                stock_qty=5,
                stock=5,
                is_active=True,
            )
            for index in range(1, 24)
        ]
        products.append(main.DBProduct(name="Archived", price=50, stock_qty=5, stock=5, is_active=False))
        packs = [
            main.DBPack(name=f"Pack {index:02d}", price=2000 + index, is_active=True)
            for index in range(1, 13)
        ]
        packs.append(main.DBPack(name="Archived Pack", price=1, is_active=False))
        db.add_all(products + packs)
        db.commit()
        db.close()
        self.session_patch = patch.object(main, "SessionLocal", self.Session)
        self.session_patch.start()

    def tearDown(self):
        self.session_patch.stop()

    def test_products_are_paginated_in_stable_ten_item_pages(self):
        first = main.list_products(page=1, page_size=10)
        second = main.list_products(page=2, page_size=10)
        third = main.list_products(page=3, page_size=10)

        self.assertEqual(len(first["items"]), 10)
        self.assertEqual(len(second["items"]), 10)
        self.assertEqual(len(third["items"]), 3)
        self.assertEqual(first["total"], 23)
        self.assertEqual(first["total_pages"], 3)
        self.assertTrue(set(item["id"] for item in first["items"]).isdisjoint(item["id"] for item in second["items"]))

    def test_search_and_category_are_applied_before_pagination(self):
        result = main.list_products(search="Product", category="Rice", page=1, page_size=10)
        self.assertEqual(result["total"], 12)
        self.assertEqual(len(result["items"]), 10)
        self.assertTrue(all(item["category"] == "Rice" for item in result["items"]))

    def test_legacy_unpaginated_contract_remains_a_list(self):
        result = main.list_products(search="Product 01")
        self.assertIsInstance(result, list)
        self.assertEqual([item["name"] for item in result], ["Product 01"])

    def test_inactive_catalog_entries_are_excluded(self):
        products = main.list_products(page=1, page_size=100)
        packs = main.list_packs(page=1, page_size=100)
        self.assertNotIn("Archived", [item["name"] for item in products["items"]])
        self.assertNotIn("Archived Pack", [item["name"] for item in packs["items"]])

    def test_inactive_product_cannot_be_loaded_by_public_detail_id(self):
        db = self.Session()
        archived_id = db.query(main.DBProduct).filter(main.DBProduct.name == "Archived").one().id
        db.close()
        with self.assertRaises(HTTPException) as raised:
            main.get_product(archived_id)
        self.assertEqual(raised.exception.status_code, 404)

    def test_public_route_does_not_expose_admin_catalog_switches(self):
        parameters = inspect.signature(main.list_products).parameters
        self.assertNotIn("include_inactive", parameters)
        self.assertNotIn("admin_view", parameters)

    def test_available_variant_makes_parent_available_without_affecting_sibling(self):
        db = self.Session()
        product = main.DBProduct(
            name="Mixed Rice",
            category="Rice",
            price=4000,
            stock_qty=3,
            stock=3,
            is_active=True,
        )
        db.add(product)
        db.flush()
        db.add_all([
            main.DBProductVariant(
                product_id=product.id,
                sku="MIXED-2KG",
                weight="2kg",
                price=4000,
                stock_qty=3,
                stock=3,
                is_active=True,
            ),
            main.DBProductVariant(
                product_id=product.id,
                sku="MIXED-5KG",
                weight="5kg",
                price=8000,
                stock_qty=0,
                stock=0,
                is_active=True,
            ),
        ])
        db.commit()
        product_id = product.id
        db.close()

        payload = main.get_product(product_id)
        variants = {variant["weight"]: variant for variant in payload["variants"]}
        self.assertTrue(payload["is_available"])
        self.assertTrue(variants["2kg"]["is_available"])
        self.assertFalse(variants["5kg"]["is_available"])
        self.assertNotIn("stock_qty", payload)
        self.assertNotIn("stock_qty", variants["2kg"])

    def test_all_unavailable_variants_make_parent_out_of_stock(self):
        db = self.Session()
        product = main.DBProduct(name="Empty Beans", price=1000, stock_qty=0, stock=0, is_active=True)
        db.add(product)
        db.flush()
        db.add(main.DBProductVariant(
            product_id=product.id,
            sku="EMPTY-1KG",
            weight="1kg",
            price=1000,
            stock_qty=0,
            stock=0,
            is_active=True,
        ))
        db.commit()
        product_id = product.id
        db.close()

        self.assertFalse(main.get_product(product_id)["is_available"])

    def test_admin_catalog_can_inspect_archived_product(self):
        result = main._list_products(search="Archived", include_inactive=True, admin_view=True)
        self.assertEqual([item["name"] for item in result], ["Archived"])
        self.assertIn("stock_qty", result[0])

    def test_packs_use_the_same_server_pagination_contract(self):
        first = main.list_packs(page=1, page_size=10)
        second = main.list_packs(page=2, page_size=10)
        self.assertEqual(len(first["items"]), 10)
        self.assertEqual(len(second["items"]), 2)
        self.assertEqual(first["total_pages"], 2)

    def test_invalid_pagination_is_rejected(self):
        with self.assertRaises(HTTPException) as raised:
            main.list_products(page=0, page_size=10)
        self.assertEqual(raised.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
