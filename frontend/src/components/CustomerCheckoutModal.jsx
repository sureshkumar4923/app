import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const emptyLoginForm = { email: "", password: "" };
const emptyRegisterForm = { name: "", email: "", phone: "", password: "" };
const emptyBillingForm = {
  full_name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
};

const formatPrice = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

export default function CustomerCheckoutModal({
  open,
  onClose,
  checkoutItems,
  customerSession,
  customerProfile,
  onAuthSuccess,
  onOrderPlaced,
}) {
  const [view, setView] = useState("login");
  const [loginForm, setLoginForm] = useState(emptyLoginForm);
  const [registerForm, setRegisterForm] = useState(emptyRegisterForm);
  const [billingForm, setBillingForm] = useState(emptyBillingForm);
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [placedOrder, setPlacedOrder] = useState(null);

  const totals = useMemo(() => {
    const subtotal = checkoutItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
    const shipping = subtotal >= 1499 || subtotal === 0 ? 0 : 99;
    return {
      subtotal,
      shipping,
      total: subtotal + shipping,
    };
  }, [checkoutItems]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setStatusMessage("");
    setPlacedOrder(null);
    setView(customerSession ? "checkout" : "login");
    if (customerProfile) {
      setBillingForm({
        full_name: customerProfile.billing_address?.full_name || customerProfile.name || "",
        phone: customerProfile.billing_address?.phone || customerProfile.phone || "",
        line1: customerProfile.billing_address?.line1 || "",
        line2: customerProfile.billing_address?.line2 || "",
        city: customerProfile.billing_address?.city || "",
        state: customerProfile.billing_address?.state || "",
        pincode: customerProfile.billing_address?.pincode || "",
        country: customerProfile.billing_address?.country || "India",
      });
    } else {
      setBillingForm(emptyBillingForm);
    }
  }, [customerProfile, customerSession, open]);

  if (!open) {
    return null;
  }

  const authHeaders = customerSession
    ? {
        headers: {
          "X-Customer-Session": customerSession,
        },
      }
    : {};

  const handleLogin = async (event) => {
    event.preventDefault();
    try {
      setLoading(true);
      const response = await axios.post(`${API}/customer/auth/login`, loginForm);
      onAuthSuccess(response.data.session_token, response.data.customer);
      setView("checkout");
      setStatusMessage("Customer login successful. Checkout continue kijiye.");
    } catch (error) {
      setStatusMessage(error.response?.data?.detail || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    try {
      setLoading(true);
      const response = await axios.post(`${API}/customer/auth/register`, registerForm);
      onAuthSuccess(response.data.session_token, response.data.customer);
      setBillingForm((prev) => ({
        ...prev,
        full_name: response.data.customer.name,
        phone: response.data.customer.phone,
      }));
      setView("checkout");
      setStatusMessage("Customer account created. Billing details complete karke order place karein.");
    } catch (error) {
      setStatusMessage(error.response?.data?.detail || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceOrder = async (event) => {
    event.preventDefault();
    try {
      setLoading(true);
      await axios.put(`${API}/customer/billing`, { billing_address: billingForm }, authHeaders);
      const response = await axios.post(
        `${API}/customer/orders`,
        {
          items: checkoutItems.map((item) => ({
            slug: item.slug,
            size: item.size,
            color: item.color,
            quantity: item.quantity,
          })),
          payment_method: paymentMethod,
          billing_address: billingForm,
        },
        authHeaders,
      );
      setPlacedOrder(response.data);
      setStatusMessage("Order placed successfully.");
      onOrderPlaced(response.data);
    } catch (error) {
      setStatusMessage(error.response?.data?.detail || "Order place nahi ho paya.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/45 px-4 py-6" data-testid="customer-checkout-modal">
      <div className="mx-auto max-h-[92vh] w-full max-w-5xl overflow-y-auto border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Secure Checkout</p>
            <h2 className="font-heading text-3xl text-stone-900">Buy Now</h2>
          </div>
          <button type="button" className="rounded-full border border-stone-300 p-2" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {checkoutItems.map((item) => (
                <div key={`${item.slug}-${item.size}-${item.color}`} className="border border-stone-200 p-3">
                  <p className="font-medium text-stone-900">{item.name}</p>
                  <p className="mt-1 text-xs text-stone-500">{item.size} | {item.color} | Qty {item.quantity}</p>
                  <p className="mt-2 text-sm font-medium text-stone-900">{formatPrice(item.price * item.quantity)}</p>
                </div>
              ))}

              <div className="space-y-2 border-t border-stone-200 pt-4 text-sm">
                <div className="flex items-center justify-between"><span>Subtotal</span><span>{formatPrice(totals.subtotal)}</span></div>
                <div className="flex items-center justify-between"><span>Shipping</span><span>{totals.shipping === 0 ? "Free" : formatPrice(totals.shipping)}</span></div>
                <div className="flex items-center justify-between border-t border-stone-200 pt-2 font-medium"><span>Total</span><span>{formatPrice(totals.total)}</span></div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            {statusMessage && <div className="border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">{statusMessage}</div>}

            {!customerSession && (
              <div className="flex gap-3">
                <Button variant={view === "login" ? "default" : "outline"} className="rounded-none" onClick={() => setView("login")}>
                  Customer Login
                </Button>
                <Button variant={view === "register" ? "default" : "outline"} className="rounded-none" onClick={() => setView("register")}>
                  Register
                </Button>
              </div>
            )}

            {!customerSession && view === "login" && (
              <Card>
                <CardHeader><CardTitle>Customer Login</CardTitle></CardHeader>
                <CardContent>
                  <form className="grid gap-4" onSubmit={handleLogin}>
                    <Input type="email" placeholder="Email" value={loginForm.email} onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))} required />
                    <Input type="password" placeholder="Password" value={loginForm.password} onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))} required />
                    <Button className="rounded-none bg-stone-900 hover:bg-stone-700" disabled={loading}>{loading ? "Please wait..." : "Login"}</Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {!customerSession && view === "register" && (
              <Card>
                <CardHeader><CardTitle>Create Customer Account</CardTitle></CardHeader>
                <CardContent>
                  <form className="grid gap-4" onSubmit={handleRegister}>
                    <Input placeholder="Full name" value={registerForm.name} onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))} required />
                    <Input type="email" placeholder="Email" value={registerForm.email} onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))} required />
                    <Input placeholder="Phone" value={registerForm.phone} onChange={(event) => setRegisterForm((prev) => ({ ...prev, phone: event.target.value }))} required />
                    <Input type="password" placeholder="Password" value={registerForm.password} onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))} required />
                    <Button className="rounded-none bg-stone-900 hover:bg-stone-700" disabled={loading}>{loading ? "Creating..." : "Register"}</Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {customerSession && (
              <Card>
                <CardHeader><CardTitle>Billing Address & Payment</CardTitle></CardHeader>
                <CardContent>
                  <form className="grid gap-4" onSubmit={handlePlaceOrder}>
                    <Input placeholder="Full name" value={billingForm.full_name} onChange={(event) => setBillingForm((prev) => ({ ...prev, full_name: event.target.value }))} required />
                    <Input placeholder="Phone" value={billingForm.phone} onChange={(event) => setBillingForm((prev) => ({ ...prev, phone: event.target.value }))} required />
                    <Textarea placeholder="Address line 1" value={billingForm.line1} onChange={(event) => setBillingForm((prev) => ({ ...prev, line1: event.target.value }))} required />
                    <Input placeholder="Address line 2" value={billingForm.line2} onChange={(event) => setBillingForm((prev) => ({ ...prev, line2: event.target.value }))} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input placeholder="City" value={billingForm.city} onChange={(event) => setBillingForm((prev) => ({ ...prev, city: event.target.value }))} required />
                      <Input placeholder="State" value={billingForm.state} onChange={(event) => setBillingForm((prev) => ({ ...prev, state: event.target.value }))} required />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input placeholder="Pincode" value={billingForm.pincode} onChange={(event) => setBillingForm((prev) => ({ ...prev, pincode: event.target.value }))} required />
                      <Input placeholder="Country" value={billingForm.country} onChange={(event) => setBillingForm((prev) => ({ ...prev, country: event.target.value }))} required />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Payment Method</p>
                      <div className="flex flex-wrap gap-2">
                        {["COD", "UPI", "Card"].map((method) => (
                          <Button key={method} type="button" variant={paymentMethod === method ? "default" : "outline"} className="rounded-none" onClick={() => setPaymentMethod(method)}>
                            {method}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <Button className="rounded-none bg-stone-900 hover:bg-stone-700" disabled={loading}>
                      {loading ? "Processing..." : "Place Order"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {placedOrder && (
              <Card className="border-stone-900 bg-[#f8f2ed]">
                <CardHeader><CardTitle>Order Successfully Placed</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm text-stone-700">
                  <p>Your order has been confirmed and tracking updates will come by email.</p>
                  <div className="grid gap-2 border border-stone-300 bg-white p-4">
                    <div className="flex items-center justify-between"><span>Order Number</span><strong>{placedOrder.order_number}</strong></div>
                    <div className="flex items-center justify-between"><span>Total Amount</span><strong>{formatPrice(placedOrder.total_amount)}</strong></div>
                    <div className="flex items-center justify-between"><span>Status</span><strong>New</strong></div>
                  </div>
                  <Button className="rounded-none bg-stone-900 hover:bg-stone-700" onClick={onClose}>Continue Shopping</Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
