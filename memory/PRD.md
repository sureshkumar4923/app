# PRD - BESTIC FASHION Ecommerce + Seller Portal

## Original Problem Statement
Create a premium, modern, high-converting ecommerce website for BESTIC FASHION (est. 2016), focused on women’s lingerie, innerwear and western fashion with luxury minimal design, marketplace trust elements, product detail experience, and mobile responsiveness. Later request added: seller portal to manage payments, orders reports, order processing, inventory, and adding new products.

## Architecture Decisions
- Stack kept as React + FastAPI + MongoDB.
- Backend expanded with catalog, newsletter, cart preview, and seller management APIs under `/api`.
- Mongo responses always exclude `_id` and use Pydantic response models to avoid BSON serialization issues.
- Frontend routing includes public storefront pages plus `/seller` management portal.
- Seller portal uses same backend APIs for dashboard/order/inventory/payments and product creation.

## What Has Been Implemented
- Luxury storefront: hero, categories, bestsellers, about, why choose us, trust section, footer, mobile navigation.
- Product experience: listing filters, product details with images/size/color/reviews, add-to-cart interactions, cart summary panel.
- Trust and conversion: marketplace badges, newsletter capture with working backend integration.
- Backend ecommerce APIs: brand info, categories, products, product-by-slug, newsletter leads, cart preview.
- Seller portal features:
  - Seller dashboard metrics (orders, revenue, pending payments, low stock)
  - Orders management + order status updates
  - Payments reporting + payment method breakdown
  - Orders CSV report download endpoint
  - Inventory management (stock updates)
  - Add new product flow
- Regression fixes:
  - Added/ensured `bestic-elegance` product slug endpoint works.
  - Fixed newsletter frontend submission flow.

## Prioritized Backlog
### P0
- Add seller authentication/role-based access (admin/staff) to secure `/seller` actions.
- Connect real order intake flow from storefront checkout to seller orders (currently operations are management-focused).

### P1
- Improve cart/checkout UX with dedicated cart page and checkout stepper.
- Marketplace-wise reporting filters (date range, channel, payment status).
- Pagination + search in seller orders/inventory for scale.

### P2
- Product media manager (multiple image upload UI and validation).
- Advanced inventory controls (reorder thresholds, alerts, stock movement log).
- Customer CRM layer (returns handling notes, support ticket linkage).

## Next Tasks
1. Add secure seller login and role permissions.
2. Add complete checkout/order creation flow tied to seller order table.
3. Add analytics filters and export improvements for business reporting.
