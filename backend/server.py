import logging
import os
import random
import re
import smtplib
import ssl
import uuid
from html import escape
from io import StringIO
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Dict, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

try:
    from motor.motor_asyncio import AsyncIOMotorClient
except ImportError:
    AsyncIOMotorClient = None


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

class InMemoryUpdateResult:
    def __init__(self, matched_count: int):
        self.matched_count = matched_count


class InMemoryCursor:
    def __init__(self, documents: List[dict]):
        self.documents = [dict(item) for item in documents]

    def sort(self, field: str, direction: int):
        reverse = direction == -1
        self.documents.sort(key=lambda item: item.get(field) or "", reverse=reverse)
        return self

    async def to_list(self, _length: int):
        return [dict(item) for item in self.documents]


class InMemoryCollection:
    def __init__(self):
        self.documents: List[dict] = []

    def _matches(self, document: dict, query: dict) -> bool:
        for key, expected in query.items():
            actual = document.get(key)
            if isinstance(expected, dict):
                if "$lte" in expected and not (actual is not None and actual <= expected["$lte"]):
                    return False
            elif actual != expected:
                return False
        return True

    def _apply_projection(self, document: dict, projection: Optional[dict]) -> dict:
        if not projection:
            return dict(document)

        included = {key for key, value in projection.items() if value and key != "_id"}
        if included:
            return {key: document.get(key) for key in included if key in document}

        excluded = {key for key, value in projection.items() if not value}
        return {key: value for key, value in document.items() if key not in excluded}

    async def distinct(self, field: str):
        return list({doc.get(field) for doc in self.documents if field in doc})

    async def insert_many(self, documents: List[dict]):
        self.documents.extend(dict(item) for item in documents)

    async def insert_one(self, document: dict):
        self.documents.append(dict(document))

    def find(self, query: Optional[dict] = None, projection: Optional[dict] = None):
        query = query or {}
        matched = [self._apply_projection(doc, projection) for doc in self.documents if self._matches(doc, query)]
        return InMemoryCursor(matched)

    async def find_one(self, query: dict, projection: Optional[dict] = None):
        for document in self.documents:
            if self._matches(document, query):
                return self._apply_projection(document, projection)
        return None

    async def count_documents(self, query: dict):
        return sum(1 for doc in self.documents if self._matches(doc, query))

    async def update_one(self, query: dict, update: dict):
        for index, document in enumerate(self.documents):
            if self._matches(document, query):
                updated_document = dict(document)
                updated_document.update(update.get("$set", {}))
                self.documents[index] = updated_document
                return InMemoryUpdateResult(matched_count=1)
        return InMemoryUpdateResult(matched_count=0)


class InMemoryDatabase:
    def __init__(self):
        self.categories = InMemoryCollection()
        self.products = InMemoryCollection()
        self.orders = InMemoryCollection()
        self.status_checks = InMemoryCollection()
        self.newsletter_leads = InMemoryCollection()
        self.customers = InMemoryCollection()
        self.customer_sessions = InMemoryCollection()
        self.sellers = InMemoryCollection()
        self.seller_otps = InMemoryCollection()
        self.seller_sessions = InMemoryCollection()


mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")

if mongo_url and db_name and AsyncIOMotorClient:
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
else:
    client = None
    db = InMemoryDatabase()

app = FastAPI(title="BESTIC FASHION API")
api_router = APIRouter(prefix="/api")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower().strip()).strip("-")
    return normalized or f"product-{uuid.uuid4().hex[:6]}"


def normalize_email(value: str) -> str:
    return value.strip().lower()


def generate_otp() -> str:
    return f"{random.randint(100000, 999999)}"


def sanitize_gst(value: str) -> str:
    return value.strip().upper()


ORDER_STATUS_FLOW = ["New", "Processing", "Packed", "Dispatched", "Shipped", "Delivered", "Returned"]


class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    slug: str
    description: str
    image_url: str
    sort_order: int


class ProductReview(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    rating: int = Field(ge=1, le=5)
    comment: str
    verified: bool


class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    slug: str
    name: str
    description: str
    category_slug: str
    price: float
    mrp: float
    image_urls: List[str]
    sizes: List[str]
    colors: List[str]
    is_new: bool
    is_bestseller: bool
    stock: int
    sku: str
    rating: float
    review_count: int
    reviews: List[ProductReview]


class ProductListResponse(BaseModel):
    items: List[Product]
    count: int


class BrandInfo(BaseModel):
    name: str
    established: int
    tagline: str
    highlight: str
    about: str
    marketplace_availability: List[str]
    why_choose_us: List[str]
    trust_elements: List[str]
    hero_image: str


class NewsletterLeadCreate(BaseModel):
    email: EmailStr


class NewsletterLeadResponse(BaseModel):
    message: str
    already_subscribed: bool


class CartItemCreate(BaseModel):
    slug: str
    size: str
    color: str
    quantity: int = Field(default=1, ge=1, le=10)


class CartPreviewCreate(BaseModel):
    items: List[CartItemCreate]


class CartLineItem(BaseModel):
    slug: str
    name: str
    image_url: str
    size: str
    color: str
    quantity: int
    unit_price: float
    line_total: float


class CartPreviewResponse(BaseModel):
    items: List[CartLineItem]
    subtotal: float
    shipping: float
    total: float
    currency: str


class BillingAddress(BaseModel):
    full_name: str = Field(min_length=2)
    phone: str = Field(min_length=10, max_length=20)
    line1: str = Field(min_length=5)
    line2: str = Field(default="")
    city: str = Field(min_length=2)
    state: str = Field(min_length=2)
    pincode: str = Field(min_length=4, max_length=10)
    country: str = Field(default="India")


class CustomerProfile(BaseModel):
    id: str
    name: str
    email: EmailStr
    phone: str
    billing_address: Optional[BillingAddress] = None
    created_at: str


class CustomerRegisterRequest(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=20)
    password: str = Field(min_length=4)
    billing_address: Optional[BillingAddress] = None


class CustomerLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4)


class CustomerBillingUpdateRequest(BaseModel):
    billing_address: BillingAddress


class CustomerAuthResponse(BaseModel):
    message: str
    session_token: str
    customer: CustomerProfile


class CustomerOrderCreate(BaseModel):
    items: List[CartItemCreate]
    payment_method: str = Field(default="COD")
    billing_address: Optional[BillingAddress] = None


class CustomerOrderResponse(BaseModel):
    message: str
    order_id: str
    order_number: str
    total_amount: float


class CustomerOrderSummary(BaseModel):
    id: str
    order_number: str
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    payment_method: str
    payment_status: str
    order_status: str
    total_amount: float
    created_at: str
    items: List[SellerOrderItem]


class SellerProductCreate(BaseModel):
    name: str
    description: str
    category_slug: str
    price: float = Field(gt=0)
    mrp: float = Field(gt=0)
    image_urls: List[str]
    sizes: List[str]
    colors: List[str]
    stock: int = Field(default=20, ge=0)
    is_new: bool = True
    is_bestseller: bool = False


