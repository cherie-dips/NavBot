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
import { authClient } from "./lib/auth-client";
import { SiteOption } from "./components/SiteSelector";
import "./style.css";

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
    <div className="min-h-screen bg-[#F9F9FA] text-[#2E3538] selection:bg-[#8EBFF2] selection:text-[#FFFFFF] overflow-x-hidden font-sans">
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

      {currentView === "home"      && <HomePage onViewChange={setCurrentView} onGetStarted={handleGetStartedCTA} />}
      {currentView === "contact"   && <ContactPage />}
      {currentView === "features"  && <FeaturesPage />}
      {currentView === "get-started" && <GetStartedPage />}
      {currentView === "auth"      && (
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
          // Lift site state up so Navbar can show the selector
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