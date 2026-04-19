import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ArrowRight, CheckCircle2, Mail, ShieldCheck, Store } from "lucide-react";
import SellerPortal from "@/components/SellerPortal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SESSION_STORAGE_KEY = "bestic_seller_session";

const emptyRegistrationForm = {
  business_name: "",
  owner_name: "",
  email: "",
  phone: "",
  gst_number: "",
  business_address: "",
  city: "",
  state: "",
  pincode: "",
};

const emptyLoginForm = {
  email: "",
};

const otpInitialState = {
  email: "",
  otp: "",
  deliveryChannel: "",
  debugOtp: "",
  intent: "",
};

function SellerInfoStrip() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {[
        "GST-ready seller onboarding",
        "Email OTP verification flow",
        "Dashboard, payments and inventory control",
      ].map((item) => (
        <div key={item} className="flex items-start gap-3 border border-stone-200 bg-white/80 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-stone-900" />
          <p className="text-sm text-stone-700">{item}</p>
        </div>
      ))}
    </div>
  );
}

export default function SellerAuthPortal({ onCatalogRefresh, onSessionStateChange }) {
  const [view, setView] = useState("landing");
  const [registerForm, setRegisterForm] = useState(emptyRegistrationForm);
  const [loginForm, setLoginForm] = useState(emptyLoginForm);
  const [otpState, setOtpState] = useState(otpInitialState);
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState("");
  const [sellerProfile, setSellerProfile] = useState(null);

  const activeEmail = useMemo(
    () => (otpState.email ? otpState.email : loginForm.email || registerForm.email),
    [loginForm.email, otpState.email, registerForm.email],
  );

  useEffect(() => {
    const restoreSession = async () => {
      const storedToken = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!storedToken) {
        return;
      }

      try {
        const response = await axios.get(`${API}/seller/auth/me`, {
          headers: { "X-Seller-Session": storedToken },
        });
        setSessionToken(storedToken);
        setSellerProfile(response.data);
        onSessionStateChange?.(true);
      } catch (error) {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        onSessionStateChange?.(false);
      }
    };

    restoreSession();
  }, [onSessionStateChange]);

  const handleAuthenticated = (payload) => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, payload.session_token);
    setSessionToken(payload.session_token);
    setSellerProfile(payload.seller);
    onSessionStateChange?.(true);
    setView("dashboard");
    setStatusMessage(payload.message || "Seller login successful.");
  };

  const handleLogout = () => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionToken("");
    setSellerProfile(null);
    onSessionStateChange?.(false);
    setOtpState(otpInitialState);
    setLoginForm(emptyLoginForm);
    setStatusMessage("Seller session ended.");
    setView("landing");
  };

  const requestRegisterOtp = async (event) => {
    event.preventDefault();
    try {
      setLoading(true);
      setStatusMessage("");
      const payload = {
        ...registerForm,
        gst_number: registerForm.gst_number.toUpperCase(),
      };
      const response = await axios.post(`${API}/seller/auth/register/request-otp`, payload);
      setOtpState({
        email: payload.email,
        otp: "",
        deliveryChannel: response.data.delivery_channel,
        debugOtp: response.data.debug_otp || "",
        intent: "register",
      });
      setView("verify-register");
      setStatusMessage(
        response.data.delivery_channel === "debug"
          ? `SMTP configured nahi hai, isliye testing OTP screen par show ho raha hai: ${response.data.debug_otp}`
          : "OTP email par bhej diya gaya hai. Verify karke account create karein.",
      );
    } catch (error) {
      setStatusMessage(error.response?.data?.detail || "Seller registration OTP send nahi ho paya.");
    } finally {
      setLoading(false);
    }
  };

  const verifyRegisterOtp = async (event) => {
    event.preventDefault();
    try {
      setLoading(true);
      const response = await axios.post(`${API}/seller/auth/register/verify`, {
        email: otpState.email,
        otp: otpState.otp,
      });
      handleAuthenticated(response.data);
    } catch (error) {
      setStatusMessage(error.response?.data?.detail || "OTP verify nahi ho paya.");
    } finally {
      setLoading(false);
    }
  };

  const requestLoginOtp = async (event) => {
    event.preventDefault();
    try {
      setLoading(true);
      const response = await axios.post(`${API}/seller/auth/login/request-otp`, loginForm);
      setOtpState({
        email: loginForm.email,
        otp: "",
        deliveryChannel: response.data.delivery_channel,
        debugOtp: response.data.debug_otp || "",
        intent: "login",
      });
      setView("verify-login");
      setStatusMessage(
        response.data.delivery_channel === "debug"
          ? `SMTP configured nahi hai, testing OTP: ${response.data.debug_otp}`
          : "Login OTP email par bhej diya gaya hai.",
      );
    } catch (error) {
      setStatusMessage(error.response?.data?.detail || "Login OTP send nahi ho paya.");
    } finally {
      setLoading(false);
    }
  };

  const verifyLoginOtp = async (event) => {
    event.preventDefault();
    try {
      setLoading(true);
      const response = await axios.post(`${API}/seller/auth/login/verify`, {
        email: otpState.email,
        otp: otpState.otp,
      });
      handleAuthenticated(response.data);
    } catch (error) {
      setStatusMessage(error.response?.data?.detail || "Login OTP verify nahi ho paya.");
    } finally {
      setLoading(false);
    }
  };

  if (sessionToken && sellerProfile) {
    return (
      <SellerPortal
        onCatalogRefresh={onCatalogRefresh}
        sessionToken={sessionToken}
        sellerProfile={sellerProfile}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7efe9_0%,#fcfbf8_45%,#ffffff_100%)]" data-testid="seller-auth-portal">
      <section className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-10 md:grid-cols-[1.2fr_0.8fr] md:px-12 md:py-14">
        <div className="space-y-8">
          <div className="space-y-5">
            <p className="text-xs uppercase tracking-[0.26em] text-stone-500">Seller Growth Hub</p>
            <h1 className="font-heading text-4xl text-stone-900 md:text-6xl">
              Seller Portal ke andar ab login aur fresh seller onboarding dono ready hain.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-stone-700 md:text-base">
              Naye sellers GST details, business address aur email OTP verification ke saath register kar sakte hain.
              Existing sellers login karke dashboard, payments, orders, add product aur inventory manage kar sakte hain.
            </p>
          </div>

          <SellerInfoStrip />

          <div className="grid gap-5 md:grid-cols-2">
            <Card className="border-stone-200 bg-white/90 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <Store className="h-5 w-5" /> Register as a new seller
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-stone-600">
                  Complete GST profile ke saath new account banaiye aur OTP verify karke seller dashboard unlock kijiye.
                </p>
                <Button
                  className="w-full rounded-none bg-stone-900 text-xs uppercase tracking-[0.16em] hover:bg-stone-700"
                  onClick={() => setView("register")}
                  data-testid="seller-register-cta"
                >
                  Register as a new seller <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>

            <Card className="border-stone-200 bg-white/90 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <Mail className="h-5 w-5" /> Login as a seller
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-stone-600">
                  Existing seller email dijiye, OTP verify kijiye aur apni seller control screen par jaiye.
                </p>
                <Button
                  variant="outline"
                  className="w-full rounded-none text-xs uppercase tracking-[0.16em]"
                  onClick={() => setView("login")}
                  data-testid="seller-login-cta"
                >
                  Login as a seller <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <aside className="h-fit border border-stone-200 bg-white p-6 shadow-sm md:sticky md:top-24" data-testid="seller-auth-side-panel">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Seller Access</p>
            <h2 className="font-heading text-3xl text-stone-900">
              {view === "register" || view === "verify-register" ? "Register as a new seller" : "Login as a seller"}
            </h2>
          </div>

          <div className="mt-4 space-y-3 text-sm text-stone-600">
            <p>Right side panel mein seller onboarding aur login dono milenge, jaise aapne kaha tha.</p>
            {activeEmail && <p className="font-medium text-stone-800">Active email: {activeEmail}</p>}
            {statusMessage && <p className="border border-stone-200 bg-stone-50 px-4 py-3 text-stone-700">{statusMessage}</p>}
          </div>

          {view === "landing" && (
            <div className="mt-6 space-y-4">
              <Button
                className="w-full rounded-none bg-stone-900 text-xs uppercase tracking-[0.16em] hover:bg-stone-700"
                onClick={() => setView("login")}
                data-testid="seller-side-login-button"
              >
                Login as a seller
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-none text-xs uppercase tracking-[0.16em]"
                onClick={() => setView("register")}
                data-testid="seller-side-register-button"
              >
                Register as a new seller
              </Button>
            </div>
          )}

          {view === "register" && (
            <form className="mt-6 grid gap-4" onSubmit={requestRegisterOtp} data-testid="seller-register-form">
              <Input placeholder="Business name" value={registerForm.business_name} onChange={(event) => setRegisterForm((prev) => ({ ...prev, business_name: event.target.value }))} required />
              <Input placeholder="Owner full name" value={registerForm.owner_name} onChange={(event) => setRegisterForm((prev) => ({ ...prev, owner_name: event.target.value }))} required />
              <Input type="email" placeholder="Business email" value={registerForm.email} onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))} required />
              <Input placeholder="Phone number" value={registerForm.phone} onChange={(event) => setRegisterForm((prev) => ({ ...prev, phone: event.target.value }))} required />
              <Input placeholder="GST number" value={registerForm.gst_number} onChange={(event) => setRegisterForm((prev) => ({ ...prev, gst_number: event.target.value.toUpperCase() }))} required />
              <Textarea placeholder="Complete business address" value={registerForm.business_address} onChange={(event) => setRegisterForm((prev) => ({ ...prev, business_address: event.target.value }))} required />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input placeholder="City" value={registerForm.city} onChange={(event) => setRegisterForm((prev) => ({ ...prev, city: event.target.value }))} required />
                <Input placeholder="State" value={registerForm.state} onChange={(event) => setRegisterForm((prev) => ({ ...prev, state: event.target.value }))} required />
              </div>
              <Input placeholder="Pincode" value={registerForm.pincode} onChange={(event) => setRegisterForm((prev) => ({ ...prev, pincode: event.target.value }))} required />
              <div className="flex gap-3">
                <Button type="submit" disabled={loading} className="flex-1 rounded-none bg-stone-900 text-xs uppercase tracking-[0.16em] hover:bg-stone-700">
                  {loading ? "Sending OTP..." : "Send OTP"}
                </Button>
                <Button type="button" variant="outline" className="rounded-none" onClick={() => setView("landing")}>
                  Back
                </Button>
              </div>
            </form>
          )}

          {view === "login" && (
            <form className="mt-6 grid gap-4" onSubmit={requestLoginOtp} data-testid="seller-login-form">
              <Input type="email" placeholder="Registered seller email" value={loginForm.email} onChange={(event) => setLoginForm({ email: event.target.value })} required />
              <div className="flex gap-3">
                <Button type="submit" disabled={loading} className="flex-1 rounded-none bg-stone-900 text-xs uppercase tracking-[0.16em] hover:bg-stone-700">
                  {loading ? "Sending OTP..." : "Send Login OTP"}
                </Button>
                <Button type="button" variant="outline" className="rounded-none" onClick={() => setView("landing")}>
                  Back
                </Button>
              </div>
            </form>
          )}

          {(view === "verify-register" || view === "verify-login") && (
            <form
              className="mt-6 grid gap-4"
              onSubmit={view === "verify-register" ? verifyRegisterOtp : verifyLoginOtp}
              data-testid="seller-otp-verify-form"
            >
              <div className="rounded-none border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                OTP {otpState.deliveryChannel === "email" ? "email par bheja gaya hai." : "debug mode mein visible hai."}
                {otpState.debugOtp ? ` Current OTP: ${otpState.debugOtp}` : ""}
              </div>
              <Input type="email" value={otpState.email} readOnly />
              <Input placeholder="Enter OTP" value={otpState.otp} onChange={(event) => setOtpState((prev) => ({ ...prev, otp: event.target.value }))} required />
              <div className="flex gap-3">
                <Button type="submit" disabled={loading} className="flex-1 rounded-none bg-stone-900 text-xs uppercase tracking-[0.16em] hover:bg-stone-700">
                  {loading ? "Verifying..." : "Verify OTP"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => setView(otpState.intent === "register" ? "register" : "login")}
                >
                  Edit
                </Button>
              </div>
            </form>
          )}

          <div className="mt-8 flex items-start gap-3 border border-stone-200 bg-[#f8f2ed] p-4 text-sm text-stone-700">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-stone-900" />
            <p>
              Real email delivery ke liye backend par SMTP env set karna hoga. Tab OTP directly seller email par jayega.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
