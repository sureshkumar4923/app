import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="BESTIC FASHION API")
api_router = APIRouter(prefix="/api")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
        "rating": 4.7,
        "review_count": 93,
        "reviews": [
            {"name": "Kriti", "rating": 5, "comment": "Looks absolutely luxe.", "verified": True},
            {"name": "Neha", "rating": 4, "comment": "Great fall and quality.", "verified": True},
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


async def seed_catalog_if_needed() -> None:
    categories_count = await db.categories.count_documents({})
    if categories_count == 0:
        await db.categories.insert_many([dict(item) for item in SEED_CATEGORIES])

    products_count = await db.products.count_documents({})
    if products_count == 0:
        seeded_products = []
        created_at = now_iso()
        for product in SEED_PRODUCTS:
            item = dict(product)
            item["created_at"] = created_at
            seeded_products.append(item)
        await db.products.insert_many(seeded_products)


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
    await seed_catalog_if_needed()
    logger.info("BESTIC FASHION catalog seeded and API ready")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()