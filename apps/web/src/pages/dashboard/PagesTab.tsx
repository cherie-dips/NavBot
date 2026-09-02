import { useState, useEffect } from "react";
import {
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { SitemapSyncPanel } from "../../components/SitemapSyncPanel";
import { API_BASE } from "../../lib/api-base";
import { DASH_PANEL } from "./styles";
import type { Website } from "./types";
import { apiFetch } from "../../lib/api-fetch";

/* ── Indexed pages ────────────────────────────────────────────────────── */
interface IndexedPageRow {
  url: string;
  contentHash: string | null;
  lastmod: string | null;
  indexedAt: string;
}

export function PagesTab({ activeSite }: { activeSite: Website | null }) {
  const [pages, setPages] = useState<IndexedPageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [newUrls, setNewUrls] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    if (!activeSite) return;
    setLoading(true);
    setErr(null);
    fetch(`${API_BASE}/api/sites/${activeSite.id}/pages`)
      .then(r => r.json())
      .then(d => {
        setPages(Array.isArray(d.pages) ? d.pages : []);
        setSelected(new Set());
      })
      .catch(() => setErr("Couldn't load the page list."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [activeSite?.id]);

  const visible = pages.filter(p => p.url.toLowerCase().includes(filter.trim().toLowerCase()));

  const toggle = (url: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const allShown = visible.length > 0 && visible.every(p => selected.has(p.url));
    setSelected(prev => {
      const next = new Set(prev);
      for (const p of visible) {
        if (allShown) next.delete(p.url);
        else next.add(p.url);
      }
      return next;
    });
  };

  const removeSelected = async () => {
    if (!activeSite || selected.size === 0) return;
    const urls = [...selected];
    // Destructive and not undoable without a re-crawl, so it is confirmed explicitly.
    if (!window.confirm(`Remove ${urls.length} page${urls.length === 1 ? "" : "s"} from the bot's knowledge? This cannot be undone without re-indexing.`)) return;

    setBusy("delete");
    setErr(null);
    setNotice(null);
    try {
      const res = await apiFetch(`${API_BASE}/api/sites/${activeSite.id}/pages`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setNotice(`Removed ${urls.length} page${urls.length === 1 ? "" : "s"}.`);
      load();
    } catch {
      setErr("Couldn't remove those pages. Please try again.");
    }
    setBusy(null);
  };

  const addPages = async () => {
    if (!activeSite) return;
    const urls = newUrls
      .split(/[\n,\s]+/)
      .map(u => u.trim())
      .filter(Boolean)
      .map(u => (/^https?:\/\//i.test(u) ? u : `https://${u}`));
    if (urls.length === 0) return;

    setBusy("add");
    setErr(null);
    setNotice(null);
    try {
      const res = await apiFetch(`${API_BASE}/api/sites/${activeSite.id}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Add failed");
      setNotice(`Indexed ${data.pagesFound ?? 0} of ${urls.length} page${urls.length === 1 ? "" : "s"}.`);
      setNewUrls("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add those pages.");
    }
    setBusy(null);
  };

  if (!activeSite) {
    return <p className="text-xs text-[#8a938f]">Select a website to manage its indexed pages.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Sitemap sync */}
      <div className={`${DASH_PANEL} p-6`}>
        <SitemapSyncPanel
          siteId={activeSite.id}
          apiBase={API_BASE}
          hostname={activeSite.hostname}
        />
      </div>

      {/* Add pages */}
      <div className={`${DASH_PANEL} p-6`}>
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#f6eee3]">
            <Plus className="h-5 w-5 text-[#bc6c25]" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-[#1f2522]">Add pages</h3>
            <p className="mt-0.5 text-xs text-[#8a938f]">
              One URL per line. They're crawled and indexed straight away.
            </p>
            <textarea
              rows={3}
              value={newUrls}
              onChange={e => setNewUrls(e.target.value)}
              placeholder={`https://${activeSite.hostname}/admissions`}
              className="mt-3 w-full resize-none rounded-xl border border-[#1f2522]/10 bg-white px-3 py-2 font-mono text-xs text-[#1f2522] outline-none focus:border-[#bc6c25]"
            />
            <button
              onClick={addPages}
              disabled={busy !== null || !newUrls.trim()}
              className="mt-3 rounded-full bg-[#1f2522] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy === "add" ? "Indexing…" : "Add & index"}
            </button>
          </div>
        </div>
      </div>

      {/* Page list */}
      <div className={`${DASH_PANEL} p-6`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-[#1f2522]">Indexed pages</h3>
            <p className="mt-0.5 text-xs text-[#8a938f]">
              {loading ? "Loading…" : `${pages.length} page${pages.length === 1 ? "" : "s"} in the bot's knowledge`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8a938f]" />
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter by URL"
                className="w-48 rounded-full border border-[#1f2522]/10 bg-white py-1.5 pl-8 pr-3 text-xs text-[#1f2522] outline-none focus:border-[#bc6c25]"
              />
            </div>
            <button
              onClick={load}
              disabled={loading}
              title="Refresh"
              className="rounded-full border border-[#1f2522]/10 p-2 text-[#5f6b67] transition-colors hover:bg-[#f3eee7] disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {notice && <p className="mb-3 text-[11px] font-medium text-green-600">{notice}</p>}
        {err && <p className="mb-3 text-[11px] text-red-600">{err}</p>}

        {selected.size > 0 && (
          <div className="mb-3 flex items-center justify-between rounded-xl bg-[#f6eee3] px-3 py-2">
            <span className="text-xs font-medium text-[#5f6b67]">
              {selected.size} selected
            </span>
            <button
              onClick={removeSelected}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" />
              {busy === "delete" ? "Removing…" : "Remove selected"}
            </button>
          </div>
        )}

        {!loading && pages.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#8a938f]">
            No pages indexed yet. Add some above, or run a sync from the Websites tab.
          </p>
        ) : !loading && visible.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#8a938f]">No pages match “{filter}”.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#1f2522]/8">
            <div className="flex items-center gap-3 border-b border-[#1f2522]/8 bg-[#faf7f2] px-3 py-2">
              <input
                type="checkbox"
                checked={visible.length > 0 && visible.every(p => selected.has(p.url))}
                onChange={toggleAllVisible}
                className="h-3.5 w-3.5 accent-[#bc6c25]"
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8a938f]">
                URL
              </span>
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-[#8a938f]">
                Indexed
              </span>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {visible.map(page => (
                <label
                  key={page.url}
                  className="flex cursor-pointer items-center gap-3 border-b border-[#1f2522]/5 px-3 py-2.5 last:border-b-0 hover:bg-[#faf7f2]"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(page.url)}
                    onChange={() => toggle(page.url)}
                    className="h-3.5 w-3.5 flex-shrink-0 accent-[#bc6c25]"
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#1f2522]" title={page.url}>
                    {page.url.replace(/^https?:\/\//, "")}
                  </span>
                  <span className="flex-shrink-0 text-[10px] tabular-nums text-[#8a938f]">
                    {new Date(page.indexedAt).toLocaleDateString()}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
