import { useState, useEffect } from "react";
import { SiteSelector, SiteOption } from "./SiteSelector";

interface NavbarProps {
  onViewChange: (view: string) => void;
  currentView: string;
  isAuthed: boolean;
  onSignOut: () => void;
  onGetStartedClick: () => void;
  sites?: SiteOption[];
  selectedSite?: SiteOption | null;
  onSiteSelect?: (site: SiteOption | null) => void;
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
}: NavbarProps) => {
  const [scrolled, setScrolled] = useState(false);
  const isDashboard = currentView === "dashboard";

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (e: React.MouseEvent, target: string) => {
    e.preventDefault();
    onViewChange(target.toLowerCase());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const navLinks = [
    { label: "Features", target: "features" },
    { label: "Pricing", target: "pricing" },
    { label: "Contact", target: "contact" },
  ];

  return (
    <nav
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-500 ${
        scrolled || isDashboard
          ? "bg-[#fbf8f3]/92 backdrop-blur-2xl"
          : "bg-transparent"
      }`}
    >
      <div className={`flex h-[76px] w-full items-center justify-between px-6 ${isDashboard ? "" : "mx-auto max-w-[1220px]"}`}>
        <button
          className="font-display text-[1.6rem] font-semibold italic tracking-[-0.05em] text-[#1f2522]"
          onClick={(e) => handleNavClick(e, "home")}
        >
          navbot
        </button>

        {isDashboard ? (
          <div className="flex-1" />
        ) : (
          <div className="hidden items-center gap-9 md:flex">
            {navLinks.map((item) => (
              <a
                key={item.target}
                href={`#${item.target}`}
                onClick={(e) => handleNavClick(e, item.target)}
                data-active={currentView === item.target}
                className={`text-[0.95rem] font-medium transition-colors ${
                  currentView === item.target
                    ? "text-[#1f2522]"
                    : "text-[#6d7773] hover:text-[#1f2522]"
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          {isAuthed ? (
            <>
              {isDashboard && onSiteSelect && (
                <SiteSelector
                  sites={sites}
                  selectedSite={selectedSite}
                  onSelect={onSiteSelect}
                  variant="navbar"
                />
              )}
              {!isDashboard && (
                <button
                  onClick={(e) => handleNavClick(e, "dashboard")}
                  className="rounded-full border border-[#1f2522]/8 bg-white/70 px-4 py-2 text-sm text-[#1f2522]"
                >
                  Dashboard
                </button>
              )}
              <button
                onClick={onSignOut}
                className="text-sm text-[#7b8783] transition-colors hover:text-red-500"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                onGetStartedClick();
              }}
              className="rounded-full bg-[#1f2522] px-5 py-2.5 text-sm font-medium text-white shadow-[0_16px_34px_rgba(31,37,34,0.12)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#bc6c25]"
            >
              Get started
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};
