import { useState, useEffect } from "react";
import { SiteSelector, SiteOption } from "./SiteSelector";

interface NavbarProps {
  onViewChange: (view: string) => void;
  currentView: string;
  isAuthed: boolean;
  onSignOut: () => void;
  onGetStartedClick: () => void;
  // Dashboard site context — only passed when on dashboard
  sites?: SiteOption[];
  selectedSite?: SiteOption | null;
  onSiteSelect?: (site: SiteOption | null) => void;
  onAddSite?: () => void;
}

export const Navbar = ({
  onViewChange,
  currentView,
  isAuthed,
  onSignOut,
  onGetStartedClick,
  sites = [],
  selectedSite = null,
  onSiteSelect,
  onAddSite,
}: NavbarProps) => {
  const [scrolled, setScrolled] = useState(false);
  const isDashboard = currentView === "dashboard";

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (e: React.MouseEvent, target: string) => {
    e.preventDefault();
    if (target === "how-it-works") {
      onViewChange("home");
      setTimeout(() => {
        const element = document.getElementById("how-it-works");
        if (element) element.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } else {
      onViewChange(target.toLowerCase());
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const NAV_LINKS = [
    { label: "Home",         target: "home"         },
    { label: "Features",     target: "features"     },
    { label: "Pricing",      target: "pricing"      },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 h-14 flex items-center transition-all duration-500 ${
        scrolled || isDashboard
          ? "bg-white/95 backdrop-blur-xl border-b border-slate-100 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="w-full px-6 flex items-center justify-between gap-4">
        {/* Logo */}
        <button
          className="flex items-center gap-2 group cursor-pointer flex-shrink-0"
          onClick={(e) => handleNavClick(e, "home")}
        >
          <span className="text-xl font-medium italic text-[#2E3538] tracking-tight font-serif">
            navbot
          </span>
        </button>

        {/* ── Dashboard mode: site selector lives here ── */}
        {isDashboard && isAuthed && onSiteSelect && onAddSite && (
          <div className="flex items-center gap-3 flex-1">
            {/* Subtle divider */}
            <span className="text-slate-200 select-none hidden sm:block">|</span>

            <SiteSelector
              sites={sites}
              selectedSite={selectedSite}
              onSelect={onSiteSelect}
              onAddSite={onAddSite}
              variant="navbar"
            />

            {/* Breadcrumb-style current tab hint — spacer so right side doesn't crowd */}
            <div className="flex-1" />
          </div>
        )}

        {/* ── Marketing mode: nav links ── */}
        {!isDashboard && (
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((item) => {
              const isActive =
                currentView === item.target ||
                (item.target === "how-it-works" && currentView === "home");
              return (
                <a
                  key={item.label}
                  href={`#${item.target}`}
                  onClick={(e) => handleNavClick(e, item.target)}
                  className={`text-sm font-medium transition-colors relative group ${
                    isActive ? "text-[#478EDB]" : "text-slate-500 hover:text-[#478EDB]"
                  }`}
                >
                  {item.label}
                  <span
                    className={`absolute -bottom-1 left-0 w-full h-0.5 bg-[#478EDB] transition-transform origin-left duration-300 ${
                      isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                    }`}
                  />
                </a>
              );
            })}
          </div>
        )}

        {/* ── Right side: auth actions ── */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {isAuthed ? (
            <>
              {!isDashboard && (
                <button
                  onClick={(e) => handleNavClick(e, "dashboard")}
                  className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#478EDB]/10 text-[#478EDB] text-sm font-medium hover:bg-[#478EDB]/20 transition-colors"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#478EDB] text-white text-xs font-semibold">
                    U
                  </span>
                  <span>Dashboard</span>
                </button>
              )}
              <button
                onClick={onSignOut}
                className="text-sm font-medium text-slate-400 hover:text-red-500 transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onGetStartedClick();
                }}
                className="px-5 py-2 rounded-full bg-[#2E3538] text-white text-sm font-medium hover:bg-[#478EDB] transition-colors shadow-lg shadow-[#2E3538]/10 hover:shadow-[#478EDB]/30 duration-300"
              >
                Get started
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};