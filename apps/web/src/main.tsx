import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { HomePage } from "./pages/HomePage";
import { ContactPage } from "./pages/ContactPage";
import { FeaturesPage} from "./pages/FeaturesPage";
import { GetStartedPage } from "./pages/GetStartedPage";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { authClient } from "./lib/auth-client";
import "./style.css";

const App = () => {
  const [currentView, setCurrentView] = useState("home");
  const [isAuthed, setIsAuthed] = useState(false);

  // Check existing session on load
  useEffect(() => {
    authClient
      .getSession()
      .then(({ data }) => {
        if (data?.user) {
          setIsAuthed(true);
        }
      })
      .catch(() => {});
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      setIsAuthed(true);
      setCurrentView("get-started");
    }
  }, []);

  const isDashboard = currentView === "dashboard";

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
    } catch {
      // ignore
    }
    setIsAuthed(false);
    setCurrentView("home");
  };

  const handleGetStartedNav = () => {
    if (isAuthed) {
      setCurrentView("dashboard");
    } else {
      setCurrentView("auth");
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F9FA] text-[#2E3538] selection:bg-[#8EBFF2] selection:text-[#FFFFFF] overflow-x-hidden font-sans">
      <Navbar
        onViewChange={setCurrentView}
        currentView={currentView}
        isAuthed={isAuthed}
        onSignOut={handleSignOut}
        onGetStartedClick={handleGetStartedNav}
      />

      {currentView === "home" && <HomePage onViewChange={setCurrentView} />}
      {currentView === "contact" && <ContactPage />}
      {currentView === "features" && <FeaturesPage />}
      {currentView === "get-started" && <GetStartedPage />}
      {currentView === "auth" && (
        <AuthPage
          onViewChange={setCurrentView}
          onAuthSuccess={() => {
            setIsAuthed(true);
            setCurrentView("dashboard");
          }}
        />
      )}
      {isDashboard && (
        <DashboardPage
          onViewChange={setCurrentView}
          onSignOut={handleSignOut}
        />
      )}

      {!isDashboard && <Footer onViewChange={setCurrentView} />}
    </div>
  );
};

createRoot(document.getElementById("app")!).render(<App />);
