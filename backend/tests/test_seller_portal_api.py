import os
import uuid

import pytest
import requests


# Seller portal API tests + key regressions for BESTIC FASHION
@pytest.fixture(scope="session")
def base_url():
    value = os.environ.get("REACT_APP_BACKEND_URL")
    if not value:
        pytest.skip("REACT_APP_BACKEND_URL missing; cannot run public endpoint tests")
    return value.rstrip("/")


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def _next_status(current_status: str):
    flow = ["New", "Processing", "Shipped", "Delivered", "Returned"]
    if current_status not in flow:
        return "Processing"
    index = flow.index(current_status)
    return flow[(index + 1) % len(flow)]


def test_seller_dashboard_and_tabs_data_load(api_client, base_url):
    dashboard = api_client.get(f"{base_url}/api/seller/dashboard", timeout=20)
    orders = api_client.get(f"{base_url}/api/seller/orders", timeout=20)
    inventory = api_client.get(f"{base_url}/api/seller/inventory", timeout=20)
    payments = api_client.get(f"{base_url}/api/seller/payments/report", timeout=20)

    assert dashboard.status_code == 200
    assert orders.status_code == 200
    assert inventory.status_code == 200
    assert payments.status_code == 200

    dashboard_data = dashboard.json()
    assert isinstance(dashboard_data["total_orders"], int)
    assert "pending_payments" in dashboard_data

    orders_data = orders.json()
    assert isinstance(orders_data, list)
    if orders_data:
        assert "id" in orders_data[0]
        assert "order_status" in orders_data[0]

    inventory_data = inventory.json()
    assert isinstance(inventory_data, list)
    assert len(inventory_data) > 0
    assert "slug" in inventory_data[0]
    assert "stock" in inventory_data[0]

    payments_data = payments.json()
    assert "total_orders" in payments_data
    assert "method_breakdown" in payments_data


def test_order_processing_status_update_persists(api_client, base_url):
    orders_res = api_client.get(f"{base_url}/api/seller/orders", timeout=20)
    assert orders_res.status_code == 200
    orders = orders_res.json()
    assert len(orders) > 0

    target_order = orders[0]
    order_id = target_order["id"]
    original_status = target_order["order_status"]
    next_status = _next_status(original_status)

    patch_res = api_client.patch(
        f"{base_url}/api/seller/orders/{order_id}",
        json={"order_status": next_status},
        timeout=20,
    )
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["id"] == order_id
    assert updated["order_status"] == next_status

    verify_res = api_client.get(f"{base_url}/api/seller/orders", timeout=20)
    assert verify_res.status_code == 200
    verify_order = next(item for item in verify_res.json() if item["id"] == order_id)
    assert verify_order["order_status"] == next_status

    restore_res = api_client.patch(
        f"{base_url}/api/seller/orders/{order_id}",
        json={"order_status": original_status},
        timeout=20,
    )
    assert restore_res.status_code == 200


def test_orders_report_download_csv(api_client, base_url):
    response = api_client.get(f"{base_url}/api/seller/orders/report?format=csv", timeout=20)
    assert response.status_code == 200
    assert "text/csv" in response.headers.get("content-type", "")
    body = response.text
    assert "order_number,customer_name,marketplace,order_status" in body


def test_inventory_stock_update_persists_for_bestic_elegance(api_client, base_url):
    get_res = api_client.get(f"{base_url}/api/seller/inventory", timeout=20)
    assert get_res.status_code == 200
    inventory = get_res.json()
    product = next(item for item in inventory if item["slug"] == "bestic-elegance")
    original_stock = int(product["stock"])
    new_stock = original_stock + 1

    patch_res = api_client.patch(
        f"{base_url}/api/seller/inventory/bestic-elegance",
        json={"stock": new_stock},
        timeout=20,
    )
    assert patch_res.status_code == 200
    patched = patch_res.json()
    assert patched["slug"] == "bestic-elegance"
    assert int(patched["stock"]) == new_stock

    verify_res = api_client.get(f"{base_url}/api/products/bestic-elegance", timeout=20)
    assert verify_res.status_code == 200
    assert int(verify_res.json()["stock"]) == new_stock

    restore_res = api_client.patch(
        f"{base_url}/api/seller/inventory/bestic-elegance",
        json={"stock": original_stock},
        timeout=20,
    )
    assert restore_res.status_code == 200


def test_add_new_product_visible_in_storefront_data(api_client, base_url):
    unique_token = uuid.uuid4().hex[:8]
    product_name = f"TEST Seller Product {unique_token}"
    payload = {
        "name": product_name,
        "description": "TEST product from seller portal API automation",
        "category_slug": "lingerie-sets",
        "price": 1699,
        "mrp": 2399,
        "image_urls": [
            "https://images.unsplash.com/photo-1762195018084-44beb294ce2f?q=80&w=1200&auto=format&fit=crop"
        ],
        "sizes": ["S", "M", "L"],
        "colors": ["Nude", "Black"],
        "stock": 21,
        "is_new": True,
        "is_bestseller": False,
    }

    create_res = api_client.post(f"{base_url}/api/seller/products", json=payload, timeout=20)
    assert create_res.status_code == 200
    created = create_res.json()
    assert created["name"] == product_name
    assert isinstance(created["slug"], str)
    assert created["slug"]

    created_slug = created["slug"]
    detail_res = api_client.get(f"{base_url}/api/products/{created_slug}", timeout=20)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["name"] == product_name
    assert detail["slug"] == created_slug

    list_res = api_client.get(f"{base_url}/api/products", timeout=20)
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert any(item["slug"] == created_slug for item in items)


def test_payments_report_endpoint_contract(api_client, base_url):
    response = api_client.get(f"{base_url}/api/seller/payments/report", timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["total_orders"], int)
    assert isinstance(data["paid_amount"], (int, float))
    assert isinstance(data["method_breakdown"], list)


def test_regression_products_bestic_elegance_returns_200(api_client, base_url):
    response = api_client.get(f"{base_url}/api/products/bestic-elegance", timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert data["slug"] == "bestic-elegance"


def test_regression_newsletter_submit_success_response(api_client, base_url):
    unique_email = f"test_seller_newsletter_{uuid.uuid4().hex[:8]}@example.com"
    response = api_client.post(
        f"{base_url}/api/leads/newsletter",
        json={"email": unique_email},
        timeout=20,
    )
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert data["already_subscribed"] is False
