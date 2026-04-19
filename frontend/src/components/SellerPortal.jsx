import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Boxes,
  CreditCard,
  Download,
  LayoutDashboard,
  ListPlus,
  Menu,
  PackageCheck,
  PencilLine,
  RefreshCcw,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ORDER_STATUSES = ["New", "Processing", "Packed", "Dispatched", "Shipped", "Delivered", "Returned"];
const STATUS_COLORS = {
  New: "#1d4ed8",
  Processing: "#d97706",
  Shipped: "#0f766e",
  Delivered: "#16a34a",
  Returned: "#dc2626",
};
const ORDER_STAGE_TABS = ["Packed", "Dispatched", "Shipped"];

const sidebarItems = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "order-processing", label: "Order Processing", icon: PackageCheck },
  { key: "manage-inventory", label: "Manage Inventory", icon: Boxes },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "add-listing", label: "Add New Listing", icon: ListPlus },
  { key: "manage-listings", label: "Manage Listings", icon: PencilLine },
];

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

const formatShortDate = (value) =>
  new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(value);

const createDayBucket = (days) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - index - 1));
    return {
      key: date.toISOString().slice(0, 10),
      label: formatShortDate(date),
      date,
    };
  });
};

export default function SellerPortal({ onCatalogRefresh, sessionToken, sellerProfile, onLogout }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [payments, setPayments] = useState(null);
  const [listingDrafts, setListingDrafts] = useState({});
  const [productForm, setProductForm] = useState(defaultProductForm);
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orderStageTab, setOrderStageTab] = useState("Packed");

  const authConfig = useMemo(
    () => ({
      headers: {
        "X-Seller-Session": sessionToken,
      },
    }),
    [sessionToken],
  );

  const initializeListingDrafts = useCallback((items) => {
    setListingDrafts(
      (items || []).reduce(
        (acc, item) => ({
          ...acc,
          [item.slug]: {
            stock: item.stock ?? 0,
            price: item.price ?? 0,
            mrp: item.mrp ?? 0,
          },
        }),
        {},
      ),
    );
  }, []);

  const loadSellerData = useCallback(async () => {
    try {
      setLoading(true);
      const [dashboardRes, orderRes, inventoryRes, paymentRes] = await Promise.all([
        axios.get(`${API}/seller/dashboard`, authConfig),
        axios.get(`${API}/seller/orders`, authConfig),
        axios.get(`${API}/seller/inventory`, authConfig),
        axios.get(`${API}/seller/payments/report`, authConfig),
      ]);

      setDashboard(dashboardRes.data);
      setOrders(orderRes.data || []);
      setInventory(inventoryRes.data || []);
      setPayments(paymentRes.data);
      initializeListingDrafts(inventoryRes.data || []);
    } catch (error) {
      setStatusMessage("Unable to load seller portal data right now.");
    } finally {
      setLoading(false);
    }
  }, [authConfig, initializeListingDrafts]);

  useEffect(() => {
    loadSellerData();
  }, [loadSellerData]);

  const orderAnalytics = useMemo(() => {
    const bucket30 = createDayBucket(30);
    const bucket7 = bucket30.slice(-7);
    const bucket30Map = Object.fromEntries(
      bucket30.map((bucket) => [bucket.key, { ...bucket, orders: 0, revenue: 0 }]),
    );
    const statusCounts = ORDER_STATUSES.reduce((acc, status) => ({ ...acc, [status]: 0 }), {});
    let ordersLast7Days = 0;
    let ordersLast30Days = 0;

    const now = new Date();
    const cutoff7 = new Date(now);
    cutoff7.setDate(now.getDate() - 6);
    cutoff7.setHours(0, 0, 0, 0);
    const cutoff30 = new Date(now);
    cutoff30.setDate(now.getDate() - 29);
    cutoff30.setHours(0, 0, 0, 0);

    orders.forEach((order) => {
      const createdAt = new Date(order.created_at);
      if (Number.isNaN(createdAt.getTime())) {
        return;
      }

      const key = createdAt.toISOString().slice(0, 10);
      if (bucket30Map[key]) {
        bucket30Map[key].orders += 1;
        bucket30Map[key].revenue += Number(order.total_amount || 0);
      }

      if (createdAt >= cutoff7) {
        ordersLast7Days += 1;
      }
      if (createdAt >= cutoff30) {
        ordersLast30Days += 1;
      }

      if (statusCounts[order.order_status] !== undefined) {
        statusCounts[order.order_status] += 1;
      }
    });

    return {
      last30DaysOrders: bucket30.map((bucket) => bucket30Map[bucket.key]),
      last7DaysOrders: bucket7.map((bucket) => bucket30Map[bucket.key]),
      statusFlow: ORDER_STATUSES.map((status) => ({
        name: status,
        value: statusCounts[status],
        fill: STATUS_COLORS[status],
      })),
      ordersLast7Days,
      ordersLast30Days,
    };
  }, [orders]);

  const totalInventoryValue = useMemo(
    () => inventory.reduce((sum, item) => sum + Number(item.stock || 0) * Number(item.price || 0), 0),
    [inventory],
  );

  const visibleOrderStageRows = useMemo(
    () =>
      orders.filter((order) => {
        const stageIndex = ORDER_STAGE_TABS.indexOf(orderStageTab);
        const currentIndex = ORDER_STATUSES.indexOf(order.order_status);
        if (stageIndex === -1 || currentIndex === -1) {
          return false;
        }
        if (orderStageTab === "Packed") {
          return currentIndex <= ORDER_STATUSES.indexOf("Packed");
        }
        if (orderStageTab === "Dispatched") {
          return currentIndex >= ORDER_STATUSES.indexOf("Packed") && currentIndex <= ORDER_STATUSES.indexOf("Dispatched");
        }
        return currentIndex >= ORDER_STATUSES.indexOf("Dispatched") && currentIndex <= ORDER_STATUSES.indexOf("Shipped");
      }),
    [orderStageTab, orders],
  );

  const updateDraft = (slug, field, value) => {
    setListingDrafts((prev) => ({
      ...prev,
      [slug]: {
        ...prev[slug],
        [field]: value,
      },
    }));
  };

  const updateOrderStatus = async (orderId, nextStatus) => {
    try {
      const response = await axios.patch(`${API}/seller/orders/${orderId}`, { order_status: nextStatus }, authConfig);
      setOrders((prev) => prev.map((item) => (item.id === orderId ? response.data : item)));
      const emailStatusText = ["Packed", "Dispatched", "Shipped"].includes(nextStatus)
        ? ` Customer ko ${nextStatus.toLowerCase()} update email bhi bhej diya gaya hai.`
        : "";
      setStatusMessage(`Order status updated successfully.${emailStatusText}`);
      await loadSellerData();
    } catch (error) {
      setStatusMessage("Unable to update order status.");
    }
  };

  const saveInventoryStock = async (slug) => {
    const payload = { stock: Number(listingDrafts[slug]?.stock || 0) };
    try {
      const response = await axios.patch(`${API}/seller/inventory/${slug}`, payload, authConfig);
      setInventory((prev) => prev.map((item) => (item.slug === slug ? response.data : item)));
      updateDraft(slug, "stock", response.data.stock);
      setStatusMessage(`Inventory updated for ${response.data.name}.`);
      onCatalogRefresh();
      await loadSellerData();
    } catch (error) {
      setStatusMessage("Unable to update inventory.");
    }
  };

  const saveListingDetails = async (slug) => {
    const draft = listingDrafts[slug] || {};
    const payload = {
      stock: Number(draft.stock || 0),
      price: Number(draft.price || 0),
      mrp: Number(draft.mrp || 0),
    };

    try {
      const response = await axios.patch(`${API}/seller/inventory/${slug}`, payload, authConfig);
      setInventory((prev) => prev.map((item) => (item.slug === slug ? response.data : item)));
      setStatusMessage(`Listing updated for ${response.data.name}.`);
      onCatalogRefresh();
      await loadSellerData();
    } catch (error) {
      setStatusMessage("Unable to update listing details.");
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
      await axios.post(`${API}/seller/products`, payload, authConfig);
      setStatusMessage("New listing added successfully.");
      setProductForm(defaultProductForm);
      await loadSellerData();
      onCatalogRefresh();
      setActiveTab("manage-listings");
    } catch (error) {
      setStatusMessage("Unable to add product. Please verify listing details.");
    }
  };

  const downloadOrderCsv = async () => {
    try {
      const response = await axios.get(`${API}/seller/orders/report?format=csv`, authConfig);
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

  const renderSidebar = () => (
    <aside className="w-full border-r border-stone-200 bg-[#f5efe8] md:w-72" data-testid="seller-sidebar">
      <div className="border-b border-stone-200 px-5 py-5">
        <p className="text-xs uppercase tracking-[0.26em] text-stone-500">Seller Portal</p>
        <h1 className="mt-2 font-heading text-3xl text-stone-900">BESTIC Workspace</h1>
        {sellerProfile && (
          <div className="mt-4 space-y-1 text-sm text-stone-700">
            <p className="font-medium">{sellerProfile.business_name}</p>
            <p>{sellerProfile.owner_name}</p>
            <p>{sellerProfile.gst_number}</p>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="space-y-2" data-testid="seller-sidebar-nav">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setActiveTab(item.key);
                  setSidebarOpen(false);
                }}
                className={`flex w-full items-center gap-3 border px-4 py-3 text-left text-sm uppercase tracking-[0.14em] transition-colors ${
                  isActive
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
                }`}
                data-testid={`seller-sidebar-${item.key}`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid gap-3">
          <Button variant="outline" className="rounded-none justify-start" onClick={loadSellerData} data-testid="seller-refresh-data-button">
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button className="rounded-none bg-stone-900 justify-start text-xs uppercase tracking-[0.16em] hover:bg-stone-700" onClick={downloadOrderCsv} data-testid="seller-download-orders-report-button">
            <Download className="mr-2 h-4 w-4" /> Download Report
          </Button>
          <Button variant="outline" className="rounded-none justify-start" onClick={onLogout} data-testid="seller-logout-button">
            Logout
          </Button>
        </div>
      </div>
    </aside>
  );

  return (
    <main className="min-h-screen bg-[#fcfaf7]" data-testid="seller-portal-main-content">
      <div className="border-b border-stone-200 bg-white px-4 py-4 md:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Seller Workspace</p>
            <h2 className="font-heading text-2xl text-stone-900">Control Center</h2>
          </div>
          <Button variant="outline" className="rounded-none" onClick={() => setSidebarOpen((prev) => !prev)} data-testid="seller-sidebar-toggle">
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col md:flex-row">
        <div className={`${sidebarOpen ? "block" : "hidden"} md:block`}>{renderSidebar()}</div>

        <section className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mb-6 flex flex-col gap-4 border border-stone-200 bg-white p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Operational Focus</p>
              <h2 className="font-heading text-3xl text-stone-900 md:text-4xl">
                {sidebarItems.find((item) => item.key === activeTab)?.label}
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-stone-600">
                Seller workspace mein orders, inventory, payments aur listings ko ek hi jagah se manage kijiye.
              </p>
            </div>
            {sellerProfile && (
              <div className="border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                Logged in as {sellerProfile.owner_name} on {sellerProfile.email}
              </div>
            )}
          </div>

          {statusMessage && (
            <p className="mb-5 border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-700" data-testid="seller-status-message">
              {statusMessage}
            </p>
          )}

          {loading && (
            <p className="mb-5 text-sm text-stone-600" data-testid="seller-loading-text">
              Loading seller data...
            </p>
          )}

          {activeTab === "dashboard" && dashboard && (
            <section className="space-y-6" data-testid="seller-dashboard-section">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card data-testid="seller-dashboard-total-orders-card">
                  <CardHeader><CardTitle>Total Orders</CardTitle></CardHeader>
                  <CardContent><p className="text-3xl font-semibold text-stone-900">{dashboard.total_orders}</p></CardContent>
                </Card>
                <Card data-testid="seller-dashboard-last-7-days-card">
                  <CardHeader><CardTitle>Orders in Last 7 Days</CardTitle></CardHeader>
                  <CardContent><p className="text-3xl font-semibold text-stone-900">{orderAnalytics.ordersLast7Days}</p></CardContent>
                </Card>
                <Card data-testid="seller-dashboard-last-30-days-card">
                  <CardHeader><CardTitle>Orders in Last 30 Days</CardTitle></CardHeader>
                  <CardContent><p className="text-3xl font-semibold text-stone-900">{orderAnalytics.ordersLast30Days}</p></CardContent>
                </Card>
                <Card data-testid="seller-dashboard-pending-payments-card">
                  <CardHeader><CardTitle>Pending/COD Value</CardTitle></CardHeader>
                  <CardContent><p className="text-3xl font-semibold text-stone-900">{formatPrice(dashboard.pending_payments)}</p></CardContent>
                </Card>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Last 30 Days Order Flow</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={orderAnalytics.last30DaysOrders}>
                        <defs>
                          <linearGradient id="sellerOrderFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1f2937" stopOpacity={0.34} />
                            <stop offset="95%" stopColor="#1f2937" stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="orders" stroke="#1f2937" fill="url(#sellerOrderFill)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Order Status Flow</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={orderAnalytics.statusFlow} dataKey="value" nameKey="name" innerRadius={65} outerRadius={100} paddingAngle={3}>
                          {orderAnalytics.statusFlow.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Last 7 Days Order Trend</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={orderAnalytics.last7DaysOrders}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="orders" fill="#44403c" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Revenue Flow in Last 30 Days</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={orderAnalytics.last30DaysOrders}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value) => formatPrice(value)} />
                        <Line type="monotone" dataKey="revenue" stroke="#b45309" strokeWidth={2.5} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Card><CardHeader><CardTitle>Paid Revenue</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{formatPrice(dashboard.total_revenue)}</p></CardContent></Card>
                <Card><CardHeader><CardTitle>Processing Orders</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{dashboard.processing_orders}</p></CardContent></Card>
                <Card><CardHeader><CardTitle>Low Stock Items</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{dashboard.low_stock_items}</p></CardContent></Card>
              </div>
            </section>
          )}

          {activeTab === "order-processing" && (
            <section className="space-y-5" data-testid="seller-orders-section">
              <div className="flex flex-wrap gap-3" data-testid="seller-order-stage-tabs">
                {ORDER_STAGE_TABS.map((stage) => (
                  <Button
                    key={stage}
                    type="button"
                    variant={orderStageTab === stage ? "default" : "outline"}
                    className="rounded-none text-xs uppercase tracking-[0.16em]"
                    onClick={() => setOrderStageTab(stage)}
                    data-testid={`seller-order-stage-tab-${stage.toLowerCase()}`}
                  >
                    {stage}
                  </Button>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>{orderStageTab} Orders Queue</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="min-w-full border border-stone-200 bg-white">
                    <thead className="bg-stone-100">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Order</th>
                        <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Customer</th>
                        <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Email</th>
                        <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Marketplace</th>
                        <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Payment</th>
                        <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Status</th>
                        <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Move Order</th>
                        <th className="px-3 py-2 text-left text-xs uppercase tracking-[0.14em]">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOrderStageRows.map((order) => (
                        <tr key={order.id} className="border-t border-stone-200">
                          <td className="px-3 py-3 text-sm font-medium text-stone-900">{order.order_number}</td>
                          <td className="px-3 py-3 text-sm text-stone-700">
                            <div>{order.customer_name}</div>
                            <div className="text-xs text-stone-500">{order.customer_phone}</div>
                          </td>
                          <td className="px-3 py-3 text-sm text-stone-700">{order.customer_email}</td>
                          <td className="px-3 py-3 text-sm text-stone-700">{order.marketplace}</td>
                          <td className="px-3 py-3 text-sm text-stone-700">{order.payment_status}</td>
                          <td className="px-3 py-3 text-sm font-medium text-stone-900">{order.order_status}</td>
                          <td className="px-3 py-3 text-sm">
                            <div className="flex flex-wrap gap-2">
                              {ORDER_STAGE_TABS
                                .filter((status) => ORDER_STATUSES.indexOf(status) >= ORDER_STATUSES.indexOf(order.order_status))
                                .map((status) => (
                                  <Button
                                    key={status}
                                    type="button"
                                    variant={status === order.order_status ? "default" : "outline"}
                                    className="rounded-none text-[11px] uppercase tracking-[0.14em]"
                                    onClick={() => updateOrderStatus(order.id, status)}
                                    disabled={status === order.order_status}
                                  >
                                    {status}
                                  </Button>
                                ))}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-sm font-medium text-stone-900">{formatPrice(order.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {visibleOrderStageRows.length === 0 && (
                    <p className="p-4 text-sm text-stone-500">Is stage ke liye abhi koi order queue mein nahi hai.</p>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {activeTab === "manage-inventory" && (
            <section className="space-y-5" data-testid="seller-inventory-section">
              <div className="grid gap-4 md:grid-cols-3">
                <Card><CardHeader><CardTitle>Total Inventory Value</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{formatPrice(totalInventoryValue)}</p></CardContent></Card>
                <Card><CardHeader><CardTitle>Total SKUs</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{inventory.length}</p></CardContent></Card>
                <Card><CardHeader><CardTitle>Low Stock Alert</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{inventory.filter((item) => Number(item.stock) <= 10).length}</p></CardContent></Card>
              </div>

              <div className="space-y-3">
                {inventory.map((item) => (
                  <div key={item.slug} className="grid gap-3 border border-stone-200 bg-white p-4 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-center">
                    <div>
                      <p className="font-medium text-stone-900">{item.name}</p>
                      <p className="text-xs text-stone-500">SKU: {item.sku}</p>
                    </div>
                    <p className="text-sm text-stone-700">{formatPrice(item.price)}</p>
                    <Input
                      type="number"
                      min="0"
                      value={listingDrafts[item.slug]?.stock ?? 0}
                      onChange={(event) => updateDraft(item.slug, "stock", event.target.value)}
                    />
                    <Button className="rounded-none bg-stone-900 text-xs uppercase tracking-[0.14em] hover:bg-stone-700" onClick={() => saveInventoryStock(item.slug)}>
                      Save Stock
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === "payments" && payments && (
            <section className="space-y-6" data-testid="seller-payments-section">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card><CardHeader><CardTitle>Total Orders</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{payments.total_orders}</p></CardContent></Card>
                <Card><CardHeader><CardTitle>Paid Amount</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{formatPrice(payments.paid_amount)}</p></CardContent></Card>
                <Card><CardHeader><CardTitle>Pending Amount</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{formatPrice(payments.pending_amount)}</p></CardContent></Card>
                <Card><CardHeader><CardTitle>COD Amount</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{formatPrice(payments.cod_amount)}</p></CardContent></Card>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Method Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(payments.method_breakdown || []).map((item) => (
                      <div key={item.payment_method} className="flex items-center justify-between border-b border-stone-100 pb-2">
                        <span className="text-sm text-stone-700">{item.payment_method} ({item.orders} orders)</span>
                        <strong className="text-sm text-stone-900">{formatPrice(item.amount)}</strong>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Last 30 Days Revenue Flow</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={orderAnalytics.last30DaysOrders}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value) => formatPrice(value)} />
                        <Bar dataKey="revenue" fill="#0f766e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </section>
          )}

          {activeTab === "add-listing" && (
            <section data-testid="seller-add-product-section">
              <Card>
                <CardHeader>
                  <CardTitle>Add New Listing</CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-4" onSubmit={handleAddProduct}>
                    <Input placeholder="Product name" value={productForm.name} onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))} required />
                    <Textarea placeholder="Product description" value={productForm.description} onChange={(event) => setProductForm((prev) => ({ ...prev, description: event.target.value }))} required />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input placeholder="Category slug" value={productForm.category_slug} onChange={(event) => setProductForm((prev) => ({ ...prev, category_slug: event.target.value }))} required />
                      <Input type="number" placeholder="Opening stock" value={productForm.stock} onChange={(event) => setProductForm((prev) => ({ ...prev, stock: event.target.value }))} required />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input type="number" placeholder="Selling price" value={productForm.price} onChange={(event) => setProductForm((prev) => ({ ...prev, price: event.target.value }))} required />
                      <Input type="number" placeholder="MRP" value={productForm.mrp} onChange={(event) => setProductForm((prev) => ({ ...prev, mrp: event.target.value }))} required />
                    </div>
                    <Input placeholder="Image URLs (comma separated)" value={productForm.image_urls} onChange={(event) => setProductForm((prev) => ({ ...prev, image_urls: event.target.value }))} required />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input placeholder="Sizes comma separated" value={productForm.sizes} onChange={(event) => setProductForm((prev) => ({ ...prev, sizes: event.target.value }))} required />
                      <Input placeholder="Colors comma separated" value={productForm.colors} onChange={(event) => setProductForm((prev) => ({ ...prev, colors: event.target.value }))} required />
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={productForm.is_new} onChange={(event) => setProductForm((prev) => ({ ...prev, is_new: event.target.checked }))} />
                        Mark as new
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={productForm.is_bestseller} onChange={(event) => setProductForm((prev) => ({ ...prev, is_bestseller: event.target.checked }))} />
                        Mark as bestseller
                      </label>
                    </div>
                    <Button className="w-fit rounded-none bg-stone-900 text-xs uppercase tracking-[0.16em] hover:bg-stone-700">
                      <ListPlus className="mr-2 h-4 w-4" /> Add Listing
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </section>
          )}

          {activeTab === "manage-listings" && (
            <section className="space-y-5" data-testid="seller-manage-listings-section">
              {inventory.map((item) => (
                <Card key={item.slug}>
                  <CardContent className="grid gap-4 p-5 xl:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_auto] xl:items-end">
                    <div>
                      <p className="font-heading text-2xl text-stone-900">{item.name}</p>
                      <p className="mt-1 text-sm text-stone-500">{item.slug}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-stone-500">SKU: {item.sku}</p>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-stone-500">Price</label>
                      <Input type="number" value={listingDrafts[item.slug]?.price ?? 0} onChange={(event) => updateDraft(item.slug, "price", event.target.value)} />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-stone-500">MRP</label>
                      <Input type="number" value={listingDrafts[item.slug]?.mrp ?? 0} onChange={(event) => updateDraft(item.slug, "mrp", event.target.value)} />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-stone-500">Stock</label>
                      <Input type="number" value={listingDrafts[item.slug]?.stock ?? 0} onChange={(event) => updateDraft(item.slug, "stock", event.target.value)} />
                    </div>
                    <Button className="rounded-none bg-stone-900 text-xs uppercase tracking-[0.16em] hover:bg-stone-700" onClick={() => saveListingDetails(item.slug)}>
                      Update Listing
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
