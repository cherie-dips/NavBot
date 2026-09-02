import {
  ArrowRight,
  Clock,
  FileText,
  Globe,
  Trash2,
} from "lucide-react";
import { formatLocalDate } from "../../lib/format-date";
import { DASH_BUTTON_PRIMARY, DASH_PANEL } from "./styles";
import type { Website } from "./types";

/* ─── WEBSITES TAB ───────────────────────────────────────────────────────── */

export function WebsitesTab({ websites, showAddSite, setShowAddSite, newSiteUrl, setNewSiteUrl, onAddWebsite, onIntegrate, onDelete }: {
  websites: Website[]; showAddSite: boolean; setShowAddSite: (v: boolean) => void;
  newSiteUrl: string; setNewSiteUrl: (v: string) => void; onAddWebsite: (e: React.FormEvent) => void;
  onIntegrate: (s: Website) => void; onDelete: (s: Website) => void;
}) {
  return (
    <div className="space-y-4">
      {showAddSite && (
        <div className={`${DASH_PANEL} p-6`}>
          <h3 className="mb-4 text-sm font-medium text-[#1f2522]">Add a new website</h3>
          <form onSubmit={onAddWebsite} className="flex gap-3">
            <input type="url" placeholder="https://yourwebsite.com" value={newSiteUrl} onChange={e => setNewSiteUrl(e.target.value)} required
              className="flex-1 rounded-2xl border border-[#1f2522]/8 bg-[#fbfaf7] px-4 py-3 text-sm outline-none transition-all placeholder:text-[#9aa39f] focus:border-[#bc6c25]/35 focus:bg-white" />
            <button type="submit" className={`${DASH_BUTTON_PRIMARY} flex-shrink-0 px-6 py-3`}>
              Crawl & index <ArrowRight className="w-4 h-4" />
            </button>
          </form>
          <p className="mt-2 text-xs text-[#8a938f]">We'll crawl all pages, extract content, and build a searchable knowledge base.</p>
        </div>
      )}

      {websites.length === 0 && !showAddSite && (
        <div className={`${DASH_PANEL} p-16 text-center`}>
          <Globe className="mx-auto mb-4 h-12 w-12 text-[#ddd3c6]" />
          <h3 className="mb-2 text-base font-medium text-[#1f2522]">No websites yet</h3>
          <p className="mb-6 text-sm text-[#8a938f]">Add your first website to get started.</p>
          <button onClick={() => setShowAddSite(true)} className={DASH_BUTTON_PRIMARY}>
            Add website
          </button>
        </div>
      )}

      <div className="space-y-3">
        {websites.map(site => (
          <div key={site.id} className={`${DASH_PANEL} overflow-hidden group`}>
            <div className="flex items-center gap-4 px-6 py-5 cursor-pointer" onClick={() => onIntegrate(site)}>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#f6eee3] text-sm font-bold uppercase text-[#bc6c25]">
                {site.hostname.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="truncate text-sm font-semibold text-[#1f2522]">{site.hostname}</h3>
                  <span className="flex-shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600">Active</span>
                </div>
                <p className="truncate text-xs text-[#8a938f]">{site.url}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-5 text-xs text-[#8a938f]">
                <span className="hidden md:flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> {site.pagesIndexed} pages</span>
                <span className="hidden md:flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {formatLocalDate(site.lastCrawled)}</span>
                <button type="button" onClick={e => { e.stopPropagation(); onDelete(site); }} className="rounded-lg p-2 text-[#c6beb2] transition-colors hover:bg-red-50 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}
