import os

import pytest
import requests
from dotenv import dotenv_values


# BESTIC public API smoke + integration contract tests
_frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or _frontend_env.get("REACT_APP_BACKEND_URL")

if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL is required for API tests")

BASE_URL = BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def test_brand_info_contract(api_client):
    response = api_client.get(f"{BASE_URL}/api/brand-info", timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "BESTIC FASHION"
    assert isinstance(data["marketplace_availability"], list)
    assert len(data["trust_elements"]) >= 4


def test_categories_contract(api_client):
    response = api_client.get(f"{BASE_URL}/api/categories", timeout=20)
    assert response.status_code == 200
    categories = response.json()
    assert isinstance(categories, list)
    assert len(categories) >= 5
    slugs = [item["slug"] for item in categories]
    assert "bras" in slugs
    assert "western-wear" in slugs


def test_products_list_contract(api_client):
    response = api_client.get(f"{BASE_URL}/api/products", timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["items"], list)
    assert data["count"] == len(data["items"])
    assert len(data["items"]) > 0
    first = data["items"][0]
    assert isinstance(first["slug"], str)
    assert isinstance(first["image_urls"], list)


def test_products_filtered_by_category(api_client):
    response = api_client.get(f"{BASE_URL}/api/products?category=bras", timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert data["count"] > 0
    assert all(item["category_slug"] == "bras" for item in data["items"])


def test_products_filtered_by_tag(api_client):
    response = api_client.get(f"{BASE_URL}/api/products?tag=best-sellers", timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert data["count"] > 0
    assert all(item["is_bestseller"] is True for item in data["items"])


def test_product_details_by_slug_existing(api_client):
    list_response = api_client.get(f"{BASE_URL}/api/products", timeout=20)
    assert list_response.status_code == 200
    first_slug = list_response.json()["items"][0]["slug"]

    response = api_client.get(f"{BASE_URL}/api/products/{first_slug}", timeout=20)
    assert response.status_code == 200
    product = response.json()
    assert product["slug"] == first_slug
    assert isinstance(product["reviews"], list)
    assert len(product["sizes"]) > 0
    assert len(product["colors"]) > 0


def test_product_details_bestic_elegance_slug_required_by_spec(api_client):
    response = api_client.get(f"{BASE_URL}/api/products/bestic-elegance", timeout=20)
    assert response.status_code == 200
    product = response.json()
    assert product["slug"] == "bestic-elegance"


def test_newsletter_subscription_and_duplicate_handling(api_client):
    email = "test_bestic_newsletter@example.com"
    first = api_client.post(f"{BASE_URL}/api/leads/newsletter", json={"email": email}, timeout=20)
    assert first.status_code == 200
    first_data = first.json()
    assert "message" in first_data
    assert isinstance(first_data["already_subscribed"], bool)

    second = api_client.post(f"{BASE_URL}/api/leads/newsletter", json={"email": email}, timeout=20)
    assert second.status_code == 200
    second_data = second.json()
    assert second_data["already_subscribed"] is True


def test_cart_preview_totals_and_validation(api_client):
    list_response = api_client.get(f"{BASE_URL}/api/products", timeout=20)
    assert list_response.status_code == 200
    product = list_response.json()["items"][0]

    payload = {
        "items": [
            {
                "slug": product["slug"],
                "size": product["sizes"][0],
                "color": product["colors"][0],
                "quantity": 2,
            }
        ]
    }
    preview = api_client.post(f"{BASE_URL}/api/cart/preview", json=payload, timeout=20)
    assert preview.status_code == 200
    data = preview.json()
    assert data["currency"] == "INR"
    assert data["subtotal"] == pytest.approx(product["price"] * 2)
    assert data["total"] >= data["subtotal"]

    invalid_payload = {
        "items": [
            {
                "slug": product["slug"],
                "size": "INVALID_SIZE",
                "color": product["colors"][0],
                "quantity": 1,
            }
        ]
    }
    invalid = api_client.post(f"{BASE_URL}/api/cart/preview", json=invalid_payload, timeout=20)
    assert invalid.status_code == 400
    assert "Invalid size" in invalid.json()["detail"]
