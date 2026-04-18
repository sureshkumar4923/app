import { useCallback, useEffect, useMemo, useState } from "react";
import "@/App.css";
import axios from "axios";
import { ArrowRight, CheckCircle2, Menu, ShieldCheck, ShoppingBag, Star, X } from "lucide-react";
import { BrowserRouter, Link, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import SellerPortal from "@/components/SellerPortal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatPrice = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

const ProductCard = ({ product, addToCart }) => (
  <Card className="product-card overflow-hidden border-stone-200 bg-white shadow-sm" data-testid={`product-card-${product.slug}`}>
    <div className="aspect-[3/4] overflow-hidden bg-stone-100">
      <img
        src={product.image_urls[0]}
        alt={product.name}
        className="product-image h-full w-full object-cover object-center"
        data-testid={`product-image-${product.slug}`}
      />
    </div>
    <CardContent className="space-y-4 p-5">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500" data-testid={`product-category-${product.slug}`}>
          {product.category_slug.replace("-", " ")}
        </p>
        <h3 className="font-heading text-xl text-stone-900" data-testid={`product-name-${product.slug}`}>
          {product.name}
        </h3>
        <div className="flex items-center gap-3" data-testid={`product-pricing-${product.slug}`}>
          <p className="font-semibold text-stone-900">{formatPrice(product.price)}</p>
          <p className="text-sm text-stone-400 line-through">{formatPrice(product.mrp)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link to={`/product/${product.slug}`} data-testid={`product-view-button-${product.slug}`}>
          <Button variant="outline" className="rounded-none border-stone-900 text-xs uppercase tracking-[0.18em]">
            View
          </Button>
        </Link>
        <Button
          className="rounded-none bg-stone-900 text-xs uppercase tracking-[0.18em] hover:bg-stone-700"
          onClick={() => addToCart(product, { size: product.sizes[0], color: product.colors[0] })}
          data-testid={`product-add-to-cart-button-${product.slug}`}
        >
          Add to Cart
        </Button>
      </div>
    </CardContent>
  </Card>
);

const SiteHeader = ({ cartCount, menuOpen, setMenuOpen }) => (
  <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/85 backdrop-blur-md" data-testid="site-header">
    <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 md:px-12">
      <Link to="/" className="font-heading text-2xl tracking-wide text-stone-900" data-testid="brand-logo-link">
        BESTIC FASHION
      </Link>

      <nav className="hidden items-center gap-8 md:flex" data-testid="desktop-navigation">
        <Link to="/" className="text-sm uppercase tracking-[0.18em] text-stone-700 transition-colors hover:text-stone-900" data-testid="nav-home-link">
          Home
        </Link>
        <Link to="/shop" className="text-sm uppercase tracking-[0.18em] text-stone-700 transition-colors hover:text-stone-900" data-testid="nav-shop-link">
          Shop
        </Link>
        <a href="/#about" className="text-sm uppercase tracking-[0.18em] text-stone-700 transition-colors hover:text-stone-900" data-testid="nav-about-link">
          About
        </a>
        <a href="/#contact" className="text-sm uppercase tracking-[0.18em] text-stone-700 transition-colors hover:text-stone-900" data-testid="nav-contact-link">
          Contact
        </a>
        <Link to="/seller" className="text-sm uppercase tracking-[0.18em] text-stone-700 transition-colors hover:text-stone-900" data-testid="nav-seller-link">
          Seller Portal
        </Link>
      </nav>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-stone-300 px-4 py-2 md:flex" data-testid="header-cart-summary">
          <ShoppingBag className="h-4 w-4 text-stone-700" />
          <span className="text-xs uppercase tracking-[0.14em] text-stone-700">Cart {cartCount}</span>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border border-stone-300 p-2 md:hidden"
          onClick={() => setMenuOpen((prev) => !prev)}
          data-testid="mobile-menu-toggle-button"
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
    </div>

    {menuOpen && (
      <div className="border-t border-stone-200 bg-white px-6 py-4 md:hidden" data-testid="mobile-navigation-panel">
        <div className="flex flex-col gap-4">
          <Link to="/" onClick={() => setMenuOpen(false)} data-testid="mobile-nav-home-link">
            Home
          </Link>
          <Link to="/shop" onClick={() => setMenuOpen(false)} data-testid="mobile-nav-shop-link">
            Shop
          </Link>
          <a href="/#about" onClick={() => setMenuOpen(false)} data-testid="mobile-nav-about-link">
            About
          </a>
          <a href="/#contact" onClick={() => setMenuOpen(false)} data-testid="mobile-nav-contact-link">
            Contact
          </a>
          <Link to="/seller" onClick={() => setMenuOpen(false)} data-testid="mobile-nav-seller-link">
            Seller Portal
          </Link>
        </div>
      </div>
    )}
  </header>
);

const HomePage = ({ brandInfo, categories, products, addToCart, submitNewsletter, newsletterState }) => {
  const bestSellers = useMemo(() => products.filter((item) => item.is_bestseller).slice(0, 4), [products]);

  return (
    <main data-testid="homepage-main-content">
      <section className="hero-section relative overflow-hidden" data-testid="hero-section">
        <img
          src={brandInfo?.hero_image}
          alt="Premium fashion model showcasing BESTIC FASHION"
          className="hero-image absolute inset-0 h-full w-full object-cover object-center"
          data-testid="hero-banner-image"
        />
        <div className="hero-overlay absolute inset-0" />

        <div className="relative mx-auto flex min-h-[74vh] w-full max-w-7xl items-end px-6 pb-16 pt-28 md:px-12 md:pb-24">
          <div className="max-w-3xl space-y-6 text-white">
            <Badge className="rounded-none bg-white/20 px-4 py-2 text-[10px] uppercase tracking-[0.24em]" data-testid="trusted-brand-badge">
              {brandInfo?.highlight}
            </Badge>
            <h1 className="font-heading text-4xl leading-tight sm:text-5xl lg:text-6xl" data-testid="hero-main-tagline">
              {brandInfo?.tagline}
            </h1>
            <p className="max-w-2xl text-sm text-stone-100 md:text-base" data-testid="hero-subtitle-text">
              Curated premium lingerie, innerwear and western styles made for modern women who choose comfort with confidence.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link to="/shop?tag=best-sellers" data-testid="hero-shop-bestsellers-link">
                <Button className="rounded-none bg-white px-8 py-6 text-xs uppercase tracking-[0.2em] text-stone-900 hover:bg-stone-100">
                  Shop Best Sellersss
                </Button>
              </Link>
              <Link to="/shop?tag=new-arrivals" data-testid="hero-new-arrivals-link">
                <Button
                  variant="outline"
                  className="rounded-none border-white bg-transparent px-8 py-6 text-xs uppercase tracking-[0.2em] text-white hover:bg-white hover:text-stone-900"
                >
                  New Arrivals
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-12 md:px-12" data-testid="marketplace-section">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-500" data-testid="marketplace-title">
          Available on leading marketplaces
        </p>
        <div className="mt-5 flex flex-wrap gap-3" data-testid="marketplace-badges-list">
          {brandInfo?.marketplace_availability?.map((platform) => (
            <Badge
              key={platform}
              className="market-badge rounded-none border border-stone-300 bg-white px-4 py-2 text-xs uppercase tracking-[0.16em] text-stone-800"
              data-testid={`marketplace-badge-${platform.toLowerCase()}`}
            >
              {platform}
            </Badge>
          ))}
        </div>
      </section>

      <section id="categories" className="mx-auto w-full max-w-7xl px-6 py-14 md:px-12 md:py-20" data-testid="shop-categories-section">
        <h2 className="font-heading text-3xl text-stone-900 md:text-5xl" data-testid="categories-heading">
          Shop Categories
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4" data-testid="categories-grid">
          {categories.map((category) => (
            <Link
              to={`/shop?category=${category.slug}`}
              key={category.slug}
              className="group relative overflow-hidden border border-stone-200 bg-white"
              data-testid={`category-card-${category.slug}`}
            >
              <div className="aspect-[3/4] overflow-hidden">
                <img
                  src={category.image_url}
                  alt={category.name}
                  className="h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-110"
                  data-testid={`category-image-${category.slug}`}
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <p className="font-heading text-2xl" data-testid={`category-title-${category.slug}`}>
                  {category.name}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-200">Explore now</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-14 md:px-12 md:py-20" data-testid="bestsellers-section">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-heading text-3xl text-stone-900 md:text-5xl" data-testid="bestsellers-heading">
            Best Sellers
          </h2>
          <Link to="/shop?tag=best-sellers" className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.16em] text-stone-600" data-testid="view-all-bestsellers-link">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4" data-testid="bestsellers-grid">
          {bestSellers.map((product) => (
            <ProductCard key={product.slug} product={product} addToCart={addToCart} />
          ))}
        </div>
      </section>

      <section id="about" className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-14 md:grid-cols-2 md:px-12 md:py-20" data-testid="about-section">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.22em] text-stone-500" data-testid="about-kicker">
            About us
          </p>
          <h2 className="font-heading text-3xl text-stone-900 md:text-5xl" data-testid="about-heading">
            The premium essentials brand trusted across marketplaces.
          </h2>
        </div>
        <p className="text-sm leading-7 text-stone-700 md:text-base" data-testid="about-description-text">
          {brandInfo?.about}
        </p>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-14 md:px-12 md:py-20" data-testid="why-choose-us-section">
        <h2 className="font-heading text-3xl text-stone-900 md:text-5xl" data-testid="why-choose-us-heading">
          Why Choose Us
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2" data-testid="why-choose-us-grid">
          {brandInfo?.why_choose_us?.map((item) => (
            <div key={item} className="flex items-center gap-3 border border-stone-200 bg-white p-5" data-testid={`why-choose-us-item-${item.toLowerCase().replace(/\s+/g, "-")}`}>
              <CheckCircle2 className="h-5 w-5 text-stone-700" />
              <p className="text-sm uppercase tracking-[0.14em] text-stone-700">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 pb-16 md:px-12 md:pb-20" data-testid="trust-elements-section">
        <h2 className="font-heading text-3xl text-stone-900 md:text-5xl" data-testid="trust-elements-heading">
          Shop with confidence
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4" data-testid="trust-elements-grid">
          {brandInfo?.trust_elements?.map((item) => (
            <Card key={item} className="border-stone-200 bg-stone-50" data-testid={`trust-element-card-${item.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="flex items-center gap-3 p-5">
                <ShieldCheck className="h-5 w-5 text-stone-800" />
                <p className="text-sm uppercase tracking-[0.12em] text-stone-700">{item}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="contact" className="mx-auto w-full max-w-7xl px-6 pb-16 md:px-12 md:pb-24" data-testid="newsletter-section">
        <div className="border border-stone-300 bg-[#f8f2ed] px-6 py-12 md:px-10" data-testid="newsletter-card">
          <h3 className="font-heading text-3xl text-stone-900 md:text-4xl" data-testid="newsletter-heading">
            Join the BESTIC insiders list
          </h3>
          <p className="mt-2 text-sm text-stone-600" data-testid="newsletter-description">
            Get first access to new drops, best-seller restocks and premium deals.
          </p>
          <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={submitNewsletter} data-testid="newsletter-form">
            <input
              type="email"
              name="email"
              required
              placeholder="Enter your email"
              className="h-12 flex-1 rounded-none border border-stone-300 bg-white px-4 text-sm"
              data-testid="newsletter-email-input"
            />
            <Button className="h-12 rounded-none bg-stone-900 px-8 text-xs uppercase tracking-[0.18em] hover:bg-stone-700" data-testid="newsletter-submit-button">
              Subscribe
            </Button>
          </form>
          {newsletterState.message && (
            <p className="mt-3 text-sm text-stone-700" data-testid="newsletter-response-message">
              {newsletterState.message}
            </p>
          )}
        </div>
      </section>
    </main>
  );
};

const ShopPage = ({ products, categories, addToCart }) => {
  const [searchParams] = useSearchParams();
  const categoryFromQuery = searchParams.get("category");
  const tagFromQuery = searchParams.get("tag");
  const [selectedCategory, setSelectedCategory] = useState(categoryFromQuery || "all");

  useEffect(() => {
    setSelectedCategory(categoryFromQuery || "all");
  }, [categoryFromQuery]);

  const visibleProducts = useMemo(() => {
    let list = [...products];
    if (selectedCategory !== "all") {
      list = list.filter((item) => item.category_slug === selectedCategory);
    }
    if (tagFromQuery === "best-sellers") {
      list = list.filter((item) => item.is_bestseller);
    }
    if (tagFromQuery === "new-arrivals") {
      list = list.filter((item) => item.is_new);
    }
    return list;
  }, [products, selectedCategory, tagFromQuery]);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-12 md:px-12 md:py-16" data-testid="shop-page-main-content">
      <h1 className="font-heading text-4xl text-stone-900 md:text-6xl" data-testid="shop-page-heading">
        Discover Premium Styles
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-stone-600 md:text-base" data-testid="shop-page-description">
        Browse categories curated for comfort, confidence and premium everyday luxury.
      </p>

      <div className="mt-8 flex flex-wrap gap-3" data-testid="shop-category-filters">
        <Button
          variant={selectedCategory === "all" ? "default" : "outline"}
          className="rounded-none text-xs uppercase tracking-[0.16em]"
          onClick={() => setSelectedCategory("all")}
          data-testid="shop-filter-all-button"
        >
          All
        </Button>
        {categories
          .filter((item) => !["new-arrivals", "best-sellers"].includes(item.slug))
          .map((category) => (
            <Button
              key={category.slug}
              variant={selectedCategory === category.slug ? "default" : "outline"}
              className="rounded-none text-xs uppercase tracking-[0.16em]"
              onClick={() => setSelectedCategory(category.slug)}
              data-testid={`shop-filter-${category.slug}-button`}
            >
              {category.name}
            </Button>
          ))}
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4" data-testid="shop-products-grid">
        {visibleProducts.map((product) => (
          <ProductCard key={product.slug} product={product} addToCart={addToCart} />
        ))}
      </div>

      {visibleProducts.length === 0 && (
        <p className="mt-8 text-sm text-stone-600" data-testid="shop-empty-state-text">
          No products found in this category yet.
        </p>
      )}
    </main>
  );
};

const ProductPage = ({ addToCart }) => {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API}/products/${slug}`);
        setProduct(response.data);
        setSelectedSize(response.data.sizes[0]);
        setSelectedColor(response.data.colors[0]);
      } catch (error) {
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [slug]);

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-16 md:px-12" data-testid="product-page-loading-state">
        Loading product details...
      </main>
    );
  }

  if (!product) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-16 md:px-12" data-testid="product-page-not-found-state">
        Product not found.
      </main>
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-10 md:grid-cols-2 md:px-12 md:py-14" data-testid="product-page-main-content">
      <div className="space-y-4">
        <div className="aspect-[4/5] overflow-hidden border border-stone-200 bg-stone-100" data-testid="product-main-image-container">
          <img
            src={product.image_urls[selectedImage]}
            alt={product.name}
            className="h-full w-full object-cover object-center"
            data-testid="product-main-image"
          />
        </div>
        <div className="grid grid-cols-4 gap-3" data-testid="product-thumbnail-grid">
          {product.image_urls.map((image, index) => (
            <button
              type="button"
              key={image}
              onClick={() => setSelectedImage(index)}
              className={`aspect-square overflow-hidden border ${selectedImage === index ? "border-stone-900" : "border-stone-200"}`}
              data-testid={`product-thumbnail-button-${index}`}
            >
              <img src={image} alt={`${product.name} ${index + 1}`} className="h-full w-full object-cover object-center" />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500" data-testid="product-detail-category">
            {product.category_slug.replace("-", " ")}
          </p>
          <h1 className="mt-2 font-heading text-4xl text-stone-900" data-testid="product-detail-name">
            {product.name}
          </h1>
          <div className="mt-3 flex items-center gap-3" data-testid="product-detail-pricing">
            <p className="text-xl font-semibold text-stone-900">{formatPrice(product.price)}</p>
            <p className="text-sm text-stone-400 line-through">{formatPrice(product.mrp)}</p>
          </div>
          <p className="mt-4 text-sm leading-7 text-stone-600" data-testid="product-detail-description">
            {product.description}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.16em] text-stone-500" data-testid="product-size-selector-label">
            Select Size
          </p>
          <div className="flex flex-wrap gap-2" data-testid="product-size-selector-options">
            {product.sizes.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setSelectedSize(size)}
                className={`min-w-12 border px-4 py-2 text-xs uppercase tracking-[0.14em] ${selectedSize === size ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-700"}`}
                data-testid={`product-size-option-${size}`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.16em] text-stone-500" data-testid="product-color-selector-label">
            Select Color
          </p>
          <div className="flex flex-wrap gap-2" data-testid="product-color-selector-options">
            {product.colors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setSelectedColor(color)}
                className={`border px-4 py-2 text-xs uppercase tracking-[0.14em] ${selectedColor === color ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-700"}`}
                data-testid={`product-color-option-${color.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {color}
              </button>
            ))}
          </div>
        </div>

        <Button
          className="h-12 w-full rounded-none bg-stone-900 text-xs uppercase tracking-[0.2em] hover:bg-stone-700"
          onClick={() => addToCart(product, { size: selectedSize, color: selectedColor })}
          data-testid="product-page-add-to-cart-button"
        >
          Add to Cart
        </Button>

        <div className="space-y-3 border-t border-stone-200 pt-5" data-testid="product-reviews-section">
          <h2 className="font-heading text-2xl text-stone-900" data-testid="product-reviews-heading">
            Customer Reviews
          </h2>
          <div className="flex items-center gap-2" data-testid="product-rating-summary">
            <Star className="h-4 w-4 fill-stone-900 text-stone-900" />
            <p className="text-sm text-stone-700">
              {product.rating} / 5 ({product.review_count} reviews)
            </p>
          </div>
          <div className="space-y-3" data-testid="product-reviews-list">
            {product.reviews.map((review, index) => (
              <div key={`${review.name}-${index}`} className="border border-stone-200 p-4" data-testid={`product-review-item-${index}`}>
                <p className="text-sm font-medium text-stone-900">{review.name}</p>
                <p className="mt-1 text-sm text-stone-600">{review.comment}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
};

const Footer = ({ brandInfo }) => (
  <footer className="border-t border-stone-200 bg-white" data-testid="site-footer">
    <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-12 md:grid-cols-3 md:px-12">
      <div className="space-y-3">
        <h3 className="font-heading text-2xl text-stone-900" data-testid="footer-brand-name">
          {brandInfo?.name}
        </h3>
        <p className="text-sm text-stone-600" data-testid="footer-brand-description">
          Premium women’s lingerie, innerwear and western fashion designed for modern confidence.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-stone-500" data-testid="footer-contact-heading">
          Contact Details
        </p>
        <p className="text-sm text-stone-700" data-testid="footer-contact-email">Email: support@besticfashion.com</p>
        <p className="text-sm text-stone-700" data-testid="footer-contact-phone">Phone: +91 90000 12345</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-stone-500" data-testid="footer-marketplace-heading">
          Marketplace Availability
        </p>
        <div className="flex flex-wrap gap-2" data-testid="footer-marketplace-list">
          {brandInfo?.marketplace_availability?.map((item) => (
            <Badge key={item} className="rounded-none border border-stone-300 bg-white text-xs text-stone-700" data-testid={`footer-marketplace-${item.toLowerCase()}`}>
              {item}
            </Badge>
          ))}
        </div>
        <div className="flex gap-4 pt-2 text-sm text-stone-700" data-testid="footer-social-links">
          <a href="#" data-testid="footer-social-instagram-link">Instagram</a>
          <a href="#" data-testid="footer-social-facebook-link">Facebook</a>
          <a href="#" data-testid="footer-social-youtube-link">YouTube</a>
        </div>
      </div>
    </div>
  </footer>
);

const CartPanel = ({ cartItems, setCartItems }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems],
  );
  const shipping = subtotal >= 1499 || subtotal === 0 ? 0 : 99;
  const total = subtotal + shipping;

  const updateQuantity = (slug, delta) => {
    setCartItems((prev) =>
      prev
        .map((item) => (item.slug === slug ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0),
    );
  };

  const removeItem = (slug) => {
    setCartItems((prev) => prev.filter((item) => item.slug !== slug));
  };

  return (
    <>
      {!mobileOpen && (
        <button
          type="button"
          className="fixed bottom-20 right-4 z-40 border border-stone-900 bg-stone-900 px-4 py-3 text-xs uppercase tracking-[0.18em] text-white md:hidden"
          onClick={() => setMobileOpen(true)}
          data-testid="mobile-cart-toggle-button"
        >
          {`Cart (${cartItems.length})`}
        </button>
      )}

      <aside
        className={`fixed bottom-28 right-4 z-40 w-[min(380px,calc(100vw-2rem))] border border-stone-300 bg-white p-4 shadow-xl md:bottom-4 ${mobileOpen ? "block" : "hidden"} md:block`}
        data-testid="cart-panel"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-2xl text-stone-900" data-testid="cart-panel-heading">
            Cart
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-[0.18em] text-stone-500" data-testid="cart-item-count">
              {cartItems.length} items
            </span>
            <button
              type="button"
              className="text-xs uppercase tracking-[0.14em] text-stone-500 md:hidden"
              onClick={() => setMobileOpen(false)}
              data-testid="mobile-cart-close-button"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-4 max-h-52 space-y-3 overflow-y-auto pr-1" data-testid="cart-items-list">
          {cartItems.length === 0 && (
            <p className="text-sm text-stone-500" data-testid="cart-empty-text">
              Your cart is empty.
            </p>
          )}
          {cartItems.map((item) => (
            <div key={`${item.slug}-${item.size}-${item.color}`} className="border border-stone-200 p-3" data-testid={`cart-item-${item.slug}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-stone-900" data-testid={`cart-item-name-${item.slug}`}>
                    {item.name}
                  </p>
                  <p className="text-xs text-stone-500" data-testid={`cart-item-variant-${item.slug}`}>
                    {item.size} • {item.color}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs uppercase tracking-[0.14em] text-stone-500"
                  onClick={() => removeItem(item.slug)}
                  data-testid={`cart-item-remove-button-${item.slug}`}
                >
                  Remove
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-7 w-7 border border-stone-300"
                    onClick={() => updateQuantity(item.slug, -1)}
                    data-testid={`cart-item-decrease-button-${item.slug}`}
                  >
                    -
                  </button>
                  <span className="text-sm" data-testid={`cart-item-quantity-${item.slug}`}>
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    className="h-7 w-7 border border-stone-300"
                    onClick={() => updateQuantity(item.slug, 1)}
                    data-testid={`cart-item-increase-button-${item.slug}`}
                  >
                    +
                  </button>
                </div>
                <p className="text-sm font-medium text-stone-900" data-testid={`cart-item-total-${item.slug}`}>
                  {formatPrice(item.price * item.quantity)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2 border-t border-stone-200 pt-4 text-sm" data-testid="cart-summary">
          <div className="flex items-center justify-between" data-testid="cart-subtotal-row">
            <span className="text-stone-600">Subtotal</span>
            <span className="text-stone-900">{formatPrice(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between" data-testid="cart-shipping-row">
            <span className="text-stone-600">Shipping</span>
            <span className="text-stone-900">{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-stone-200 pt-2 font-medium" data-testid="cart-total-row">
            <span className="text-stone-900">Total</span>
            <span className="text-stone-900">{formatPrice(total)}</span>
          </div>
        </div>
      </aside>
    </>
  );
};

const AppContent = ({
  brandInfo,
  categories,
  products,
  addToCart,
  submitNewsletter,
  newsletterState,
  cartItems,
  setCartItems,
  menuOpen,
  setMenuOpen,
  loadCatalog,
}) => {
  const location = useLocation();
  const isSellerRoute = location.pathname.startsWith("/seller");

  return (
    <div className="app-shell min-h-screen bg-[#fdfcfb]" data-testid="app-shell">
      <SiteHeader cartCount={cartItems.length} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              brandInfo={brandInfo}
              categories={categories}
              products={products}
              addToCart={addToCart}
              submitNewsletter={submitNewsletter}
              newsletterState={newsletterState}
            />
          }
        />
        <Route path="/shop" element={<ShopPage products={products} categories={categories} addToCart={addToCart} />} />
        <Route path="/product/:slug" element={<ProductPage addToCart={addToCart} />} />
        <Route path="/seller" element={<SellerPortal onCatalogRefresh={loadCatalog} />} />
      </Routes>
      {!isSellerRoute && <Footer brandInfo={brandInfo} />}
      {!isSellerRoute && <CartPanel cartItems={cartItems} setCartItems={setCartItems} />}
    </div>
  );
};

function App() {
  const [brandInfo, setBrandInfo] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newsletterState, setNewsletterState] = useState({ message: "" });

  useEffect(() => {
    const metaDescription = document.querySelector("meta[name='description']") || document.createElement("meta");
    metaDescription.setAttribute("name", "description");
    metaDescription.setAttribute(
      "content",
      "BESTIC FASHION: Premium women lingerie, innerwear and western fashion. Trusted brand since 2016 and Flipkart Platinum Seller.",
    );
    document.head.appendChild(metaDescription);
    document.title = "BESTIC FASHION | Premium Women Lingerie & Western Fashion";
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const [brandResponse, categoryResponse, productResponse] = await Promise.all([
        axios.get(`${API}/brand-info`),
        axios.get(`${API}/categories`),
        axios.get(`${API}/products`),
      ]);

      setBrandInfo(brandResponse.data);
      setCategories(categoryResponse.data);
      setProducts(productResponse.data.items || []);
    } catch (error) {
      console.error("Unable to load BESTIC data", error);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const addToCart = (product, options) => {
    const { size, color } = options;
    setCartItems((prev) => {
      const existing = prev.find((item) => item.slug === product.slug && item.size === size && item.color === color);
      if (existing) {
        return prev.map((item) =>
          item.slug === product.slug && item.size === size && item.color === color
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          slug: product.slug,
          name: product.name,
          size,
          color,
          price: product.price,
          quantity: 1,
        },
      ];
    });
  };

  const submitNewsletter = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const emailEntry = formData.get("email");
    const email = typeof emailEntry === "string" ? emailEntry.trim() : "";

    if (!email) {
      setNewsletterState({ message: "Please enter a valid email address." });
      return;
    }

    try {
      const response = await fetch(`${API}/leads/newsletter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const responseBody = await response.json();
      if (!response.ok) {
        throw new Error(responseBody?.detail || "Unable to subscribe right now. Please try again.");
      }

      const message = responseBody?.message || "Subscription confirmed.";
      setNewsletterState({ message });
      formElement.reset();
    } catch (error) {
      setNewsletterState({
        message: typeof error?.message === "string" ? error.message : "Unable to subscribe right now. Please try again.",
      });
    }
  };

  if (!brandInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 text-stone-700" data-testid="global-loading-state">
        Loading BESTIC FASHION...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AppContent
        brandInfo={brandInfo}
        categories={categories}
        products={products}
        addToCart={addToCart}
        submitNewsletter={submitNewsletter}
        newsletterState={newsletterState}
        cartItems={cartItems}
        setCartItems={setCartItems}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        loadCatalog={loadCatalog}
      />
    </BrowserRouter>
  );
}

export default App;