class InventoryUpdate(BaseModel):
    stock: int = Field(ge=0)
    price: Optional[float] = Field(default=None, gt=0)
    mrp: Optional[float] = Field(default=None, gt=0)


class SellerOrderItem(BaseModel):
    slug: str
    name: str
    size: str
    color: str
    quantity: int
    unit_price: float
    line_total: float


class SellerOrder(BaseModel):
    id: str
    order_number: str
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    marketplace: str
    payment_method: str
    payment_status: str
    order_status: str
    total_amount: float
    created_at: str
    items: List[SellerOrderItem]


class SellerOrderStatusUpdate(BaseModel):
    order_status: str


class SellerProfile(BaseModel):
    id: str
    business_name: str
    owner_name: str
    email: EmailStr
    phone: str
    gst_number: str
    business_address: str
    city: str
    state: str
    pincode: str
    status: str
    created_at: str


class SellerRegistrationRequest(BaseModel):
    business_name: str = Field(min_length=2)
    owner_name: str = Field(min_length=2)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=20)
    gst_number: str = Field(min_length=15, max_length=15)
    business_address: str = Field(min_length=10)
    city: str = Field(min_length=2)
    state: str = Field(min_length=2)
    pincode: str = Field(min_length=4, max_length=10)


class SellerOtpVerifyRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=8)


class SellerLoginRequest(BaseModel):
    email: EmailStr


class SellerOtpDispatchResponse(BaseModel):
    message: str
    delivery_channel: str
    debug_otp: Optional[str] = None


class SellerAuthResponse(BaseModel):
    message: str
    session_token: str
    seller: SellerProfile


class SellerDashboardResponse(BaseModel):
    total_orders: int
    new_orders: int
    processing_orders: int
    low_stock_items: int
    total_revenue: float
    pending_payments: float


class PaymentMethodBreakdown(BaseModel):
    payment_method: str
    amount: float
    orders: int


class PaymentReportResponse(BaseModel):
    total_orders: int
    total_revenue: float
    paid_amount: float
    pending_amount: float
    cod_amount: float
    method_breakdown: List[PaymentMethodBreakdown]


def build_seller_profile(document: dict) -> SellerProfile:
    return SellerProfile(**{key: document[key] for key in SellerProfile.model_fields})


def build_customer_profile(document: dict) -> CustomerProfile:
    return CustomerProfile(
        id=document["id"],
        name=document["name"],
        email=document["email"],
        phone=document["phone"],
        billing_address=document.get("billing_address"),
        created_at=document["created_at"],
    )


async def send_seller_otp_email(email: str, otp: str, business_name: Optional[str], purpose: str) -> str:
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_password = os.environ.get("SMTP_PASSWORD")
    sender_email = os.environ.get("SMTP_FROM_EMAIL", smtp_user or "no-reply@besticfashion.local")
    sender_name = os.environ.get("SMTP_FROM_NAME", "BESTIC FASHION")

    if not smtp_host or not smtp_user or not smtp_password:
        logger.info("Seller OTP for %s (%s): %s", email, purpose, otp)
        return "debug"

    safe_business_name = escape(business_name or "Seller")
    safe_purpose = escape(purpose.replace("_", " ").title())
    safe_otp = escape(otp)
    subject = f"BESTIC Seller OTP for {purpose.replace('_', ' ').title()}"

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{sender_name} <{sender_email}>"
    message["To"] = email
    message.set_content(
        "\n".join(
            [
                f"Hello {business_name or 'Seller'},",
                "",
                f"Your BESTIC seller OTP is: {otp}",
                "This OTP is valid for 10 minutes.",
                "Use this OTP to complete your seller verification.",
                "",
                "If you did not request this OTP, please ignore this email.",
            ]
        )
    )
    message.add_alternative(
        f"""\
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f0ea;font-family:Arial,sans-serif;color:#1c1917;">
    <div style="max-width:640px;margin:0 auto;padding:32px 18px;">
      <div style="background:linear-gradient(135deg,#1f2937 0%,#44403c 100%);padding:28px 32px;color:#ffffff;">
        <div style="font-size:12px;letter-spacing:0.35em;text-transform:uppercase;opacity:0.75;">BESTIC FASHION</div>
        <h1 style="margin:14px 0 0;font-size:30px;line-height:1.2;font-weight:700;">Seller Verification Code</h1>
        <p style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#e7e5e4;">
          Premium seller onboarding for orders, inventory, payments and catalog control.
        </p>
      </div>

      <div style="background:#ffffff;padding:32px;border:1px solid #e7e5e4;border-top:none;">
        <p style="margin:0 0 12px;font-size:15px;line-height:1.8;">Hello {safe_business_name},</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#57534e;">
          We received a request for <strong>{safe_purpose}</strong> on your BESTIC seller account.
          Use the verification code below to continue securely.
        </p>

        <div style="margin:28px 0;padding:26px;border:1px solid #d6d3d1;background:#fafaf9;text-align:center;">
          <div style="font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:#78716c;">One-Time Password</div>
          <div style="margin-top:12px;font-size:38px;letter-spacing:0.42em;font-weight:700;color:#111827;">{safe_otp}</div>
          <div style="margin-top:14px;font-size:14px;color:#57534e;">Valid for 10 minutes</div>
        </div>

        <div style="padding:18px 20px;background:#f8f2ed;border-left:4px solid #1f2937;">
          <p style="margin:0;font-size:14px;line-height:1.7;color:#44403c;">
            For your security, never share this OTP with anyone. BESTIC support will never ask for your OTP by call or message.
          </p>
        </div>

        <p style="margin:24px 0 0;font-size:14px;line-height:1.8;color:#57534e;">
          If you did not initiate this request, you can safely ignore this email.
        </p>
      </div>

      <div style="padding:18px 6px 0;text-align:center;color:#78716c;font-size:12px;line-height:1.8;">
        BESTIC FASHION Seller Desk<br />
        Premium innerwear and fashion operations support
      </div>
    </div>
  </body>
</html>
""",
        subtype="html",
    )

    context = ssl.create_default_context()
    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
        server.starttls(context=context)
        server.login(smtp_user, smtp_password)
        server.send_message(message)
    return "email"


