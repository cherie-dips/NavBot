import { useState, useRef, useEffect } from "react";
import {
  Globe,
  Plus,
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
          group flex items-center gap-2 rounded-xl font-medium transition-all duration-200
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#478EDB]/30
          ${variant === "navbar"
            ? `px-3 py-1.5 text-sm border
               ${selectedSite
                 ? "bg-[#478EDB]/10 text-[#478EDB] border-transparent hover:bg-[#478EDB]/20"
                 : "bg-white/0 text-slate-600 border-white/0 hover:bg-slate-100 hover:border-slate-200"
               }`
            : `px-4 py-2.5 text-sm border
               ${selectedSite
                 ? "bg-[#478EDB]/10 text-[#478EDB] border-transparent hover:bg-[#478EDB]/20"
                 : "bg-[#F9F9FA] text-slate-600 border-slate-200 hover:border-slate-300"
               }`
          }
        `}
      >
        {/* Site favicon dot or icon */}
        {selectedSite ? (
          <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
        ) : (
          <LayoutDashboard className={`w-3.5 h-3.5 flex-shrink-0 ${variant === "navbar" ? "text-slate-400" : "text-slate-400"}`} />
        )}

        <span className="max-w-[160px] truncate leading-none">{label}</span>

        <ChevronDown
          className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""} ${selectedSite ? "text-[#478EDB]" : "text-slate-400"}`}
        />
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          role="listbox"
          className="absolute z-50 left-0 mt-2 bg-white rounded-2xl border border-slate-200/80 shadow-xl shadow-slate-300/30 overflow-hidden animate-fade-in-up min-w-[280px]"
          style={{ animationDuration: "0.15s" }}
        >
          {/* Header */}
          <div className="px-4 pt-3 pb-2 border-b border-slate-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
                  ? "bg-slate-50 text-[#2E3538] font-medium"
                  : "text-slate-600 hover:bg-slate-50"
                }
              `}
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <LayoutDashboard className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-tight">All sites</p>
                <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                  Combined view · {sites.length} site{sites.length !== 1 ? "s" : ""}
                </p>
              </div>
              {!selectedSite && <CheckCircle2 className="w-4 h-4 text-[#478EDB] flex-shrink-0" />}
            </button>
          </div>

          {/* Site list */}
          {sites.length > 0 && (
            <>
              <div className="mx-4 h-px bg-slate-100" />
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
                        ${isSelected ? "bg-[#478EDB]/10 text-[#478EDB] font-medium border border-transparent hover:bg-[#478EDB]/20" : "text-slate-600 hover:bg-slate-50"}
                      `}
                    >
                      {/* Favicon-style icon */}
                      <div className={`
                        w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[11px] font-bold uppercase
                        ${isSelected ? "bg-[#478EDB]/15 text-[#478EDB]" : "bg-green-50 text-green-700"}
                      `}>
                        {site.hostname.charAt(0)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] leading-tight truncate">{site.hostname}</p>
                        <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
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
                          className="opacity-0 group-hover/item:opacity-100 transition-opacity p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-[#478EDB]" />}
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