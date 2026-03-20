import { useState, useRef, useEffect } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  LayoutDashboard,
} from "lucide-react";

export interface SiteOption {
  id: string;
  url: string;
  hostname: string;
  pagesIndexed: number;
  status: string;
  lastCrawled: string;
}

interface SiteSelectorProps {
  sites: SiteOption[];
  selectedSite: SiteOption | null;
  onSelect: (site: SiteOption | null) => void;
  onAddSite: () => void;
  /** Visual variant: "navbar" renders compact for top nav, "inline" renders fuller */
  variant?: "navbar" | "inline";
}

export function SiteSelector({
  sites,
  selectedSite,
  onSelect,
  onAddSite,
  variant = "navbar",
}: SiteSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const label = selectedSite ? selectedSite.hostname : "All sites";

  return (
    <div ref={ref} className="relative">
      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`
          group flex items-center gap-2 rounded-full font-medium transition-all duration-200
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bc6c25]/20
          ${variant === "navbar"
            ? `px-4 py-2 text-sm border
               ${selectedSite
                 ? "bg-white/76 text-[#1f2522] border-[#1f2522]/8 hover:border-[#bc6c25]/25"
                 : "bg-white/72 text-[#65726d] border-[#1f2522]/8 hover:border-[#bc6c25]/20 hover:text-[#1f2522]"
               }`
            : `px-4 py-2.5 text-sm border
               ${selectedSite
                 ? "bg-white text-[#1f2522] border-[#1f2522]/8 hover:border-[#bc6c25]/25"
                 : "bg-[#fbf7f2] text-[#65726d] border-[#1f2522]/8 hover:border-[#bc6c25]/25"
               }`
          }
        `}
      >
        {/* Site favicon dot or icon */}
        {selectedSite ? (
          <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
        ) : (
          <LayoutDashboard className="h-3.5 w-3.5 flex-shrink-0 text-[#9aa39f]" />
        )}

        <span className="max-w-[160px] truncate leading-none">{label}</span>

        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 text-[#9aa39f] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          role="listbox"
          className={`absolute z-50 mt-2 min-w-[280px] overflow-hidden rounded-[1.5rem] border border-[#1f2522]/8 bg-[#fbf8f3] shadow-xl shadow-[rgba(31,37,34,0.08)] animate-fade-in-up ${
            variant === "navbar" ? "right-0" : "left-0"
          }`}
          style={{ animationDuration: "0.15s" }}
        >
          {/* Header */}
          <div className="border-b border-[#e7dfd4] px-4 pb-2 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8a938f]">
              Your websites
            </p>
          </div>

          {/* All sites option */}
          <div className="py-1.5 px-2">
            <button
              type="button"
              role="option"
              aria-selected={!selectedSite}
              onClick={() => { onSelect(null); setOpen(false); }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors
                ${!selectedSite
                  ? "bg-white text-[#1f2522] font-medium"
                  : "text-[#65726d] hover:bg-white/70"
                }
              `}
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#f3eee7]">
                <LayoutDashboard className="h-4 w-4 text-[#8a938f]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-tight">All sites</p>
                <p className="mt-0.5 text-[11px] leading-tight text-[#8a938f]">
                  Combined view · {sites.length} site{sites.length !== 1 ? "s" : ""}
                </p>
              </div>
              {!selectedSite && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[#bc6c25]" />}
            </button>
          </div>

          {/* Site list */}
          {sites.length > 0 && (
            <>
              <div className="mx-4 h-px bg-[#e7dfd4]" />
              <div className="py-1.5 px-2 space-y-0.5">
                {sites.map(site => {
                  const isSelected = selectedSite?.id === site.id;
                  return (
                    <button
                      key={site.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => { onSelect(site); setOpen(false); }}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors group/item
                        ${isSelected ? "bg-white text-[#1f2522] font-medium border border-[#1f2522]/8" : "text-[#65726d] hover:bg-white/70"}
                      `}
                    >
                      {/* Favicon-style icon */}
                      <div className={`
                        w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[11px] font-bold uppercase
                        ${isSelected ? "bg-[#f6eee3] text-[#bc6c25]" : "bg-[#eef5ea] text-green-700"}
                      `}>
                        {site.hostname.charAt(0)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] leading-tight truncate">{site.hostname}</p>
                        <p className="mt-0.5 text-[11px] leading-tight text-[#8a938f]">
                          {site.pagesIndexed} pages indexed
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* External link — shown on hover */}
                        <a
                          href={site.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title={`Open ${site.url}`}
                          className="p-1 text-[#9aa39f] opacity-0 transition-opacity group-hover/item:opacity-100 rounded-lg hover:bg-[#f3eee7] hover:text-[#5f6b67]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-[#bc6c25]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