async def send_order_status_email(order: dict, next_status: str) -> str:
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_password = os.environ.get("SMTP_PASSWORD")
    sender_email = os.environ.get("SMTP_FROM_EMAIL", smtp_user or "no-reply@besticfashion.local")
    sender_name = os.environ.get("SMTP_FROM_NAME", "BESTIC FASHION")

    if not smtp_host or not smtp_user or not smtp_password:
        logger.info("Order status email skipped for %s (%s)", order.get("order_number"), next_status)
        return "debug"

    customer_name = escape(order.get("customer_name", "Customer"))
    customer_email = order.get("customer_email")
    order_number = escape(order.get("order_number", ""))
    safe_status = escape(next_status)
    item_names = ", ".join(item.get("name", "") for item in order.get("items", []))
    safe_items = escape(item_names or "your order items")

    status_copy = {
        "Packed": "Your order has been packed carefully and is ready for dispatch.",
        "Dispatched": "Your order has been dispatched from our warehouse and handed over for transit.",
        "Shipped": "Your order is now shipped and moving toward your delivery address.",
    }
    detail_line = status_copy.get(next_status, f"Your order status is now updated to {next_status}.")

    message = EmailMessage()
    message["Subject"] = f"BESTIC Order Update: {order.get('order_number')} is {next_status}"
    message["From"] = f"{sender_name} <{sender_email}>"
    message["To"] = customer_email
    message.set_content(
        "\n".join(
            [
                f"Hello {order.get('customer_name', 'Customer')},",
                "",
                f"Order {order.get('order_number')} is now {next_status}.",
                detail_line,
                f"Items: {item_names or 'Your order items'}",
                "",
                "Thank you for shopping with BESTIC FASHION.",
            ]
        )
    )
    message.add_alternative(
        f"""\
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f0ea;font-family:Arial,sans-serif;color:#1c1917;">
    <div style="max-width:640px;margin:0 auto;padding:32px 18px;">
      <div style="background:linear-gradient(135deg,#1f2937 0%,#44403c 100%);padding:28px 32px;color:#ffffff;">
        <div style="font-size:12px;letter-spacing:0.35em;text-transform:uppercase;opacity:0.75;">BESTIC FASHION</div>
        <h1 style="margin:14px 0 0;font-size:28px;line-height:1.2;font-weight:700;">Your Order Is {safe_status}</h1>
      </div>
      <div style="background:#ffffff;padding:32px;border:1px solid #e7e5e4;border-top:none;">
        <p style="margin:0 0 12px;font-size:15px;line-height:1.8;">Hello {customer_name},</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#57534e;">{escape(detail_line)}</p>
        <div style="margin:24px 0;padding:22px;border:1px solid #d6d3d1;background:#fafaf9;">
          <div style="font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#78716c;">Order Number</div>
          <div style="margin-top:8px;font-size:28px;font-weight:700;color:#111827;">{order_number}</div>
          <div style="margin-top:14px;font-size:14px;color:#57534e;">Items: {safe_items}</div>
        </div>
        <p style="margin:20px 0 0;font-size:14px;line-height:1.8;color:#57534e;">
          You will continue receiving updates from BESTIC FASHION as your order moves forward.
        </p>
      </div>
    </div>
  </body>
</html>
""",
        subtype="html",
    )

    context = ssl.create_default_context()
    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
        server.starttls(context=context)
        server.login(smtp_user, smtp_password)
        server.send_message(message)
    return "email"


async def send_customer_order_confirmation_email(order: dict) -> str:
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_password = os.environ.get("SMTP_PASSWORD")
    sender_email = os.environ.get("SMTP_FROM_EMAIL", smtp_user or "no-reply@besticfashion.local")
    sender_name = os.environ.get("SMTP_FROM_NAME", "BESTIC FASHION")

    if not smtp_host or not smtp_user or not smtp_password:
        return "debug"

    item_names = ", ".join(item.get("name", "") for item in order.get("items", []))
    message = EmailMessage()
    message["Subject"] = f"BESTIC Order Confirmed: {order.get('order_number')}"
    message["From"] = f"{sender_name} <{sender_email}>"
    message["To"] = order.get("customer_email")
    message.set_content(
        "\n".join(
            [
                f"Hello {order.get('customer_name')},",
                "",
                f"Your order {order.get('order_number')} has been placed successfully.",
                f"Items: {item_names}",
                f"Total Amount: {order.get('total_amount')}",
                "We will keep sharing the next updates by email.",
            ]
        )
    )
    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
        server.starttls(context=ssl.create_default_context())
        server.login(smtp_user, smtp_password)
        server.send_message(message)
    return "email"


async def send_seller_new_order_email(order: dict, seller_emails: List[str]) -> str:
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_password = os.environ.get("SMTP_PASSWORD")
    sender_email = os.environ.get("SMTP_FROM_EMAIL", smtp_user or "no-reply@besticfashion.local")
    sender_name = os.environ.get("SMTP_FROM_NAME", "BESTIC FASHION")

    unique_seller_emails = sorted({normalize_email(email) for email in seller_emails if email})
    if not unique_seller_emails:
        return "debug"
    if not smtp_host or not smtp_user or not smtp_password:
        return "debug"

    item_names = ", ".join(item.get("name", "") for item in order.get("items", []))
    message = EmailMessage()
    message["Subject"] = f"New Order Received: {order.get('order_number')}"
    message["From"] = f"{sender_name} <{sender_email}>"
    message["To"] = ", ".join(unique_seller_emails)
    message.set_content(
        "\n".join(
            [
                "Hello Seller,",
                "",
                f"A new order has been placed on BESTIC FASHION.",
                f"Order Number: {order.get('order_number')}",
                f"Customer: {order.get('customer_name')}",
                f"Items: {item_names}",
                f"Total: {order.get('total_amount')}",
            ]
        )
    )
    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
        server.starttls(context=ssl.create_default_context())
        server.login(smtp_user, smtp_password)
        server.send_message(message)
    return "email"


async def issue_seller_otp(email: str, purpose: str, payload: dict) -> SellerOtpDispatchResponse:
    otp = generate_otp()
    await db.seller_otps.insert_one(
        {
            "id": str(uuid.uuid4()),
            "email": normalize_email(email),
            "purpose": purpose,
            "otp": otp,
            "payload": payload,
            "status": "pending",
            "created_at": now_iso(),
        }
    )
    delivery_channel = await send_seller_otp_email(email, otp, payload.get("business_name"), purpose)
    return SellerOtpDispatchResponse(
        message="OTP sent successfully. Please verify to continue.",
        delivery_channel=delivery_channel,
        debug_otp=otp if delivery_channel == "debug" else None,
    )


async def get_latest_pending_otp(email: str, purpose: str) -> Optional[dict]:
    records = await db.seller_otps.find(
        {"email": normalize_email(email), "purpose": purpose, "status": "pending"},
        {"_id": 0},
    ).sort("created_at", -1).to_list(20)
    return records[0] if records else None


async def create_seller_session(seller: dict) -> str:
    session_token = uuid.uuid4().hex
    await db.seller_sessions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "session_token": session_token,
            "seller_id": seller["id"],
            "created_at": now_iso(),
        }
    )
    return session_token


async def create_customer_session(customer: dict) -> str:
    session_token = uuid.uuid4().hex
    await db.customer_sessions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "session_token": session_token,
            "customer_id": customer["id"],
            "created_at": now_iso(),
        }
    )
    return session_token


