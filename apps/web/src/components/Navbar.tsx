import { useState, useEffect } from "react";

interface NavbarProps {
  onViewChange: (view: string) => void;
  currentView: string;
  isAuthed: boolean;
  onSignOut: () => void;
  onGetStartedClick: () => void;
}

export const Navbar = ({
  onViewChange,
  currentView,
  isAuthed,
  onSignOut,
  onGetStartedClick,
}: NavbarProps) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
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

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-white/80 backdrop-blur-xl border-b border-[#8691CA]/10 py-4 shadow-sm"
          : "bg-transparent py-6"
      }`}
    >
      <div className="container mx-auto px-6 flex items-center justify-between">
        <button
          className="flex items-center gap-2 group cursor-pointer"
          onClick={(e) => handleNavClick(e, "home")}
        >
          <span className="text-xl font-medium italic text-[#2E3538] tracking-tight font-serif">
            navbot
          </span>
        </button>

        <div className="hidden md:flex items-center gap-8">
          {["Home", "Features", "How it works"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s/g, "-")}`}
              onClick={(e) =>
                handleNavClick(
                  e,
                  item === "How it works" ? "how-it-works" : item
                )
              }
              className={`text-sm font-medium transition-colors relative group ${
                currentView === item.toLowerCase()
                  ? "text-[#478EDB]"
                  : "text-slate-500 hover:text-[#478EDB]"
              }`}
            >
              {item}
              <span
                className={`absolute -bottom-1 left-0 w-full h-0.5 bg-[#478EDB] transition-transform origin-left duration-300 ${
                  currentView === item.toLowerCase()
                    ? "scale-x-100"
                    : "scale-x-0 group-hover:scale-x-100"
                }`}
              ></span>
            </a>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {isAuthed ? (
            <>
              <button
                onClick={(e) => handleNavClick(e, "dashboard")}
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#478EDB]/10 text-[#478EDB] text-sm font-medium hover:bg-[#478EDB]/20 transition-colors"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#478EDB] text-white text-xs font-semibold">
                  U
                </span>
                <span>Dashboard</span>
              </button>
              <button
                onClick={onSignOut}
                className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onGetStartedClick();
                }}
                className="px-6 py-2.5 rounded-full bg-[#2E3538] text-white text-sm font-medium hover:bg-[#478EDB] transition-colors shadow-lg shadow-[#2E3538]/10 hover:shadow-[#478EDB]/30 duration-300"
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