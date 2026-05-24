import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { HomePage } from "./pages/HomePage";
import { ContactPage } from "./pages/ContactPage";
import { FeaturesPage } from "./pages/FeaturesPage";
import { GetStartedPage } from "./pages/GetStartedPage";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PricingPage } from "./pages/PricingPage";
import { authClient } from "./lib/auth-client";
import { SiteOption } from "./components/SiteSelector";
import { normalizeApiBase } from "./lib/api-base";
import "./style.css";

const API_BASE = normalizeApiBase((import.meta as any).env?.VITE_API_URL);
(window as any).NAVBOT_CONFIG = { ...((window as any).NAVBOT_CONFIG || {}), apiBase: API_BASE };

const App = () => {
  const [currentView, setCurrentView] = useState("home");
  const [isAuthed, setIsAuthed] = useState(false);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSite, setSelectedSite] = useState<SiteOption | null>(null);

  useEffect(() => {
    authClient
      .getSession()
      .then(({ data }) => {
        if (data?.user) setIsAuthed(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      setIsAuthed(true);
      setCurrentView("dashboard");
      return;
    }
    const authErr = params.get("auth_error");
    if (authErr) {
      params.delete("auth_error");
      const rest = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${rest ? `?${rest}` : ""}`
      );
      const message =
        authErr === "state_mismatch"
          ? "Google sign-in could not verify the browser session (cookies between the app and auth service). Try again, or use email sign-in. If it keeps failing, clear site data for this site."
          : `Sign-in failed (${authErr}). Try again or use email.`;
      sessionStorage.setItem("navbot_oauth_error", message);
      setPostAuthView("dashboard");
      setCurrentView("auth");
    }
  }, []);

  const isDashboard = currentView === "dashboard";

  const handleSignOut = async () => {
    try { await authClient.signOut(); } catch { /* ignore */ }
    setIsAuthed(false);
    setCurrentView("home");
    setSites([]);
    setSelectedSite(null);
  };

  const [postAuthView, setPostAuthView] = useState<string>("dashboard");

  const handleGetStartedNav = () => {
    if (isAuthed) setCurrentView("dashboard");
    else { setPostAuthView("dashboard"); setCurrentView("auth"); }
  };

  const handleGetStartedCTA = () => {
    if (isAuthed) setCurrentView("get-started");
    else { setPostAuthView("get-started"); setCurrentView("auth"); }
  };

  const handleAddSite = () => {
    setCurrentView("dashboard");
    // DashboardPage will handle opening the add-site flow via its own state
    // We just navigate — the dashboard listens via a prop
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8f4ee] font-sans text-[#1f2522] selection:bg-[#f1d8bf] selection:text-[#1f2522]">
      <Navbar
        onViewChange={setCurrentView}
        currentView={currentView}
        isAuthed={isAuthed}
        onSignOut={handleSignOut}
        onGetStartedClick={handleGetStartedNav}
        // Dashboard-mode site selector props
        sites={sites}
        selectedSite={selectedSite}
        onSiteSelect={setSelectedSite}
        onAddSite={handleAddSite}
      />

      {currentView === "home"        && <HomePage onViewChange={setCurrentView} onGetStarted={handleGetStartedCTA} />}
      {currentView === "contact"     && <ContactPage />}
      {currentView === "features"    && <FeaturesPage />}
      {currentView === "pricing"     && <PricingPage onGetStarted={handleGetStartedCTA} onPaymentSuccess={() => setCurrentView("dashboard")} />}
      {currentView === "get-started" && <GetStartedPage />}
      {currentView === "auth"        && (
        <AuthPage
          onViewChange={setCurrentView}
          onAuthSuccess={() => {
            setIsAuthed(true);
            setCurrentView(postAuthView);
            setPostAuthView("dashboard");
          }}
        />
      )}
      {isDashboard && (
        <DashboardPage
          onViewChange={setCurrentView}
          onSignOut={handleSignOut}
          externalSites={sites}
          onSitesChange={setSites}
          selectedSite={selectedSite}
          onSiteSelect={setSelectedSite}
        />
      )}

      {!isDashboard && <Footer onViewChange={setCurrentView} />}
    </div>
  );
};

createRoot(document.getElementById("app")!).render(<App />);
