import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { HomePage } from "./pages/HomePage";
import { ContactPage } from "./pages/ContactPage";
import { FeaturesPage} from "./pages/FeaturesPage";
import { GetStartedPage } from "./pages/GetStartedPage";
import "./style.css";

const App = () => {
  const [currentView, setCurrentView] = useState("home");

  return (
    <div className="min-h-screen bg-[#F9F9FA] text-[#2E3538] selection:bg-[#8EBFF2] selection:text-[#FFFFFF] overflow-x-hidden font-sans">
      <Navbar onViewChange={setCurrentView} currentView={currentView} />

      {currentView === "home" && <HomePage onViewChange={setCurrentView} />}
      {currentView === "contact" && <ContactPage />}
      {currentView === "features" && <FeaturesPage />}
      {currentView === "get-started" && <GetStartedPage />}

      <Footer onViewChange={setCurrentView} />
    </div>
  );
};

createRoot(document.getElementById("app")!).render(<App />);