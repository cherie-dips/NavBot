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
import "./style.css";

const App = () => {
  const [currentView, setCurrentView] = useState("home");

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      setCurrentView("dashboard");
    }
  }, []);

  const isDashboard = currentView === "dashboard";

  return (
    <div className="min-h-screen bg-[#F9F9FA] text-[#2E3538] selection:bg-[#8EBFF2] selection:text-[#FFFFFF] overflow-x-hidden font-sans">
      {!isDashboard && <Navbar onViewChange={setCurrentView} currentView={currentView} />}

      {currentView === "home" && <HomePage onViewChange={setCurrentView} />}
      {currentView === "contact" && <ContactPage />}
      {currentView === "features" && <FeaturesPage />}
      {currentView === "get-started" && <GetStartedPage />}
      {currentView === "auth" && (
        <AuthPage
          onViewChange={setCurrentView}
          onAuthSuccess={() => setCurrentView("dashboard")}
        />
      )}
      {isDashboard && (
        <DashboardPage
          onViewChange={setCurrentView}
          onSignOut={() => setCurrentView("home")}
        />
      )}

      {!isDashboard && <Footer onViewChange={setCurrentView} />}
    </div>
  );
};

createRoot(document.getElementById("app")!).render(<App />);
