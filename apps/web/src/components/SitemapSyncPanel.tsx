import { useState } from "react";
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";


interface SyncStats {
  totalTracked: number;
  lastSynced: string | null;
}

interface ChangedUrl {
  url: string;
  status: "new" | "changed";
}

interface PreviewResult {
  crawledPages: number;
  changedPages: number;
  unchangedPages: number;
  newPages: number;
  deletedPages: number;
  changedUrls: ChangedUrl[];
}

interface SyncResult {
  checked: number;
  changed: number;
  unchanged: number;
  deleted: number;
  stored: number;
  failed: number;
  message?: string;
}

interface SitemapSyncPanelProps {
  siteId: string;
  userId: string;
  apiBase: string;
  hostname: string;
}


function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}


export function SitemapSyncPanel({
  siteId,
  userId,
  apiBase,
  hostname,
}: SitemapSyncPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [loading, setLoading] = useState<"stats" | "preview" | "sync" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showChangedUrls, setShowChangedUrls] = useState(false);

  const baseUrl = `${apiBase}/api/sites/${encodeURIComponent(siteId)}/sync?userId=${encodeURIComponent(userId)}`;

  // ── Load stats ─────────────────────────────────────────────────────────
  const loadStats = async () => {
    setLoading("stats");
    setError(null);
    try {
      const res = await fetch(baseUrl);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load stats");
      setStats({ totalTracked: data.totalTracked, lastSynced: data.lastSynced });
    } catch (err: any) {
      setError(err?.message || "Failed to load sync stats");
    } finally {
      setLoading(null);
    }
  };


  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !expanded;
    setExpanded(next);
    if (next && !stats) loadStats();
  };


  const handlePreview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading("preview");
    setError(null);
    setPreview(null);
    setSyncResult(null);
    setShowChangedUrls(false);
    try {
      const res = await fetch(`${baseUrl}&preview=true`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || "Preview failed");
      setPreview(data.preview);
      setStats({ totalTracked: data.totalTracked, lastSynced: data.lastSynced });
    } catch (err: any) {
      setError(err?.message || "Could not preview changes — check the API server logs");
    } finally {
      setLoading(null);
    }
  };

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading("sync");
    setError(null);
    setPreview(null);
    setSyncResult(null);
    try {
      const res = await fetch(baseUrl, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || "Sync failed");
      setSyncResult(data);
      // Refresh stats
      const statsRes = await fetch(baseUrl);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats({ totalTracked: statsData.totalTracked, lastSynced: statsData.lastSynced });
      }
    } catch (err: any) {
      setError(err?.message || "Sync failed — check the API server logs");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
      {/* Toggle button */}
      <button
        type="button"
        onClick={handleExpand}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 transition-colors"
      >
        <Sparkles className="w-3 h-3" />
        Smart Sync
        {expanded
          ? <ChevronUp className="w-3 h-3 ml-0.5" />
          : <ChevronDown className="w-3 h-3 ml-0.5" />}
      </button>

      {expanded && (
        <div className="basis-full mt-1 p-4 bg-[#F9F9FA] rounded-xl border border-slate-200 space-y-4">

          {/* Stats row */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 text-xs text-slate-500">
              {stats ? (
                <>
                  <p>
                    <span className="font-medium text-[#2E3538]">{stats.totalTracked}</span>
                    {" "}pages tracked
                  </p>
                  <p>Last synced: <span className="font-medium">{formatDate(stats.lastSynced)}</span></p>
                </>
              ) : (
                <p className="text-slate-400 italic">
                  {loading === "stats" ? "Loading…" : "No sync history yet"}
                </p>
              )}
            </div>
            {loading === "stats" && (
              <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePreview}
              disabled={!!loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === "preview"
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Eye className="w-3 h-3" />}
              Preview changes
            </button>

            <button
              type="button"
              onClick={handleSync}
              disabled={!!loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === "sync"
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />}
              {loading === "sync" ? "Syncing…" : "Sync now"}
            </button>
          </div>

          {/* Loading hint for full crawl */}
          {(loading === "preview" || loading === "sync") && (
            <p className="text-[10px] text-slate-400 italic">
              Crawling {hostname} — this may take a moment for larger sites…
            </p>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Preview result */}
          {preview && !syncResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-xs">
                {[
                  { label: "Crawled", value: preview.crawledPages, color: "text-[#2E3538]" },
                  { label: "Changed", value: preview.changedPages, color: preview.changedPages > 0 ? "text-amber-600" : "text-[#2E3538]" },
                  { label: "New", value: preview.newPages, color: preview.newPages > 0 ? "text-blue-600" : "text-[#2E3538]" },
                  { label: "Deleted", value: preview.deletedPages, color: preview.deletedPages > 0 ? "text-red-500" : "text-[#2E3538]" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white rounded-lg p-2 text-center border border-slate-100">
                    <p className={`text-base font-light ${stat.color}`}>{stat.value}</p>
                    <p className="text-slate-400 text-[10px]">{stat.label}</p>
                  </div>
                ))}
              </div>

              {preview.changedPages === 0 && preview.deletedPages === 0 ? (
                <p className="text-xs text-green-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Everything is up to date — no sync needed.
                </p>
              ) : (
                <>
                  <p className="text-xs text-amber-600">
                    {preview.changedPages} page{preview.changedPages !== 1 ? "s" : ""} will be re-indexed.
                    {preview.deletedPages > 0 && ` ${preview.deletedPages} removed page${preview.deletedPages !== 1 ? "s" : ""} will be cleared.`}
                  </p>

                  {preview.changedUrls.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowChangedUrls(!showChangedUrls); }}
                        className="text-xs text-violet-600 hover:underline flex items-center gap-1"
                      >
                        {showChangedUrls ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {showChangedUrls ? "Hide" : "Show"} changed URLs
                        ({Math.min(preview.changedUrls.length, preview.changedPages)})
                      </button>

                      {showChangedUrls && (
                        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
                          {preview.changedUrls.map((entry) => (
                            <div
                              key={entry.url}
                              className="flex items-center gap-2 text-[10px] bg-white rounded-lg px-2.5 py-2 border border-slate-100"
                            >
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                entry.status === "new" ? "bg-blue-400" : "bg-amber-400"
                              }`} />
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                                entry.status === "new"
                                  ? "bg-blue-50 text-blue-600"
                                  : "bg-amber-50 text-amber-600"
                              }`}>
                                {entry.status}
                              </span>
                              <span className="text-slate-500 truncate font-mono">{entry.url}</span>
                            </div>
                          ))}
                          {preview.changedPages > preview.changedUrls.length && (
                            <p className="text-[10px] text-slate-400 px-2">
                              …and {preview.changedPages - preview.changedUrls.length} more
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Sync result */}
          {syncResult && (
            <div className="space-y-2">
              {syncResult.message ? (
                <p className="text-xs text-green-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {syncResult.message}
                </p>
              ) : (
                <>
                  <p className="text-xs text-green-600 flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Sync complete
                  </p>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    {[
                      { label: "Checked", value: syncResult.checked, color: "text-[#2E3538]" },
                      { label: "Re-indexed", value: syncResult.stored, color: "text-green-600" },
                      { label: "Skipped", value: syncResult.unchanged, color: "text-slate-400" },
                      { label: "Deleted", value: syncResult.deleted, color: syncResult.deleted > 0 ? "text-red-500" : "text-slate-400" },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-white rounded-lg p-2 text-center border border-slate-100">
                        <p className={`text-base font-light ${stat.color}`}>{stat.value}</p>
                        <p className="text-slate-400 text-[10px]">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                  {syncResult.failed > 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {syncResult.failed} page{syncResult.failed !== 1 ? "s" : ""} failed to embed — check API logs.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Explanation footer */}
          <p className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-200 pt-3">
            Smart Sync re-crawls {hostname} and only re-embeds pages whose
            content has changed since the last index. Unchanged pages are
            skipped entirely, saving API calls and keeping costs low.
          </p>
        </div>
      )}
    </div>
  );
}