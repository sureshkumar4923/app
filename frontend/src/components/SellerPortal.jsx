import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Download, Plus, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ORDER_STATUSES = ["New", "Processing", "Shipped", "Delivered", "Returned"];

const defaultProductForm = {
  name: "",
  description: "",
  category_slug: "lingerie-sets",
  price: "",
  mrp: "",
  image_urls: "",
  sizes: "S,M,L,XL",
  colors: "Nude,Black",
  stock: "20",
  is_new: true,
  is_bestseller: false,
};

const formatPrice = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

export default function SellerPortal({ onCatalogRefresh }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [payments, setPayments] = useState(null);
  const [stockDrafts, setStockDrafts] = useState({});
  const [productForm, setProductForm] = useState(defaultProductForm);
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadSellerData = async () => {
    try {
      setLoading(true);
      const [dashboardRes, orderRes, inventoryRes, paymentRes] = await Promise.all([
        axios.get(`${API}/seller/dashboard`),
        axios.get(`${API}/seller/orders`),
        axios.get(`${API}/seller/inventory`),
        axios.get(`${API}/seller/payments/report`),
      ]);

      setDashboard(dashboardRes.data);
      setOrders(orderRes.data || []);
      setInventory(inventoryRes.data || []);
      setPayments(paymentRes.data);
      setStockDrafts(
        (inventoryRes.data || []).reduce((acc, item) => ({ ...acc, [item.slug]: item.stock }), {}),
      );
    } catch (error) {
      setStatusMessage("Unable to load seller portal data right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSellerData();
  }, []);

  const totalInventoryValue = useMemo(
    () => inventory.reduce((sum, item) => sum + Number(item.stock || 0) * Number(item.price || 0), 0),
    [inventory],
  );

  const updateOrderStatus = async (orderId, nextStatus) => {
    try {
      const response = await axios.patch(`${API}/seller/orders/${orderId}`, { order_status: nextStatus });
      setOrders((prev) => prev.map((item) => (item.id === orderId ? response.data : item)));
      setStatusMessage("Order status updated successfully.");
    } catch (error) {
      setStatusMessage("Unable to update order status.");
    }
  };

  const saveStock = async (slug) => {
    const payload = { stock: Number(stockDrafts[slug] || 0) };
    try {
      const response = await axios.patch(`${API}/seller/inventory/${slug}`, payload);
      setInventory((prev) => prev.map((item) => (item.slug === slug ? response.data : item)));
      setStatusMessage(`Inventory updated for ${response.data.name}.`);
      onCatalogRefresh();
    } catch (error) {
      setStatusMessage("Unable to update inventory.");
    }
  };

  const handleAddProduct = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...productForm,
        price: Number(productForm.price),
        mrp: Number(productForm.mrp),
        stock: Number(productForm.stock),
        image_urls: productForm.image_urls
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        sizes: productForm.sizes
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        colors: productForm.colors
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      };
      await axios.post(`${API}/seller/products`, payload);
      setStatusMessage("Product added successfully.");
      setProductForm(defaultProductForm);
      await loadSellerData();
      onCatalogRefresh();
    } catch (error) {
      setStatusMessage("Unable to add product. Please verify product details.");
    }
  };

  const downloadOrderCsv = async () => {
    try {
      const response = await axios.get(`${API}/seller/orders/report?format=csv`);
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = "bestic_orders_report.csv";
      link.click();
      URL.revokeObjectURL(url);
      setStatusMessage("Orders report downloaded.");
    } catch (error) {
      setStatusMessage("Unable to download orders report right now.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10 md:px-12 md:py-14" data-testid="seller-portal-main-content">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500" data-testid="seller-portal-kicker">
            Seller Portal
          </p>
          <h1 className="font-heading text-4xl text-stone-900 md:text-5xl" data-testid="seller-portal-heading">
            Orders, Inventory & Payments Management
          </h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="rounded-none text-xs uppercase tracking-[0.16em]"
            onClick={loadSellerData}
            data-testid="seller-refresh-data-button"
          >
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button
            className="rounded-none bg-stone-900 text-xs uppercase tracking-[0.16em] hover:bg-stone-700"
            onClick={downloadOrderCsv}
            data-testid="seller-download-orders-report-button"
          >
            <Download className="mr-2 h-4 w-4" /> Download Report
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3" data-testid="seller-tab-controls">
        {[
          { key: "dashboard", label: "Dashboard" },
          { key: "orders", label: "Orders" },
          { key: "inventory", label: "Inventory" },
          { key: "payments", label: "Payments" },
          { key: "add-product", label: "Add Product" },
        ].map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "default" : "outline"}
            className="rounded-none text-xs uppercase tracking-[0.14em]"
            onClick={() => setActiveTab(tab.key)}
            data-testid={`seller-tab-${tab.key}-button`}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {statusMessage && (
        <p className="mt-4 border border-stone-300 bg-stone-50 px-4 py-2 text-sm text-stone-700" data-testid="seller-status-message">
          {statusMessage}
        </p>
      )}

      {loading && (
        <p className="mt-4 text-sm text-stone-600" data-testid="seller-loading-text">
          Loading seller data...
        </p>
      )}

      {activeTab === "dashboard" && dashboard && (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="seller-dashboard-grid">
          <Card data-testid="seller-dashboard-total-orders-card">
            <CardHeader><CardTitle>Total Orders</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-semibold text-stone-900" data-testid="seller-dashboard-total-orders-value">{dashboard.total_orders}</p></CardContent>
          </Card>
          <Card data-testid="seller-dashboard-new-orders-card">
            <CardHeader><CardTitle>New Orders</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-semibold text-stone-900" data-testid="seller-dashboard-new-orders-value">{dashboard.new_orders}</p></CardContent>
          </Card>
          <Card data-testid="seller-dashboard-processing-orders-card">
            <CardHeader><CardTitle>Processing Orders</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-semibold text-stone-900" data-testid="seller-dashboard-processing-orders-value">{dashboard.processing_orders}</p></CardContent>
          </Card>
          <Card data-testid="seller-dashboard-low-stock-card">
            <CardHeader><CardTitle>Low Stock Items</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-semibold text-stone-900" data-testid="seller-dashboard-low-stock-value">{dashboard.low_stock_items}</p></CardContent>
          </Card>
          <Card data-testid="seller-dashboard-revenue-card">
            <CardHeader><CardTitle>Total Revenue (Paid)</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-semibold text-stone-900" data-testid="seller-dashboard-revenue-value">{formatPrice(dashboard.total_revenue)}</p></CardContent>
          </Card>
          <Card data-testid="seller-dashboard-pending-payments-card">
            <CardHeader><CardTitle>Pending/COD Value</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-semibold text-stone-900" data-testid="seller-dashboard-pending-payments-value">{formatPrice(dashboard.pending_payments)}</p></CardContent>
          </Card>
        </section>
      )}

      {activeTab === "orders" && (
        <section className="mt-8 overflow-x-auto" data-testid="seller-orders-section">
          <table className="min-w-full border border-stone-200 bg-white" data-testid="seller-orders-table">
            <thead className="bg-stone-100">
              <tr>
                <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Order</th>
                <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Customer</th>
                <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Marketplace</th>
                <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Payment</th>
                <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Status</th>
                <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Amount</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-stone-200" data-testid={`seller-order-row-${order.id}`}>
                  <td className="px-3 py-3 text-sm" data-testid={`seller-order-number-${order.id}`}>{order.order_number}</td>
                  <td className="px-3 py-3 text-sm" data-testid={`seller-order-customer-${order.id}`}>{order.customer_name}</td>
                  <td className="px-3 py-3 text-sm" data-testid={`seller-order-marketplace-${order.id}`}>{order.marketplace}</td>
                  <td className="px-3 py-3 text-sm" data-testid={`seller-order-payment-${order.id}`}>{order.payment_status}</td>
                  <td className="px-3 py-3 text-sm">
                    <select
                      className="border border-stone-300 px-2 py-1 text-xs"
                      value={order.order_status}
                      onChange={(event) => updateOrderStatus(order.id, event.target.value)}
                      data-testid={`seller-order-status-select-${order.id}`}
                    >
                      {ORDER_STATUSES.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-sm" data-testid={`seller-order-amount-${order.id}`}>{formatPrice(order.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === "inventory" && (
        <section className="mt-8" data-testid="seller-inventory-section">
          <div className="mb-4 border border-stone-200 bg-stone-50 p-4 text-sm" data-testid="seller-inventory-summary">
            Total inventory value: <strong data-testid="seller-inventory-total-value">{formatPrice(totalInventoryValue)}</strong>
          </div>
          <div className="space-y-3">
            {inventory.map((item) => (
              <div key={item.slug} className="grid gap-3 border border-stone-200 bg-white p-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-center" data-testid={`seller-inventory-row-${item.slug}`}>
                <div>
                  <p className="font-medium text-stone-900" data-testid={`seller-inventory-name-${item.slug}`}>{item.name}</p>
                  <p className="text-xs text-stone-500" data-testid={`seller-inventory-sku-${item.slug}`}>SKU: {item.sku}</p>
                </div>
                <p className="text-sm text-stone-700" data-testid={`seller-inventory-price-${item.slug}`}>{formatPrice(item.price)}</p>
                <Input
                  type="number"
                  min="0"
                  value={stockDrafts[item.slug] ?? 0}
                  onChange={(event) => setStockDrafts((prev) => ({ ...prev, [item.slug]: event.target.value }))}
                  data-testid={`seller-inventory-stock-input-${item.slug}`}
                />
                <Button
                  className="rounded-none bg-stone-900 text-xs uppercase tracking-[0.14em] hover:bg-stone-700"
                  onClick={() => saveStock(item.slug)}
                  data-testid={`seller-inventory-save-button-${item.slug}`}
                >
                  Save
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "payments" && payments && (
        <section className="mt-8 space-y-6" data-testid="seller-payments-section">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card data-testid="seller-payments-total-orders-card"><CardHeader><CardTitle>Total Orders</CardTitle></CardHeader><CardContent><p className="text-2xl" data-testid="seller-payments-total-orders-value">{payments.total_orders}</p></CardContent></Card>
            <Card data-testid="seller-payments-paid-card"><CardHeader><CardTitle>Paid Amount</CardTitle></CardHeader><CardContent><p className="text-2xl" data-testid="seller-payments-paid-value">{formatPrice(payments.paid_amount)}</p></CardContent></Card>
            <Card data-testid="seller-payments-pending-card"><CardHeader><CardTitle>Pending Amount</CardTitle></CardHeader><CardContent><p className="text-2xl" data-testid="seller-payments-pending-value">{formatPrice(payments.pending_amount)}</p></CardContent></Card>
            <Card data-testid="seller-payments-cod-card"><CardHeader><CardTitle>COD Amount</CardTitle></CardHeader><CardContent><p className="text-2xl" data-testid="seller-payments-cod-value">{formatPrice(payments.cod_amount)}</p></CardContent></Card>
          </div>
          <div className="border border-stone-200 bg-white p-4" data-testid="seller-payment-method-breakdown">
            <h2 className="mb-4 font-heading text-2xl text-stone-900" data-testid="seller-payment-method-breakdown-heading">Payment Method Breakdown</h2>
            <div className="space-y-3">
              {(payments.method_breakdown || []).map((item) => (
                <div key={item.payment_method} className="flex items-center justify-between border-b border-stone-100 pb-2" data-testid={`seller-payment-method-row-${item.payment_method.toLowerCase()}`}>
                  <span className="text-sm text-stone-700">{item.payment_method} ({item.orders} orders)</span>
                  <strong className="text-sm text-stone-900">{formatPrice(item.amount)}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === "add-product" && (
        <section className="mt-8" data-testid="seller-add-product-section">
          <Card>
            <CardHeader>
              <CardTitle data-testid="seller-add-product-heading">Add New Product</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={handleAddProduct} data-testid="seller-add-product-form">
                <Input
                  placeholder="Product name"
                  value={productForm.name}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))}
                  data-testid="seller-add-product-name-input"
                  required
                />
                <Textarea
                  placeholder="Product description"
                  value={productForm.description}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, description: event.target.value }))}
                  data-testid="seller-add-product-description-input"
                  required
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    placeholder="Category slug"
                    value={productForm.category_slug}
                    onChange={(event) => setProductForm((prev) => ({ ...prev, category_slug: event.target.value }))}
                    data-testid="seller-add-product-category-input"
                    required
                  />
                  <Input
                    type="number"
                    placeholder="Stock"
                    value={productForm.stock}
                    onChange={(event) => setProductForm((prev) => ({ ...prev, stock: event.target.value }))}
                    data-testid="seller-add-product-stock-input"
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    type="number"
                    placeholder="Selling price"
                    value={productForm.price}
                    onChange={(event) => setProductForm((prev) => ({ ...prev, price: event.target.value }))}
                    data-testid="seller-add-product-price-input"
                    required
                  />
                  <Input
                    type="number"
                    placeholder="MRP"
                    value={productForm.mrp}
                    onChange={(event) => setProductForm((prev) => ({ ...prev, mrp: event.target.value }))}
                    data-testid="seller-add-product-mrp-input"
                    required
                  />
                </div>
                <Input
                  placeholder="Image URLs (comma separated)"
                  value={productForm.image_urls}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, image_urls: event.target.value }))}
                  data-testid="seller-add-product-images-input"
                  required
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    placeholder="Sizes comma separated (S,M,L)"
                    value={productForm.sizes}
                    onChange={(event) => setProductForm((prev) => ({ ...prev, sizes: event.target.value }))}
                    data-testid="seller-add-product-sizes-input"
                    required
                  />
                  <Input
                    placeholder="Colors comma separated"
                    value={productForm.colors}
                    onChange={(event) => setProductForm((prev) => ({ ...prev, colors: event.target.value }))}
                    data-testid="seller-add-product-colors-input"
                    required
                  />
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm" data-testid="seller-add-product-is-new-label">
                    <input
                      type="checkbox"
                      checked={productForm.is_new}
                      onChange={(event) => setProductForm((prev) => ({ ...prev, is_new: event.target.checked }))}
                      data-testid="seller-add-product-is-new-checkbox"
                    />
                    Mark as new
                  </label>
                  <label className="flex items-center gap-2 text-sm" data-testid="seller-add-product-is-bestseller-label">
                    <input
                      type="checkbox"
                      checked={productForm.is_bestseller}
                      onChange={(event) => setProductForm((prev) => ({ ...prev, is_bestseller: event.target.checked }))}
                      data-testid="seller-add-product-is-bestseller-checkbox"
                    />
                    Mark as bestseller
                  </label>
                </div>
                <Button className="w-fit rounded-none bg-stone-900 text-xs uppercase tracking-[0.16em] hover:bg-stone-700" data-testid="seller-add-product-submit-button">
                  <Plus className="mr-2 h-4 w-4" /> Add Product
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  );
}