async def require_customer_session(x_customer_session: Optional[str] = Header(default=None)) -> dict:
    if not x_customer_session:
        raise HTTPException(status_code=401, detail="Customer session is required")

    session = await db.customer_sessions.find_one({"session_token": x_customer_session}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid customer session")

    customer = await db.customers.find_one({"id": session["customer_id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=401, detail="Customer account not found")
    return customer


async def require_seller_session(x_seller_session: Optional[str] = Header(default=None)) -> dict:
    if not x_seller_session:
        raise HTTPException(status_code=401, detail="Seller session is required")

    session = await db.seller_sessions.find_one({"session_token": x_seller_session}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid seller session")

    seller = await db.sellers.find_one({"id": session["seller_id"]}, {"_id": 0})
    if not seller:
        raise HTTPException(status_code=401, detail="Seller account not found")
    return seller


SEED_CATEGORIES = [
    {
        "name": "Lingerie Sets",
        "slug": "lingerie-sets",
        "description": "Elegant coordinated sets crafted for confident comfort.",
        "image_url": "https://images.unsplash.com/photo-1762843353007-e198859f36b6?q=80&w=900&auto=format&fit=crop",
        "sort_order": 1,
    },
    {
        "name": "Bras",
        "slug": "bras",
        "description": "Premium support with soft-touch breathable fabrics.",
        "image_url": "https://images.unsplash.com/photo-1657163913996-1f699d732c14?q=80&w=900&auto=format&fit=crop",
        "sort_order": 2,
    },
    {
        "name": "Panties",
        "slug": "panties",
        "description": "Everyday essentials with seamless silhouettes.",
        "image_url": "https://images.unsplash.com/photo-1763692108454-6cfa2b0af5c1?q=80&w=900&auto=format&fit=crop",
        "sort_order": 3,
    },
    {
        "name": "Shapewear",
        "slug": "shapewear",
        "description": "Body-sculpting confidence for special occasions.",
        "image_url": "https://images.pexels.com/photos/32304292/pexels-photo-32304292.jpeg?auto=compress&cs=tinysrgb&w=900",
        "sort_order": 4,
    },
    {
        "name": "Western Wear",
        "slug": "western-wear",
        "description": "Statement staples inspired by global runway trends.",
        "image_url": "https://images.unsplash.com/photo-1663159934337-b23216476684?q=80&w=900&auto=format&fit=crop",
        "sort_order": 5,
    },
    {
        "name": "New Arrivals",
        "slug": "new-arrivals",
        "description": "Fresh edits from the latest premium collection.",
        "image_url": "https://images.unsplash.com/photo-1729808785118-bbfd41d0149c?q=80&w=900&auto=format&fit=crop",
        "sort_order": 6,
    },
    {
        "name": "Best Sellers",
        "slug": "best-sellers",
        "description": "Most loved picks trusted by thousands of shoppers.",
        "image_url": "https://images.unsplash.com/photo-1762195018084-44beb294ce2f?q=80&w=900&auto=format&fit=crop",
        "sort_order": 7,
    },
]

SEED_PRODUCTS = [
    {
        "id": str(uuid.uuid4()),
        "slug": "rose-lace-lingerie-set",
        "name": "Rose Lace Lingerie Set",
        "description": "Delicate lace detailing with feather-soft lining designed for all-day elegance.",
        "category_slug": "lingerie-sets",
        "price": 1299,
        "mrp": 1799,
        "image_urls": [
            "https://images.unsplash.com/photo-1763692108454-6cfa2b0af5c1?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1762843353007-e198859f36b6?q=80&w=1200&auto=format&fit=crop",
        ],
        "sizes": ["S", "M", "L", "XL"],
        "colors": ["Rose Nude", "Ivory", "Soft Black"],
        "is_new": True,
        "is_bestseller": True,
        "stock": 34,
        "sku": "BST-RLLS-001",
        "rating": 4.8,
        "review_count": 186,
        "reviews": [
            {"name": "Aarushi", "rating": 5, "comment": "Fit is perfect and the fabric feels premium.", "verified": True},
            {"name": "Naina", "rating": 4, "comment": "Elegant style with great comfort.", "verified": True},
        ],
    },
    {
        "id": str(uuid.uuid4()),
        "slug": "plunge-everyday-bra",
        "name": "Plunge Everyday Bra",
        "description": "Lightly padded plunge bra with breathable cups and invisible finishing.",
        "category_slug": "bras",
        "price": 899,
        "mrp": 1299,
        "image_urls": [
            "https://images.unsplash.com/photo-1657163913996-1f699d732c14?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1762843353007-e198859f36b6?q=80&w=1200&auto=format&fit=crop",
        ],
        "sizes": ["32B", "34B", "36C", "38C"],
        "colors": ["Beige", "Nude Pink", "Black"],
        "is_new": False,
        "is_bestseller": True,
        "stock": 46,
        "sku": "BST-PEB-002",
        "rating": 4.7,
        "review_count": 241,
        "reviews": [
            {"name": "Sakshi", "rating": 5, "comment": "Great lift and no discomfort.", "verified": True},
            {"name": "Megha", "rating": 4, "comment": "Very flattering neckline.", "verified": True},
        ],
    },
    {
        "id": str(uuid.uuid4()),
        "slug": "seamless-hipster-pack",
        "name": "Seamless Hipster Pack",
        "description": "Ultra-smooth, stretchable panties made to disappear under fitted outfits.",
        "category_slug": "panties",
        "price": 699,
        "mrp": 999,
        "image_urls": [
            "https://images.unsplash.com/photo-1729808785118-bbfd41d0149c?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1763692108454-6cfa2b0af5c1?q=80&w=1200&auto=format&fit=crop",
        ],
        "sizes": ["S", "M", "L", "XL"],
        "colors": ["Powder Nude", "Chocolate", "Black"],
        "is_new": False,
        "is_bestseller": False,
        "stock": 58,
        "sku": "BST-SHP-003",
        "rating": 4.6,
        "review_count": 138,
        "reviews": [
            {"name": "Ritika", "rating": 5, "comment": "No visible lines and amazing comfort.", "verified": True},
            {"name": "Pooja", "rating": 4, "comment": "Soft material and true-to-size.", "verified": True},
        ],
    },
    {
        "id": str(uuid.uuid4()),
        "slug": "sculpt-high-waist-shapewear",
        "name": "Sculpt High-Waist Shapewear",
        "description": "Targeted tummy control with breathable compression and anti-roll support.",
        "category_slug": "shapewear",
        "price": 1499,
        "mrp": 1999,
        "image_urls": [
            "https://images.pexels.com/photos/32304292/pexels-photo-32304292.jpeg?auto=compress&cs=tinysrgb&w=1200",
            "https://images.unsplash.com/photo-1762195018084-44beb294ce2f?q=80&w=1200&auto=format&fit=crop",
        ],
        "sizes": ["S", "M", "L", "XL", "XXL"],
        "colors": ["Sand", "Mocha", "Black"],
        "is_new": True,
        "is_bestseller": True,
        "stock": 27,
        "sku": "BST-SHWS-004",
        "rating": 4.9,
        "review_count": 205,
        "reviews": [
            {"name": "Ishita", "rating": 5, "comment": "Smooth silhouette instantly.", "verified": True},
            {"name": "Lavanya", "rating": 5, "comment": "Perfect hold for occasion wear.", "verified": True},
        ],
    },
    {
        "id": str(uuid.uuid4()),
        "slug": "satin-wrap-western-dress",
        "name": "Satin Wrap Western Dress",
        "description": "A modern wrap silhouette with satin sheen for elevated evening styling.",
        "category_slug": "western-wear",
        "price": 1899,
        "mrp": 2499,
        "image_urls": [
            "https://images.unsplash.com/photo-1663159934337-b23216476684?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1762195018084-44beb294ce2f?q=80&w=1200&auto=format&fit=crop",
        ],
        "sizes": ["XS", "S", "M", "L"],
        "colors": ["Champagne", "Dusty Rose", "Black"],
        "is_new": True,
        "is_bestseller": False,
        "stock": 19,
        "sku": "BST-SWWD-005",
        "rating": 4.7,
        "review_count": 93,
        "reviews": [
            {"name": "Kriti", "rating": 5, "comment": "Looks absolutely luxe.", "verified": True},
            {"name": "Neha", "rating": 4, "comment": "Great fall and quality.", "verified": True},
        ],
    },
    {
        "id": str(uuid.uuid4()),
        "slug": "bestic-elegance",
        "name": "Bestic Elegance Signature Set",
        "description": "Signature premium lingerie set crafted for elevated everyday elegance and comfort.",
        "category_slug": "lingerie-sets",
        "price": 1599,
        "mrp": 2199,
        "image_urls": [
            "https://images.unsplash.com/photo-1762195018084-44beb294ce2f?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1762843353007-e198859f36b6?q=80&w=1200&auto=format&fit=crop",
        ],
        "sizes": ["S", "M", "L", "XL"],
        "colors": ["Nude Blush", "Ivory", "Black"],
        "is_new": True,
        "is_bestseller": True,
        "stock": 24,
        "sku": "BST-ELEG-007",
        "rating": 4.9,
        "review_count": 117,
        "reviews": [
            {"name": "Aditi", "rating": 5, "comment": "Looks and feels premium.", "verified": True},
            {"name": "Kashvi", "rating": 5, "comment": "Excellent fit and finish.", "verified": True},
        ],
    },
    {
        "id": str(uuid.uuid4()),
        "slug": "cotton-comfort-bralette",
        "name": "Cotton Comfort Bralette",
        "description": "Wire-free support with cloud-soft stretch cotton for effortless movement.",
        "category_slug": "bras",
        "price": 799,
        "mrp": 1099,
        "image_urls": [
            "https://images.unsplash.com/photo-1762843353007-e198859f36b6?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1657163913996-1f699d732c14?q=80&w=1200&auto=format&fit=crop",
        ],
        "sizes": ["S", "M", "L", "XL"],
        "colors": ["Ivory", "Nude", "Black"],
        "is_new": False,
        "is_bestseller": True,
        "stock": 39,
        "sku": "BST-CCB-006",
        "rating": 4.5,
        "review_count": 158,
        "reviews": [
            {"name": "Rhea", "rating": 5, "comment": "Everyday favorite for comfort.", "verified": True},
            {"name": "Tanya", "rating": 4, "comment": "Soft and holds shape well.", "verified": True},
        ],
    },
]

BRAND_INFO = {
    "name": "BESTIC FASHION",
    "established": 2016,
    "tagline": "Premium Women’s Lingerie & Western Fashion",
    "highlight": "Trusted Brand Since 2016",
    "about": "BESTIC FASHION is a fast-growing fashion brand delivering stylish and comfortable lingerie, innerwear and western wear for modern women. The brand is recognized as a Flipkart Platinum Seller and is trusted by customers across leading marketplaces.",
    "marketplace_availability": ["Flipkart", "Myntra", "Amazon", "Ajio"],
    "why_choose_us": [
        "Premium Quality Fabric",
        "Trendy Designs",
        "Trusted Online Seller",
        "Affordable Luxury Fashion",
    ],
    "trust_elements": [
        "Secure Payment",
        "Easy Returns",
        "Fast Shipping",
        "Customer Support",
    ],
    "hero_image": "https://images.unsplash.com/photo-1762195018084-44beb294ce2f?q=80&w=2000&auto=format&fit=crop",
}


def build_seed_orders(products: Dict[str, dict]) -> List[dict]:
    order_templates = [
        {
            "order_number": "BST-1001",
            "customer_name": "Ananya Sharma",
            "customer_email": "ananya.sharma.customer@gmail.com",
            "customer_phone": "+91-9890001234",
            "marketplace": "Website",
            "payment_method": "UPI",
            "payment_status": "Paid",
            "order_status": "New",
            "items": [{"slug": "rose-lace-lingerie-set", "size": "M", "color": "Rose Nude", "quantity": 1}],
        },
        {
            "order_number": "BST-1002",
            "customer_name": "Ritika Verma",
            "customer_email": "ritika.verma.customer@gmail.com",
            "customer_phone": "+91-9876001234",
            "marketplace": "Amazon",
            "payment_method": "COD",
            "payment_status": "COD",
            "order_status": "Packed",
            "items": [{"slug": "bestic-elegance", "size": "L", "color": "Nude Blush", "quantity": 1}],
        },
        {
            "order_number": "BST-1003",
            "customer_name": "Sneha Kapoor",
            "customer_email": "sneha.kapoor.customer@gmail.com",
            "customer_phone": "+91-9811002200",
            "marketplace": "Flipkart",
            "payment_method": "Card",
            "payment_status": "Pending",
            "order_status": "Dispatched",
            "items": [
                {"slug": "cotton-comfort-bralette", "size": "M", "color": "Nude", "quantity": 2},
                {"slug": "seamless-hipster-pack", "size": "M", "color": "Chocolate", "quantity": 1},
            ],
        },
    ]

    seed_orders = []
    for template in order_templates:
        line_items = []
        total = 0.0
        for item in template["items"]:
            product = products.get(item["slug"])
            if not product:
                continue

            unit_price = float(product.get("price", 0))
            line_total = round(unit_price * item["quantity"], 2)
            total += line_total
            line_items.append(
                {
                    "slug": product["slug"],
                    "name": product["name"],
                    "size": item["size"],
                    "color": item["color"],
                    "quantity": item["quantity"],
                    "unit_price": unit_price,
                    "line_total": line_total,
                }
            )

        if not line_items:
            continue

        seed_orders.append(
            {
                "id": str(uuid.uuid4()),
                "order_number": template["order_number"],
                "customer_name": template["customer_name"],
                "customer_email": template["customer_email"],
                "customer_phone": template["customer_phone"],
                "marketplace": template["marketplace"],
                "payment_method": template["payment_method"],
                "payment_status": template["payment_status"],
                "order_status": template["order_status"],
                "total_amount": round(total, 2),
                "created_at": now_iso(),
                "updated_at": now_iso(),
                "items": line_items,
            }
        )

    return seed_orders


async def seed_catalog_if_needed() -> None:
    existing_categories = set(await db.categories.distinct("slug"))
    missing_categories = [item for item in SEED_CATEGORIES if item["slug"] not in existing_categories]
    if missing_categories:
        await db.categories.insert_many([dict(item) for item in missing_categories])

    existing_products = set(await db.products.distinct("slug"))
    created_at = now_iso()
    missing_products = []
    for product in SEED_PRODUCTS:
        if product["slug"] in existing_products:
            continue
        item = dict(product)
        item["created_at"] = created_at
        item["updated_at"] = created_at
        missing_products.append(item)

    if missing_products:
        await db.products.insert_many(missing_products)

    product_defaults = await db.products.find({}, {"_id": 0, "slug": 1, "stock": 1, "sku": 1, "created_at": 1}).to_list(1000)
    for product in product_defaults:
        updates = {}
        if product.get("stock") is None:
            updates["stock"] = 20
        if not product.get("sku"):
            updates["sku"] = f"BST-{product['slug'].replace('-', '').upper()[:10]}"
        if not product.get("created_at"):
            updates["created_at"] = now_iso()
        if updates:
            updates["updated_at"] = now_iso()
            await db.products.update_one({"slug": product["slug"]}, {"$set": updates})

    orders_count = await db.orders.count_documents({})
    if orders_count == 0:
        products_for_orders = await db.products.find({}, {"_id": 0}).to_list(1000)
        products_by_slug = {item["slug"]: item for item in products_for_orders}
        seed_orders = build_seed_orders(products_by_slug)
        if seed_orders:
            await db.orders.insert_many(seed_orders)


@api_router.get("/")
async def root():
    return {"message": "BESTIC FASHION API is running"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input_data: StatusCheckCreate):
    status_obj = StatusCheck(**input_data.model_dump())
    doc = status_obj.model_dump()
    doc["timestamp"] = doc["timestamp"].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check.get("timestamp"), str):
            check["timestamp"] = datetime.fromisoformat(check["timestamp"])
    return status_checks


@api_router.get("/brand-info", response_model=BrandInfo)
async def get_brand_info():
    return BRAND_INFO


@api_router.get("/categories", response_model=List[Category])
async def get_categories():
    return await db.categories.find({}, {"_id": 0}).sort("sort_order", 1).to_list(100)


@api_router.get("/products", response_model=ProductListResponse)
async def get_products(
    category: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
):
    query = {}
    if category:
        query["category_slug"] = category
    if tag == "new-arrivals":
        query["is_new"] = True
    if tag == "best-sellers":
        query["is_bestseller"] = True

    items = await db.products.find(query, {"_id": 0}).to_list(200)

    if search:
        lowered = search.lower().strip()
        items = [
            item
            for item in items
            if lowered in item.get("name", "").lower()
            or lowered in item.get("description", "").lower()
        ]

    items.sort(key=lambda product: (not product.get("is_bestseller", False), product.get("price", 0)))
    return ProductListResponse(items=items, count=len(items))


@api_router.get("/products/{slug}", response_model=Product)
async def get_product_by_slug(slug: str):
    product = await db.products.find_one({"slug": slug}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@api_router.post("/leads/newsletter", response_model=NewsletterLeadResponse)
async def subscribe_newsletter(input_data: NewsletterLeadCreate):
    email = input_data.email.lower()
    existing = await db.newsletter_leads.find_one({"email": email}, {"_id": 0})

    if existing:
        return NewsletterLeadResponse(
            message="You are already subscribed to BESTIC updates.",
            already_subscribed=True,
        )

    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "source": "website",
        "created_at": now_iso(),
    }
    await db.newsletter_leads.insert_one(doc)
    return NewsletterLeadResponse(
        message="Subscription confirmed. Welcome to BESTIC FASHION.",
        already_subscribed=False,
    )


@api_router.post("/cart/preview", response_model=CartPreviewResponse)
async def preview_cart(input_data: CartPreviewCreate):
    if not input_data.items:
        return CartPreviewResponse(items=[], subtotal=0, shipping=0, total=0, currency="INR")

    lines: List[CartLineItem] = []
    subtotal = 0.0

    for cart_item in input_data.items:
        product = await db.products.find_one({"slug": cart_item.slug}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {cart_item.slug} not found")

        if cart_item.size not in product.get("sizes", []):
            raise HTTPException(status_code=400, detail=f"Invalid size '{cart_item.size}' for {product['name']}")

        if cart_item.color not in product.get("colors", []):
            raise HTTPException(status_code=400, detail=f"Invalid color '{cart_item.color}' for {product['name']}")

        unit_price = float(product.get("price", 0))
        line_total = round(unit_price * cart_item.quantity, 2)
        subtotal += line_total

        lines.append(
            CartLineItem(
                slug=product["slug"],
                name=product["name"],
                image_url=product.get("image_urls", [""])[0],
                size=cart_item.size,
                color=cart_item.color,
                quantity=cart_item.quantity,
                unit_price=unit_price,
                line_total=line_total,
            )
        )

    shipping = 0.0 if subtotal >= 1499 else 99.0
    total = round(subtotal + shipping, 2)

    return CartPreviewResponse(
        items=lines,
        subtotal=round(subtotal, 2),
        shipping=shipping,
        total=total,
        currency="INR",
    )


@api_router.post("/customer/auth/register", response_model=CustomerAuthResponse)
async def register_customer(input_data: CustomerRegisterRequest):
    email = normalize_email(str(input_data.email))
    existing = await db.customers.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Customer already exists with this email")

    customer = {
        "id": str(uuid.uuid4()),
        "name": input_data.name,
        "email": email,
        "phone": input_data.phone,
        "password": input_data.password,
        "billing_address": input_data.billing_address.model_dump() if input_data.billing_address else None,
        "created_at": now_iso(),
    }
    await db.customers.insert_one(customer)
    session_token = await create_customer_session(customer)
    return CustomerAuthResponse(
        message="Customer account created successfully.",
        session_token=session_token,
        customer=build_customer_profile(customer),
    )


@api_router.post("/customer/auth/login", response_model=CustomerAuthResponse)
async def login_customer(input_data: CustomerLoginRequest):
    email = normalize_email(str(input_data.email))
    customer = await db.customers.find_one({"email": email}, {"_id": 0})
    if not customer or customer.get("password") != input_data.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    session_token = await create_customer_session(customer)
    return CustomerAuthResponse(
        message="Customer login successful.",
        session_token=session_token,
        customer=build_customer_profile(customer),
    )


@api_router.get("/customer/auth/me", response_model=CustomerProfile)
async def get_customer_me(customer: dict = Depends(require_customer_session)):
    return build_customer_profile(customer)


@api_router.get("/customer/orders", response_model=List[CustomerOrderSummary])
async def get_customer_orders(customer: dict = Depends(require_customer_session)):
    orders = await db.orders.find({"customer_email": customer["email"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders


@api_router.put("/customer/billing", response_model=CustomerProfile)
async def update_customer_billing(input_data: CustomerBillingUpdateRequest, customer: dict = Depends(require_customer_session)):
    await db.customers.update_one(
        {"id": customer["id"]},
        {"$set": {"billing_address": input_data.billing_address.model_dump()}},
    )
    updated = await db.customers.find_one({"id": customer["id"]}, {"_id": 0})
    return build_customer_profile(updated)


@api_router.post("/customer/orders", response_model=CustomerOrderResponse)
async def create_customer_order(input_data: CustomerOrderCreate, customer: dict = Depends(require_customer_session)):
    billing_address = input_data.billing_address.model_dump() if input_data.billing_address else customer.get("billing_address")
    if not billing_address:
        raise HTTPException(status_code=400, detail="Billing address is required before placing the order")

    cart_preview = await preview_cart(CartPreviewCreate(items=input_data.items))
    order_items = []
    for item in cart_preview.items:
        order_items.append(item.model_dump())

    product_docs = []
    for cart_item in input_data.items:
        product = await db.products.find_one({"slug": cart_item.slug}, {"_id": 0, "seller_email": 1})
        if product:
            product_docs.append(product)

    order_number = f"BST-{random.randint(10000, 99999)}"
    order = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "customer_name": billing_address["full_name"],
        "customer_email": customer["email"],
        "customer_phone": billing_address["phone"],
        "billing_address": billing_address,
        "marketplace": "Website",
        "payment_method": input_data.payment_method,
        "payment_status": "COD" if input_data.payment_method.upper() == "COD" else "Pending",
        "order_status": "New",
        "total_amount": round(cart_preview.total, 2),
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "items": order_items,
    }
    await db.orders.insert_one(order)
    await db.customers.update_one({"id": customer["id"]}, {"$set": {"billing_address": billing_address}})
    try:
        await send_customer_order_confirmation_email(order)
    except Exception:
        logger.exception("Unable to send order confirmation for %s", order_number)
    seller_emails = [product.get("seller_email") for product in product_docs if product.get("seller_email")]
    if not seller_emails:
        sellers = await db.sellers.find({}, {"_id": 0, "email": 1}).to_list(1000)
        seller_emails = [seller.get("email") for seller in sellers if seller.get("email")]
    try:
        await send_seller_new_order_email(order, seller_emails)
    except Exception:
        logger.exception("Unable to send seller new order email for %s", order_number)
    return CustomerOrderResponse(
        message="Order placed successfully.",
        order_id=order["id"],
        order_number=order_number,
        total_amount=order["total_amount"],
    )


@api_router.post("/seller/auth/register/request-otp", response_model=SellerOtpDispatchResponse)
async def request_seller_registration_otp(input_data: SellerRegistrationRequest):
    email = normalize_email(str(input_data.email))
    gst_number = sanitize_gst(input_data.gst_number)

    existing_seller = await db.sellers.find_one({"email": email}, {"_id": 0})
    if existing_seller:
        raise HTTPException(status_code=400, detail="A seller account already exists with this email")

    existing_gst = await db.sellers.find_one({"gst_number": gst_number}, {"_id": 0})
    if existing_gst:
        raise HTTPException(status_code=400, detail="A seller account already exists with this GST number")

    payload = input_data.model_dump()
    payload["email"] = email
    payload["gst_number"] = gst_number
    return await issue_seller_otp(email, "register", payload)


@api_router.post("/seller/auth/register/verify", response_model=SellerAuthResponse)
async def verify_seller_registration(input_data: SellerOtpVerifyRequest):
    email = normalize_email(str(input_data.email))
    otp_record = await get_latest_pending_otp(email, "register")
    if not otp_record or otp_record.get("otp") != input_data.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    payload = otp_record["payload"]
    existing_seller = await db.sellers.find_one({"email": email}, {"_id": 0})
    if existing_seller:
        raise HTTPException(status_code=400, detail="A seller account already exists with this email")

    seller = {
        "id": str(uuid.uuid4()),
        "business_name": payload["business_name"],
        "owner_name": payload["owner_name"],
        "email": email,
        "phone": payload["phone"],
        "gst_number": payload["gst_number"],
        "business_address": payload["business_address"],
        "city": payload["city"],
        "state": payload["state"],
        "pincode": payload["pincode"],
        "status": "active",
        "created_at": now_iso(),
    }
    await db.sellers.insert_one(seller)
    await db.seller_otps.update_one({"id": otp_record["id"]}, {"$set": {"status": "verified", "verified_at": now_iso()}})
    session_token = await create_seller_session(seller)
    return SellerAuthResponse(
        message="Seller account created successfully.",
        session_token=session_token,
        seller=build_seller_profile(seller),
    )


@api_router.post("/seller/auth/login/request-otp", response_model=SellerOtpDispatchResponse)
async def request_seller_login_otp(input_data: SellerLoginRequest):
    email = normalize_email(str(input_data.email))
    seller = await db.sellers.find_one({"email": email}, {"_id": 0})
    if not seller:
        raise HTTPException(status_code=404, detail="Seller account not found for this email")

    return await issue_seller_otp(email, "login", {"business_name": seller["business_name"]})


@api_router.post("/seller/auth/login/verify", response_model=SellerAuthResponse)
async def verify_seller_login(input_data: SellerOtpVerifyRequest):
    email = normalize_email(str(input_data.email))
    otp_record = await get_latest_pending_otp(email, "login")
    if not otp_record or otp_record.get("otp") != input_data.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    seller = await db.sellers.find_one({"email": email}, {"_id": 0})
    if not seller:
        raise HTTPException(status_code=404, detail="Seller account not found")

    await db.seller_otps.update_one({"id": otp_record["id"]}, {"$set": {"status": "verified", "verified_at": now_iso()}})
    session_token = await create_seller_session(seller)
    return SellerAuthResponse(
        message="Seller login successful.",
        session_token=session_token,
        seller=build_seller_profile(seller),
    )


@api_router.get("/seller/auth/me", response_model=SellerProfile)
async def get_seller_me(seller: dict = Depends(require_seller_session)):
    return build_seller_profile(seller)


@api_router.get("/seller/dashboard", response_model=SellerDashboardResponse)
async def get_seller_dashboard(seller: dict = Depends(require_seller_session)):
    orders = await db.orders.find({}, {"_id": 0}).to_list(1000)
    low_stock_items = await db.products.count_documents({"stock": {"$lte": 10}})

    total_revenue = sum(float(order.get("total_amount", 0)) for order in orders if order.get("payment_status") == "Paid")
    pending_payments = sum(
        float(order.get("total_amount", 0))
        for order in orders
        if order.get("payment_status") in {"Pending", "COD"}
    )

    return SellerDashboardResponse(
        total_orders=len(orders),
        new_orders=sum(1 for order in orders if order.get("order_status") == "New"),
        processing_orders=sum(1 for order in orders if order.get("order_status") == "Processing"),
        low_stock_items=low_stock_items,
        total_revenue=round(total_revenue, 2),
        pending_payments=round(pending_payments, 2),
    )


@api_router.get("/seller/orders", response_model=List[SellerOrder])
async def get_seller_orders(
    status: Optional[str] = Query(default=None),
    payment_status: Optional[str] = Query(default=None),
    seller: dict = Depends(require_seller_session),
):
    query = {}
    if status:
        query["order_status"] = status
    if payment_status:
        query["payment_status"] = payment_status

    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders


@api_router.patch("/seller/orders/{order_id}", response_model=SellerOrder)
async def update_order_status(order_id: str, input_data: SellerOrderStatusUpdate, seller: dict = Depends(require_seller_session)):
    if input_data.order_status not in ORDER_STATUS_FLOW:
        raise HTTPException(status_code=400, detail=f"Invalid order status. Use one of: {', '.join(ORDER_STATUS_FLOW)}")

    existing_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")

    update_result = await db.orders.update_one(
        {"id": order_id},
        {"$set": {"order_status": input_data.order_status, "updated_at": now_iso()}},
    )
    if update_result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")

    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    email_notifiable_statuses = {"Packed", "Dispatched", "Shipped"}
    if (
        updated_order
        and updated_order.get("customer_email")
        and existing_order.get("order_status") != input_data.order_status
        and input_data.order_status in email_notifiable_statuses
    ):
        try:
            await send_order_status_email(updated_order, input_data.order_status)
        except Exception:
            logger.exception("Unable to send order status email for %s", updated_order.get("order_number"))
    return updated_order


@api_router.get("/seller/inventory", response_model=List[Product])
async def get_inventory(seller: dict = Depends(require_seller_session)):
    return await db.products.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api_router.patch("/seller/inventory/{slug}", response_model=Product)
async def update_inventory(slug: str, input_data: InventoryUpdate, seller: dict = Depends(require_seller_session)):
    updates = input_data.model_dump(exclude_none=True)
    updates["updated_at"] = now_iso()
    update_result = await db.products.update_one({"slug": slug}, {"$set": updates})

    if update_result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")

    updated_product = await db.products.find_one({"slug": slug}, {"_id": 0})
    return updated_product


@api_router.get("/seller/products", response_model=List[Product])
async def get_seller_products(seller: dict = Depends(require_seller_session)):
    return await db.products.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api_router.post("/seller/products", response_model=Product)
async def create_seller_product(input_data: SellerProductCreate, seller: dict = Depends(require_seller_session)):
    product_data = input_data.model_dump()
    base_slug = slugify(product_data["name"])
    final_slug = base_slug

    while await db.products.find_one({"slug": final_slug}, {"_id": 1}):
        final_slug = f"{base_slug}-{uuid.uuid4().hex[:4]}"

    now_timestamp = now_iso()
    new_product = {
        "id": str(uuid.uuid4()),
        "slug": final_slug,
        "seller_id": seller["id"],
        "seller_email": seller["email"],
        "name": product_data["name"],
        "description": product_data["description"],
        "category_slug": product_data["category_slug"],
        "price": product_data["price"],
        "mrp": product_data["mrp"],
        "image_urls": product_data["image_urls"],
        "sizes": product_data["sizes"],
        "colors": product_data["colors"],
        "is_new": product_data["is_new"],
        "is_bestseller": product_data["is_bestseller"],
        "stock": product_data["stock"],
        "sku": f"BST-{final_slug.replace('-', '').upper()[:10]}",
        "rating": 0,
        "review_count": 0,
        "reviews": [],
        "created_at": now_timestamp,
        "updated_at": now_timestamp,
    }

    await db.products.insert_one(new_product)
    return new_product


@api_router.get("/seller/payments/report", response_model=PaymentReportResponse)
async def get_payment_report(seller: dict = Depends(require_seller_session)):
    orders = await db.orders.find({}, {"_id": 0}).to_list(1000)

    paid_amount = sum(float(order.get("total_amount", 0)) for order in orders if order.get("payment_status") == "Paid")
    pending_amount = sum(
        float(order.get("total_amount", 0)) for order in orders if order.get("payment_status") == "Pending"
    )
    cod_amount = sum(float(order.get("total_amount", 0)) for order in orders if order.get("payment_status") == "COD")

    method_bucket: Dict[str, Dict[str, float]] = {}
    for order in orders:
        payment_method = order.get("payment_method", "Unknown")
        amount = float(order.get("total_amount", 0))
        if payment_method not in method_bucket:
            method_bucket[payment_method] = {"amount": 0.0, "orders": 0}
        method_bucket[payment_method]["amount"] += amount
        method_bucket[payment_method]["orders"] += 1

    method_breakdown = [
        PaymentMethodBreakdown(
            payment_method=key,
            amount=round(value["amount"], 2),
            orders=int(value["orders"]),
        )
        for key, value in method_bucket.items()
    ]

    return PaymentReportResponse(
        total_orders=len(orders),
        total_revenue=round(paid_amount, 2),
        paid_amount=round(paid_amount, 2),
        pending_amount=round(pending_amount, 2),
        cod_amount=round(cod_amount, 2),
        method_breakdown=method_breakdown,
    )


@api_router.get("/seller/orders/report")
async def get_orders_report(format: str = Query(default="json"), seller: dict = Depends(require_seller_session)):
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

    if format.lower() != "csv":
        return orders

    csv_stream = StringIO()
    csv_stream.write("order_number,customer_name,marketplace,order_status,payment_status,payment_method,total_amount,created_at\n")
    for order in orders:
        row = [
            order.get("order_number", ""),
            order.get("customer_name", ""),
            order.get("marketplace", ""),
            order.get("order_status", ""),
            order.get("payment_status", ""),
            order.get("payment_method", ""),
            str(order.get("total_amount", 0)),
            order.get("created_at", ""),
        ]
        escaped = [str(col).replace(",", " ") for col in row]
        csv_stream.write(",".join(escaped) + "\n")

    return Response(
        content=csv_stream.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=bestic_orders_report.csv"},
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup_event():
    global client, db
    try:
        await seed_catalog_if_needed()
        logger.info("BESTIC FASHION catalog seeded and API ready")
    except Exception:
        if client:
            logger.exception("MongoDB unavailable during startup. Falling back to in-memory database for local development.")
            client.close()
            client = None
            db = InMemoryDatabase()
            await seed_catalog_if_needed()
            logger.info("BESTIC FASHION catalog seeded using in-memory database fallback")
        else:
            raise


@app.on_event("shutdown")
async def shutdown_db_client():
    if client:
        client.close()
