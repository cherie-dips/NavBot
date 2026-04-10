import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard, Globe, Plus, BarChart3, MessageSquare, Share2,
  Mic, Users, Brain, ArrowRight, AlertCircle, TrendingUp, Clock,
  ChevronRight, ChevronDown, ChevronUp, Search, Volume2, VolumeX, FileText, Zap, ArrowUpRight,
  RefreshCw, Loader2, CheckCircle2, Trash2, X,
  CreditCard,
} from "lucide-react";
import { authClient } from "../lib/auth-client";
import { ScrapingPage } from "./ScrapingPage";
import { IntegrationPanel } from "../components/IntegrationPanel";
import { WidgetTheme } from "../components/ColorThemePicker";
import { SitemapSyncPanel } from "../components/SitemapSyncPanel";
import { SiteOption } from "../components/SiteSelector";
import { BillingTab } from "./BillingTab";

function formatLocalDate(raw: string | null | undefined): string {
  if (!raw || raw === "Just now") return raw || "Never";
  try {
    return new Date(raw).toLocaleString([], {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return raw; }
}

interface Website extends SiteOption {
  addedAt: string;
  widgetTheme: WidgetTheme | null;
}

interface IntegrationInfo {
  siteId: string; url: string; consoleCode: string; scriptTag: string;
}

interface DashboardPageProps {
  onViewChange: (view: string) => void;
  onSignOut?: () => void;
  // Lifted state from App — so Navbar's selector and Dashboard stay in sync
  externalSites: SiteOption[];
  onSitesChange: (sites: SiteOption[]) => void;
  selectedSite: SiteOption | null;
  onSiteSelect: (site: SiteOption | null) => void;
}

type Tab = "overview" | "websites" | "analytics" | "social" | "visitors" | "settings" | "billing";

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:3001";
/** Background refresh of chat analytics while the dashboard is open */
const DASHBOARD_ANALYTICS_POLL_MS = 30_000;
const WIDGET_SCRIPT_URL =
  (import.meta as any).env?.VITE_WIDGET_SCRIPT_URL ??
  (typeof window !== "undefined" ? `${window.location.origin}/chat-widget.iife.js` : "/chat-widget.iife.js");

/** Mirrors `GET /api/sites/dashboard-stats` */
interface DashboardAnalytics {
  totals: {
    totalTurns: number;
    last7Days: number;
    thisCalendarMonth: number;
    avgLatencyMs: number | null;
    turnsWithSources: number;
    voiceTurns: number;
    textTurns: number;
  };
  volumeByDay: Array<{ date: string; dayLabel: string; count: number }>;
  topQueries: Array<{ query: string; count: number; answered: boolean }>;
  recentTurns: Array<{
    id: number;
    siteId: string;
    query: string;
    answerPreview: string | null;
    createdAt: string;
    channel: string;
    sourceCount: number | null;
  }>;
  context: { websiteCount: number; pagesIndexed: number; faqCount: number };
}

function parseSqliteDatetime(s: string): Date {
  if (s.includes("T")) return new Date(s.endsWith("Z") ? s : `${s}Z`);
  return new Date(`${s.replace(" ", "T")}Z`);
}

function formatRelativeTime(iso: string): string {
  const d = parseSqliteDatetime(iso);
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 45) return "Just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  if (sec < 172800) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatSyncAgo(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard; desc: string }[] = [
  { id: "overview",  label: "Overview",        icon: LayoutDashboard, desc: "Stats & quick view"      },
  { id: "websites",  label: "Websites",         icon: Globe,           desc: "Manage indexed sites"    },
  { id: "analytics", label: "Analytics",        icon: BarChart3,       desc: "Queries & FAQs"          },
  { id: "social",    label: "Social",            icon: Share2,          desc: "Connect channels"        },
  { id: "visitors",  label: "Visitors",          icon: Users,           desc: "Interaction history"     },
  { id: "settings",  label: "Settings",          icon: Mic,             desc: "Bot configuration"       },
  { id: "billing", label: "Billing", icon: CreditCard, desc: "Plan & invoices" }
];

const DASH_PANEL =
  "rounded-[1.75rem] border border-[#1f2522]/8 bg-white/76 shadow-[0_18px_40px_rgba(31,37,34,0.045)] backdrop-blur-xl";
const DASH_PANEL_SOFT =
  "rounded-[1.2rem] border border-[#1f2522]/8 bg-[#fbf7f2]";
const DASH_BUTTON_PRIMARY =
  "flex items-center gap-2 rounded-full bg-[#1f2522] px-4 py-2.5 text-sm font-medium text-white shadow-[0_16px_32px_rgba(31,37,34,0.12)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#bc6c25]";

/* ─────────────────────────────────────────────────────────────────────────── */

export const DashboardPage = ({
  onViewChange: _onViewChange,
  externalSites: _externalSites,
  onSitesChange,
  selectedSite,
  onSiteSelect,
}: DashboardPageProps) => {
  const [user, setUser] = useState<{ id?: string; name?: string; email?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  // Internal full website list (with extra fields not needed by Navbar)
  const [websites, setWebsites] = useState<Website[]>([]);
  const [showAddSite, setShowAddSite] = useState(false);
  const [newSiteUrl, setNewSiteUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapingUrl, setScrapingUrl] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [webDataOnly, setWebDataOnly] = useState(true);
  const [integrationSite, setIntegrationSite] = useState<Website | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Website | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsManualRefreshing, setAnalyticsManualRefreshing] = useState(false);
  const [lastAnalyticsSyncedAt, setLastAnalyticsSyncedAt] = useState<number | null>(null);

  // Sync internal websites → external SiteOptions for Navbar
  const syncToExternal = (wbs: Website[]) => {
    onSitesChange(wbs.map(w => ({
      id: w.id, url: w.url, hostname: w.hostname,
      pagesIndexed: w.pagesIndexed, status: w.status, lastCrawled: w.lastCrawled,
    })));
  };

  const setWebsitesBoth = (wbs: Website[]) => {
    setWebsites(wbs);
    syncToExternal(wbs);
  };

  const buildIntegration = (site: Website): IntegrationInfo => {
    const consoleCode = `(function(){if(document.getElementById("chat-widget-root")){return;}window.NAVBOT_CONFIG={apiBase:"${API_BASE}",siteId:"${site.id}"};var s=document.createElement("script");s.src="${WIDGET_SCRIPT_URL}";s.crossOrigin="anonymous";document.body.appendChild(s);})();`;
    const scriptTag = `<script>\n  window.NAVBOT_CONFIG = { apiBase: "${API_BASE}", siteId: "${site.id}" };\n</script>\n<script src="${WIDGET_SCRIPT_URL}" crossorigin="anonymous"></script>`;
    return { siteId: site.id, url: site.url, consoleCode, scriptTag };
  };

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
        fetch(`${API_BASE}/api/sites?userId=${encodeURIComponent(data.user.id)}`)
          .then(r => r.json())
          .then((sites: any[]) => {
            const mapped: Website[] = sites.map((s: any) => ({
              id: s.id, url: s.url, hostname: s.hostname, status: s.status,
              pagesIndexed: s.pagesIndexed, lastCrawled: s.lastCrawled,
              addedAt: s.addedAt, widgetTheme: s.widgetTheme ?? null,
            }));
            setWebsitesBoth(mapped);
            if (mapped.length === 1) onSiteSelect(mapped[0]);
          })
          .catch(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeSiteId = selectedSite?.id ?? null;

  const loadDashboardAnalytics = useCallback(
    async (mode: "initial" | "silent" | "manual") => {
      const uid = user?.id;
      if (!uid) return;
      if (mode === "initial") setAnalyticsLoading(true);
      if (mode === "manual") setAnalyticsManualRefreshing(true);
      try {
        const q = new URLSearchParams({ userId: uid });
        if (activeSiteId) q.set("siteId", activeSiteId);
        const r = await fetch(`${API_BASE}/api/sites/dashboard-stats?${q.toString()}`);
        if (r.ok) {
          const data = (await r.json()) as DashboardAnalytics;
          setAnalytics(data);
          setLastAnalyticsSyncedAt(Date.now());
        }
      } catch {
        /* network / parse */
      } finally {
        if (mode === "initial") setAnalyticsLoading(false);
        if (mode === "manual") setAnalyticsManualRefreshing(false);
      }
    },
    [user?.id, activeSiteId]
  );

  useEffect(() => {
    if (!user?.id) return;
    void loadDashboardAnalytics("initial");
  }, [user?.id, activeSiteId, websites.length, loadDashboardAnalytics]);

  useEffect(() => {
    if (!user?.id) return;
    const poll = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void loadDashboardAnalytics("silent");
    };
    const id = window.setInterval(poll, DASHBOARD_ANALYTICS_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadDashboardAnalytics("silent");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user?.id, activeSiteId, loadDashboardAnalytics]);

  const handleAddWebsite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteUrl.trim()) return;
    setScrapingUrl(newSiteUrl.trim());
    setIsScraping(true);
    setShowAddSite(false);
    setIndexError(null);
  };

  const handleDeleteSite = async () => {
    if (!deleteTarget || deleteConfirmText !== deleteTarget.id) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/sites/${encodeURIComponent(deleteTarget.id)}?userId=${encodeURIComponent(user?.id ?? "")}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to delete site.");
      const updated = websites.filter(s => s.id !== deleteTarget.id);
      setWebsitesBoth(updated);
      if (selectedSite?.id === deleteTarget.id) onSiteSelect(null);
      setDeleteTarget(null);
      setDeleteConfirmText("");
    } catch (err: any) {
      setDeleteError(err?.message || "Something went wrong while deleting.");
    } finally { setIsDeleting(false); }
  };

  // The site data to display — respects the global selector
  const activeSite = selectedSite
    ? websites.find(w => w.id === selectedSite.id) ?? null
    : null;

  if (isScraping) {
    return (
      <ScrapingPage
        websiteUrl={scrapingUrl}
        userId={user?.id}
        apiBase={API_BASE}
        onComplete={(result) => {
          const hostname = (() => { try { return new URL(scrapingUrl).hostname; } catch { return scrapingUrl; } })();
          const newSite: Website = {
            id: result.siteId, url: scrapingUrl, hostname, status: "active",
            pagesIndexed: result.stored, lastCrawled: "Just now",
            addedAt: new Date().toISOString(), widgetTheme: result.widgetTheme ?? null,
          };
          const updated = [...websites, newSite];
          setWebsitesBoth(updated);
          onSiteSelect(newSite);
          setIsScraping(false);
          setNewSiteUrl("");
          setActiveTab("overview");
        }}
        onError={(msg) => {
          setIndexError(msg);
          setIsScraping(false);
          setNewSiteUrl("");
        }}
      />
    );
  }

  if (integrationSite) {
    return (
      <div className="min-h-screen bg-[#f8f4ee] pt-14">
        <div className="relative z-10 mx-auto max-w-[1400px] px-6 pb-12 pt-6">
          <button type="button" onClick={() => setIntegrationSite(null)}
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-[#65726d] group hover:text-[#bc6c25]">
            <span className="text-base leading-none group-hover:-translate-x-0.5 transition-transform">←</span>
            Back to dashboard
          </button>
          <IntegrationPanel
            info={buildIntegration(integrationSite)}
            userId={user?.id ?? ""}
            apiBase={API_BASE}
            initialTheme={integrationSite.widgetTheme}
          />
        </div>
      </div>
    );
  }

  const firstName = user?.name?.trim()?.split(" ")[0] || "there";
  const showAnalyticsChrome =
    !!user?.id &&
    (activeTab === "overview" ||
      activeTab === "analytics" ||
      activeTab === "visitors" ||
      activeTab === "billing");

  return (
    <div className="min-h-screen bg-[#f8f4ee] pt-14 text-[#1f2522]">
      {indexError && (
        <div className="relative z-10 px-6 pt-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{indexError}</div>
        </div>
      )}

      <div className="relative z-10 flex min-h-[calc(100vh-56px)]">
        {/* ── Sidebar ── */}
        <aside className="sticky top-14 hidden h-[calc(100vh-56px)] w-[220px] flex-shrink-0 self-start overflow-y-auto border-r border-[#1f2522]/8 bg-[#fbf8f3] px-4 pb-5 pt-5 lg:flex lg:flex-col">
          <nav className="flex-1 space-y-1">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full rounded-[1rem] px-3 py-2.5 text-left transition-all duration-200 ${
                    isActive
                      ? "bg-white text-[#1f2522] shadow-[0_10px_24px_rgba(31,37,34,0.04)]"
                      : "text-[#65726d] hover:bg-white/70 hover:text-[#1f2522]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                      isActive ? "bg-[#f6eee3] text-[#bc6c25]" : "bg-[#f3eee7] text-[#8a938f]"
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="min-w-0 text-sm font-medium">{tab.label}</p>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Mobile tab bar ── */}
        <div className="fixed bottom-0 left-0 right-0 z-50 flex gap-1 overflow-x-auto border-t border-[#1f2522]/8 bg-[#fbf8f3]/95 px-2 py-2 backdrop-blur-xl lg:hidden">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex flex-shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-medium transition-colors ${activeTab === tab.id ? "bg-white text-[#bc6c25]" : "text-[#8a938f] hover:text-[#5f6b67]"}`}>
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Main content ── */}
        <main className="min-w-0 flex-1 overflow-auto px-5 pb-24 pt-6 lg:px-8 lg:pb-8 lg:pt-8" style={{ maxHeight: 'calc(100vh - 56px)' }}>
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a938f]">
                {activeSite ? activeSite.hostname : "Workspace"}
              </p>
              <h1 className="font-display text-[3rem] font-light leading-none tracking-[-0.055em] text-[#1f2522] md:text-[3.7rem]">
                {activeTab === "overview" ? `Hello ${firstName}` : TABS.find(t => t.id === activeTab)?.label}
              </h1>
              <p className="mt-3 text-sm text-[#65726d]">
                {activeTab === "overview"
                  ? "A quick view of your websites, conversations, and recent activity."
                  : activeSite
                    ? `${activeSite.hostname} · ${TABS.find(t => t.id === activeTab)?.desc}`
                    : `All sites · ${TABS.find(t => t.id === activeTab)?.desc}`
                }
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {activeTab === "overview" && (
                <button onClick={() => { setActiveTab("websites"); setShowAddSite(true); }}
                  className={DASH_BUTTON_PRIMARY}>
                  <Plus className="w-4 h-4" /> Add website
                </button>
              )}
              {activeTab === "websites" && (
                <button onClick={() => setShowAddSite(!showAddSite)}
                  className={DASH_BUTTON_PRIMARY}>
                  <Plus className="w-4 h-4" /> Add website
                </button>
              )}
              <div className="rounded-full border border-[#1f2522]/8 bg-white/72 px-4 py-2.5 text-sm text-[#65726d]">
                {websites.length} {websites.length === 1 ? "website" : "websites"}
              </div>
              {showAnalyticsChrome && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void loadDashboardAnalytics("manual")}
                    disabled={analyticsManualRefreshing}
                    className="inline-flex items-center gap-2 rounded-full border border-[#1f2522]/10 bg-white/72 px-4 py-2.5 text-sm font-medium text-[#65726d] transition-colors hover:border-[#bc6c25]/30 hover:text-[#bc6c25] disabled:cursor-not-allowed disabled:opacity-50"
                    title="Reload chat analytics from the server"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${analyticsManualRefreshing ? "animate-spin" : ""}`}
                    />
                    Refresh stats
                  </button>
                  {lastAnalyticsSyncedAt != null && (
                    <span
                      className="text-xs text-[#8a938f] tabular-nums"
                      title={new Date(lastAnalyticsSyncedAt).toLocaleString()}
                    >
                      Updated {formatSyncAgo(lastAnalyticsSyncedAt)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tab content */}
          {activeTab === "overview"  && (
            <OverviewTab
              websites={websites}
              activeSite={activeSite}
              onIntegrate={setIntegrationSite}
              onSwitchTab={setActiveTab}
              analytics={analytics}
              analyticsLoading={analyticsLoading}
            />
          )}
          {activeTab === "websites"  && <WebsitesTab websites={websites} showAddSite={showAddSite} setShowAddSite={setShowAddSite} newSiteUrl={newSiteUrl} setNewSiteUrl={setNewSiteUrl} onAddWebsite={handleAddWebsite} onIntegrate={setIntegrationSite} onDelete={setDeleteTarget} userId={user?.id ?? ""} />}
          {activeTab === "analytics" && (
            <AnalyticsTab activeSite={activeSite} analytics={analytics} analyticsLoading={analyticsLoading} />
          )}
          {activeTab === "social"    && <SocialTab activeSite={activeSite} userId={user?.id ?? ""} />}
          {activeTab === "visitors"  && (
            <VisitorInsightsTab activeSite={activeSite} analytics={analytics} analyticsLoading={analyticsLoading} />
          )}
          {activeTab === "settings"  && <SettingsTab voiceEnabled={voiceEnabled} setVoiceEnabled={setVoiceEnabled} webDataOnly={webDataOnly} setWebDataOnly={setWebDataOnly} activeSite={activeSite} />}
          {activeTab === "billing" && (
            <BillingTab
              onPlanActivated={() => setActiveTab("overview")}
              usage={
                analytics
                  ? {
                      conversationsThisMonth: analytics.totals.thisCalendarMonth,
                      pagesIndexed: analytics.context.pagesIndexed,
                      websiteCount: analytics.context.websiteCount,
                    }
                  : null
              }
              usageLoading={analyticsLoading}
            />
          )}
        </main>
      </div>

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative mx-4 w-full max-w-md rounded-[1.9rem] border border-[#1f2522]/8 bg-[#fbf8f3] p-6 shadow-2xl">
            <button type="button" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); setDeleteError(null); }} className="absolute right-4 top-4 text-[#8a938f] hover:text-[#5f6b67]">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <div><h3 className="text-base font-medium text-[#1f2522]">Delete website</h3><p className="text-xs text-[#8a938f]">{deleteTarget.hostname}</p></div>
            </div>
            <p className="mb-4 text-sm text-[#65726d]">
              This permanently deletes <span className="font-medium">{deleteTarget.hostname}</span> and all indexed data.
              Type the site ID to confirm:
            </p>
            <div className="mb-3 rounded-lg bg-[#f3eee7] px-3 py-2 font-mono text-xs text-[#65726d] select-all">{deleteTarget.id}</div>
            <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="Type site ID to confirm"
              className="w-full rounded-xl border border-[#1f2522]/8 bg-white px-4 py-3 font-mono text-sm text-[#1f2522] outline-none focus:border-red-400" />
            {deleteError && <p className="text-xs text-red-600 mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {deleteError}</p>}
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); setDeleteError(null); }} className="rounded-full px-4 py-2.5 text-sm font-medium text-[#65726d] hover:bg-[#f3eee7]">Cancel</button>
              <button type="button" disabled={deleteConfirmText !== deleteTarget.id || isDeleting} onClick={handleDeleteSite}
                className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40">
                {isDeleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</> : <><Trash2 className="w-4 h-4" /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── UPDATE PAGES PANEL ─────────────────────────────────────────────────── */

function UpdatePagesPanel({ site }: { site: Website }) {
  const [expanded, setExpanded] = useState(false);
  const [urlsText, setUrlsText] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); e.stopPropagation();
    const urls = urlsText.split("\n").map(u => u.trim()).filter(u => u.length > 0);
    if (!urls.length) return;
    setIsUpdating(true); setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/sites/${encodeURIComponent(site.id)}/pages`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Update failed");
      setResult({ success: true, message: `Updated ${data.stored} chunks from ${data.pagesFound}/${data.requestedUrls} pages` });
      setUrlsText("");
    } catch (err: any) {
      setResult({ success: false, message: err?.message || "Something went wrong" });
    } finally { setIsUpdating(false); }
  };

  return (
    <div onClick={e => e.stopPropagation()} style={{ display: "contents" }}>
      <button type="button" onClick={e => { e.stopPropagation(); setExpanded(!expanded); setResult(null); }}
        className="flex items-center gap-1.5 rounded-full bg-[#f6eee3] px-3 py-1.5 text-xs font-medium text-[#bc6c25] transition-colors hover:bg-[#efdfcd]">
        <RefreshCw className="w-3 h-3" /> Update Pages
        {expanded
          ? <ChevronUp className="w-3 h-3 ml-0.5" />
          : <ChevronDown className="w-3 h-3 ml-0.5" />}
      </button>
      {expanded && (
        <div className={`mt-1 basis-full p-4 ${DASH_PANEL_SOFT}`}>
          <form onSubmit={handleSubmit}>
            <label className="mb-1.5 block text-xs font-medium text-[#5f6b67]">URLs to recrawl (one per line)</label>
            <textarea value={urlsText} onChange={e => setUrlsText(e.target.value)} onClick={e => e.stopPropagation()}
              placeholder={`https://${site.hostname}/about`} rows={3}
              className="w-full resize-none rounded-xl border border-[#1f2522]/8 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-[#bc6c25]/35" />
            <div className="flex items-center justify-between mt-3">
              <button type="submit" disabled={isUpdating || !urlsText.trim()} onClick={e => e.stopPropagation()}
                className="flex items-center gap-2 rounded-full bg-[#1f2522] px-4 py-2 text-xs font-medium text-white transition-all duration-300 hover:bg-[#bc6c25] disabled:opacity-50">
                {isUpdating ? <><Loader2 className="w-3 h-3 animate-spin" /> Updating...</> : <><RefreshCw className="w-3 h-3" /> Recrawl</>}
              </button>
              {result && (
                <span className={`text-xs ${result.success ? "text-green-600" : "text-red-600"}`}>
                  {result.success ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : <AlertCircle className="w-3 h-3 inline mr-1" />}
                  {result.message}
                </span>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ─── OVERVIEW TAB ───────────────────────────────────────────────────────── */

function OverviewTab({ websites, activeSite, onIntegrate, onSwitchTab, analytics, analyticsLoading }: {
  websites: Website[]; activeSite: Website | null;
  onIntegrate: (s: Website) => void;
  onSwitchTab: (t: Tab) => void;
  analytics: DashboardAnalytics | null;
  analyticsLoading: boolean;
}) {
  const displaySites = activeSite ? [activeSite] : websites;
  const totalPages = displaySites.reduce((s, w) => s + (w.pagesIndexed || 0), 0);
  const convoCount = analytics?.totals.totalTurns ?? 0;
  const avgMs = analytics?.totals.avgLatencyMs;
  const avgLabel =
    analyticsLoading && !analytics
      ? "…"
      : avgMs != null
        ? `${(avgMs / 1000).toFixed(1)}s`
        : "—";
  const weekBars = analytics?.volumeByDay?.length
    ? analytics.volumeByDay
    : Array.from({ length: 7 }, (_, i) => ({
        date: `d${i}`,
        dayLabel: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][(i + 4) % 7]!,
        count: 0,
      }));
  const maxWeek = Math.max(...weekBars.map((d) => d.count), 1);
  const recent = (analytics?.recentTurns ?? []).slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: activeSite ? "Website" : "Active websites", value: activeSite ? "1" : websites.length.toString(), icon: Globe, color: "#bc6c25" },
          { label: "Pages indexed", value: totalPages.toLocaleString(), icon: FileText, color: "#27C93F" },
          {
            label: "Chat turns",
            value: analyticsLoading && !analytics ? "…" : convoCount.toLocaleString(),
            icon: MessageSquare,
            color: "#456a92",
          },
          { label: "Avg response", value: avgLabel, icon: Clock, color: "#F59E0B" },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={`${DASH_PANEL} p-5`}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: stat.color + "15" }}>
                <Icon className="w-4 h-4" style={{ color: stat.color }} />
              </div>
              <p className="mb-0.5 text-2xl font-light text-[#1f2522]">{stat.value}</p>
              <p className="text-xs text-[#8a938f]">{stat.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid md:grid-cols-5 gap-5">
        <div className={`md:col-span-2 ${DASH_PANEL} p-6`}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-medium text-[#1f2522]">This week</h3>
            <button onClick={() => onSwitchTab("analytics")} className="flex items-center gap-1 text-xs text-[#bc6c25] hover:underline">
              Full analytics <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-end gap-2" style={{ height: "6rem" }}>
            {weekBars.map((d) => {
              const barH = Math.max((d.count / maxWeek) * 100, d.count > 0 ? 8 : 4);
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center justify-end" style={{ height: "100%" }}>
                  <div className="w-full rounded-md transition-opacity hover:opacity-75" style={{ height: `${barH}%`, minHeight: "4px", background: "linear-gradient(to top, #bc6c25, #ead4bd)" }} title={`${d.count} turns`} />
                  <span className="mt-1.5 text-[10px] text-[#8a938f]">{d.dayLabel}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`md:col-span-3 ${DASH_PANEL} p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[#1f2522]">Recent conversations</h3>
            <button onClick={() => onSwitchTab("visitors")} className="flex items-center gap-1 text-xs text-[#bc6c25] hover:underline">
              See all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {analyticsLoading && recent.length === 0 ? (
              <p className="text-xs text-[#8a938f] py-2">Loading activity…</p>
            ) : recent.length === 0 ? (
              <p className="text-xs text-[#8a938f] py-2">No chat turns yet. Embed the widget and try a message.</p>
            ) : (
              recent.map((turn) => (
                <div key={turn.id} className="flex items-start gap-3 rounded-[1.1rem] bg-[#fbf7f2] p-3">
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#f6eee3]">
                    <MessageSquare className="h-3.5 w-3.5 text-[#bc6c25]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-[#1f2522]">Turn #{turn.id}</span>
                      <span className="text-[10px] text-[#8a938f]">{formatRelativeTime(turn.createdAt)}</span>
                      <span className="text-[10px] text-[#c3baad]">{turn.channel === "voice" ? "Voice" : "Text"}</span>
                    </div>
                    <p className="truncate text-xs text-[#65726d]">{turn.query}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className={`${DASH_PANEL} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-[#1f2522]/8 px-6 py-4">
          <h3 className="text-sm font-medium text-[#1f2522]">{activeSite ? "Site details" : "Your websites"}</h3>
          <button onClick={() => onSwitchTab("websites")} className="flex items-center gap-1 text-xs text-[#bc6c25] hover:underline">
            Manage <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        {displaySites.length === 0 ? (
          <div className="text-center py-12">
            <Globe className="mx-auto mb-3 h-10 w-10 text-[#ddd3c6]" />
            <p className="mb-3 text-sm text-[#8a938f]">No websites yet</p>
            <button onClick={() => onSwitchTab("websites")} className="text-sm font-medium text-[#bc6c25] hover:underline">Add your first website →</button>
          </div>
        ) : (
          <div className="divide-y divide-[#f0e8dd]">
            {displaySites.map(site => (
              <div key={site.id} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-[#fbf7f2]">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#f6eee3] text-sm font-bold uppercase text-[#bc6c25]">
                  {site.hostname.charAt(0)}
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onIntegrate(site)}>
                  <p className="truncate text-sm font-medium text-[#1f2522]">{site.hostname}</p>
                  <p className="text-xs text-[#8a938f]">{site.pagesIndexed} pages · {formatLocalDate(site.lastCrawled)}</p>
                </div>
                
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── WEBSITES TAB ───────────────────────────────────────────────────────── */

function WebsitesTab({ websites, showAddSite, setShowAddSite, newSiteUrl, setNewSiteUrl, onAddWebsite, onIntegrate, onDelete, userId }: {
  websites: Website[]; showAddSite: boolean; setShowAddSite: (v: boolean) => void;
  newSiteUrl: string; setNewSiteUrl: (v: string) => void; onAddWebsite: (e: React.FormEvent) => void;
  onIntegrate: (s: Website) => void; onDelete: (s: Website) => void; userId: string;
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

            <div className="flex flex-wrap items-center gap-2 border-t border-[#1f2522]/8 bg-[#fbf7f2] px-6 py-3">
              <UpdatePagesPanel site={site} />
              <SitemapSyncPanel siteId={site.id} userId={userId} apiBase={API_BASE} hostname={site.hostname} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── ANALYTICS TAB ──────────────────────────────────────────────────────── */

function AnalyticsTab({ activeSite, analytics, analyticsLoading }: {
  activeSite: Website | null;
  analytics: DashboardAnalytics | null;
  analyticsLoading: boolean;
}) {
  const [faqView, setFaqView] = useState<"analytics" | "faqs" | "training">("analytics");
  const [faqItems, setFaqItems] = useState<
    Array<{ label: string; question: string; answerPreview?: string | null }>
  >([]);
  const [faqLoading, setFaqLoading] = useState(false);
  const [faqErr, setFaqErr] = useState<string | null>(null);

  useEffect(() => {
    if (faqView !== "faqs" || !activeSite) {
      setFaqItems([]);
      setFaqErr(null);
      return;
    }
    setFaqLoading(true);
    setFaqErr(null);
    fetch(`${API_BASE}/api/sites/${encodeURIComponent(activeSite.id)}/faqs?includeAnswers=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body: { faqs?: Array<{ label: string; question: string; answerPreview?: string | null }> }) => {
        setFaqItems(body.faqs ?? []);
      })
      .catch(() => setFaqErr("Could not load FAQs."))
      .finally(() => setFaqLoading(false));
  }, [faqView, activeSite?.id]);

  const vol = analytics?.volumeByDay?.length
    ? analytics.volumeByDay
    : Array.from({ length: 7 }, (_, i) => ({
        date: `p${i}`,
        dayLabel: ["S", "M", "T", "W", "T", "F", "S"][i]!,
        count: 0,
      }));
  const maxBar = Math.max(...vol.map((d) => d.count), 1);
  const avgMs = analytics?.totals.avgLatencyMs;
  const avgStr = analyticsLoading && !analytics ? "…" : avgMs != null ? `${(avgMs / 1000).toFixed(1)}s avg` : "—";
  const top = analytics?.topQueries ?? [];
  const ctx = analytics?.context;

  return (
    <div className="space-y-6">
      <div className="flex w-fit gap-1 rounded-xl border border-[#1f2522]/8 bg-[#f3eee7] p-1">
        {(["analytics", "faqs", "training"] as const).map(step => (
          <button key={step} onClick={() => setFaqView(step)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${faqView === step ? "bg-white text-[#1f2522] shadow-sm" : "text-[#8a938f] hover:text-[#5f6b67]"}`}>
            {step === "analytics" && <><BarChart3 className="w-3.5 h-3.5" /> Analytics</>}
            {step === "faqs"      && <><Brain className="w-3.5 h-3.5" /> FAQs</>}
            {step === "training"  && <><Zap className="w-3.5 h-3.5" /> Training</>}
          </button>
        ))}
      </div>

      {faqView === "analytics" && (
        <>
          <div className="grid md:grid-cols-2 gap-5">
            <div className={`${DASH_PANEL} p-6`}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-medium text-[#1f2522]">Chat volume (7 days)</h3>
                <span className="text-xs text-[#8a938f]">{avgStr}</span>
              </div>
              <div className="flex items-end gap-3" style={{ height: "9rem" }}>
                {vol.map((d) => {
                  const barH = Math.max((d.count / maxBar) * 100, d.count > 0 ? 6 : 4);
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end" style={{ height: "100%" }}>
                      <span className="mb-1.5 text-[10px] font-medium text-[#1f2522]">{d.count}</span>
                      <div className="w-full rounded-lg hover:opacity-75 transition-opacity relative group/bar cursor-default"
                        style={{ height: `${barH}%`, minHeight: "4px", background: "linear-gradient(to top, #bc6c25, #ead4bd)" }}>
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#1f2522] px-2 py-1 text-[10px] text-white opacity-0 transition-opacity pointer-events-none group-hover/bar:opacity-100">
                          {d.count}
                        </div>
                      </div>
                      <span className="mt-2 text-[10px] text-[#8a938f]">{d.dayLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`${DASH_PANEL} p-6`}>
              <h3 className="mb-4 text-sm font-medium text-[#1f2522]">Top questions</h3>
              {analyticsLoading && top.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-[#8a938f] py-6">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : top.length === 0 ? (
                <p className="text-xs text-[#8a938f] py-4">No questions logged yet.</p>
              ) : (
                <div className="space-y-1">
                  {top.map((q, i) => (
                    <div key={`${q.query}-${i}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[#fbf7f2]">
                      <span className="w-4 flex-shrink-0 text-xs font-mono text-[#c3baad]">#{i + 1}</span>
                      <p className="flex-1 truncate text-sm text-[#1f2522]">{q.query}</p>
                      <span className="flex-shrink-0 text-[11px] text-[#8a938f]">{q.count}×</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${q.answered ? "text-green-600 bg-green-50" : "text-amber-600 bg-amber-50"}`}>{q.answered ? "Sources" : "No match"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: "Pages indexed", value: ctx?.pagesIndexed ?? 0, icon: Search, color: "#bc6c25" },
              { label: "Turns with page sources", value: analytics?.totals.turnsWithSources ?? 0, icon: ArrowUpRight, color: "#456a92" },
              { label: "Websites in view", value: ctx?.websiteCount ?? 0, icon: TrendingUp, color: "#27C93F" },
            ].map(stat => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className={`${DASH_PANEL} flex items-center gap-4 p-5`}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: stat.color + "15" }}>
                    <Icon className="w-5 h-5" style={{ color: stat.color }} />
                  </div>
                  <div>
                    <p className="text-2xl font-light text-[#1f2522]">
                      {analyticsLoading && !analytics ? "…" : typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
                    </p>
                    <p className="text-xs text-[#8a938f]">{stat.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {faqView === "faqs" && (
        <div className="space-y-3">
          {!activeSite ? (
            <p className="text-sm text-[#65726d]">Select a website to load FAQs generated from its indexed content and popular queries.</p>
          ) : faqLoading ? (
            <div className={`${DASH_PANEL} flex items-center gap-2 p-6 text-sm text-[#8a938f]`}>
              <Loader2 className="w-4 h-4 animate-spin" /> Loading FAQs…
            </div>
          ) : faqErr ? (
            <p className="text-sm text-red-600">{faqErr}</p>
          ) : faqItems.length === 0 ? (
            <p className="text-sm text-[#8a938f]">No FAQs yet. They are created when visitors open the widget or when the API first requests them.</p>
          ) : (
            faqItems.map((faq, i) => (
              <div key={`${faq.label}-${i}`} className={`${DASH_PANEL} flex gap-4 p-5`}>
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#f6eee3]"><MessageSquare className="h-4 w-4 text-[#bc6c25]" /></div>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#bc6c25] mb-1">{faq.label}</p>
                  <h4 className="mb-2 text-sm font-semibold text-[#1f2522]">{faq.question}</h4>
                  <p className="text-sm leading-relaxed text-[#65726d]">
                    {faq.answerPreview?.trim()
                      ? faq.answerPreview
                      : "Answer preview unavailable right now. Try refreshing stats to regenerate this FAQ answer."}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {faqView === "training" && (
        <div className="space-y-5">
          <div className={`${DASH_PANEL} p-8`}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f6eee3]"><Zap className="h-7 w-7 text-[#bc6c25]" /></div>
            <h3 className="mb-2 text-base font-semibold text-[#1f2522] text-center">Knowledge base</h3>
            <p className="mx-auto max-w-md text-sm text-[#8a938f] text-center">
              NavBot does not train a separate model on your traffic. Each reply is retrieved from your crawled pages at question time. These numbers reflect how much real usage and FAQ structure you have accumulated.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Logged chat turns", value: analytics?.totals.totalTurns ?? 0 },
              { label: "FAQ entries", value: analytics?.context.faqCount ?? 0 },
              { label: "Voice turns", value: analytics?.totals.voiceTurns ?? 0 },
            ].map(s => (
              <div key={s.label} className={`${DASH_PANEL} p-5 text-center`}>
                <p className="text-2xl font-light text-[#1f2522]">
                  {analyticsLoading && !analytics ? "…" : s.value.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[#8a938f]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── SOCIAL TAB ─────────────────────────────────────────────────────────── */

const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", placeholder: "e.g. your_college", color: "#E1306C" },
  { key: "twitter", label: "Twitter / X", placeholder: "e.g. your_college", color: "#1DA1F2" },
  { key: "linkedin", label: "LinkedIn", placeholder: "e.g. your-college-page", color: "#0077B5" },
  { key: "facebook", label: "Facebook", placeholder: "e.g. YourCollegePage", color: "#1877F2" },
] as const;

function SocialTab({ activeSite, userId }: { activeSite: Website | null; userId: string }) {
  const [handles, setHandles] = useState<Record<string, string>>({ instagram: "", twitter: "", linkedin: "", facebook: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch existing handles when site changes
  useEffect(() => {
    if (!activeSite) return;
    setLoading(true);
    setSaved(false);
    fetch(`${API_BASE}/api/sites/${activeSite.id}/social`)
      .then(r => r.json())
      .then(data => setHandles({ instagram: data.instagram ?? "", twitter: data.twitter ?? "", linkedin: data.linkedin ?? "", facebook: data.facebook ?? "" }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeSite?.id]);

  const handleSave = async () => {
    if (!activeSite) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${API_BASE}/api/sites/${activeSite.id}/social?userId=${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(handles),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const configured = Object.values(handles).filter(v => v.trim()).length;

  if (!activeSite) {
    return <p className="text-xs text-[#8a938f]">Select a website first to configure social handles.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-[#8a938f]">
          Add your social media usernames for <span className="font-medium text-[#1f2522]">{activeSite.hostname}</span>.
          When visitors ask about events, updates, or announcements, NavBot will search Google for your latest social media posts and include them in answers.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-[#8a938f]">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="space-y-3">
          {SOCIAL_PLATFORMS.map(({ key, label, placeholder, color }) => (
            <div key={key} className={`${DASH_PANEL} flex items-center gap-4 px-6 py-4`}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + "15" }}>
                <Share2 className="w-4 h-4" style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-sm font-medium text-[#1f2522] block mb-1">{label}</label>
                <input
                  type="text"
                  value={handles[key] ?? ""}
                  onChange={e => setHandles(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full text-sm bg-transparent border-b border-[#1f2522]/10 focus:border-[#bc6c25] outline-none py-1 text-[#1f2522] placeholder:text-[#8a938f]/50 transition-colors"
                />
              </div>
              {handles[key]?.trim() && (
                <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex-shrink-0">Active</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-[#8a938f]">
          {configured} of {SOCIAL_PLATFORMS.length} platforms configured
        </p>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="rounded-full px-5 py-2 text-xs font-medium bg-[#1f2522] text-white hover:bg-[#bc6c25] transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save handles"}
          </button>
        </div>
      </div>

      <div className={`${DASH_PANEL_SOFT} p-4 mt-2`}>
        <p className="text-xs text-[#8a938f] leading-relaxed">
          <span className="font-medium text-[#1f2522]">How it works:</span> When a visitor asks about events, workshops, fests, placements, or any updates,
          NavBot searches Google for your social media posts and includes relevant links in the answer.
          Results are cached for 4 hours to stay within the Google Search free tier (100 queries/day).
        </p>
      </div>
    </div>
  );
}

/* ─── VISITORS TAB ───────────────────────────────────────────────────────── */

function VisitorInsightsTab({ activeSite, analytics, analyticsLoading }: {
  activeSite: Website | null;
  analytics: DashboardAnalytics | null;
  analyticsLoading: boolean;
}) {
  const turns = analytics?.recentTurns ?? [];
  const totals = analytics?.totals;

  return (
    <div className="space-y-5">
      <p className="text-xs text-[#8a938f]">
        The widget does not identify visitors. Each row is one logged question (text or voice) and stored answer preview.
        {activeSite ? ` Scoped to ${activeSite.hostname}.` : " All your sites combined."}
      </p>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total chat turns", value: totals?.totalTurns ?? 0, color: "#bc6c25" },
          { label: "Last 7 days", value: totals?.last7Days ?? 0, color: "#456a92" },
          { label: "With page sources", value: totals?.turnsWithSources ?? 0, color: "#27C93F" },
        ].map(stat => (
          <div key={stat.label} className={`${DASH_PANEL} p-5 text-center`}>
            <p className="text-2xl font-light text-[#1f2522]">
              {analyticsLoading && !analytics ? "…" : stat.value.toLocaleString()}
            </p>
            <p className="text-xs mt-1" style={{ color: stat.color }}>{stat.label}</p>
          </div>
        ))}
      </div>
      <div className={`${DASH_PANEL} overflow-hidden`}>
        <div className="border-b border-[#1f2522]/8 px-6 py-4">
          <h3 className="text-sm font-medium text-[#1f2522]">Recent interactions</h3>
        </div>
        <div className="divide-y divide-[#f0e8dd]">
          {analyticsLoading && turns.length === 0 ? (
            <div className="flex items-center gap-2 px-6 py-8 text-sm text-[#8a938f]">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : turns.length === 0 ? (
            <p className="px-6 py-8 text-sm text-[#8a938f]">No interactions recorded yet.</p>
          ) : (
            turns.map((item) => (
              <div key={item.id} className="flex items-start gap-4 px-6 py-4 transition-colors hover:bg-[#fbf7f2]">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#f6eee3]">
                  <MessageSquare className="h-3.5 w-3.5 text-[#bc6c25]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-[#1f2522]">Turn #{item.id}</span>
                    <span className="text-[10px] text-[#8a938f]">{formatRelativeTime(item.createdAt)}</span>
                    {!activeSite && (
                      <span className="text-[10px] text-[#c3baad] font-mono truncate max-w-[120px]">{item.siteId}</span>
                    )}
                  </div>
                  <p className="text-xs text-[#1f2522] font-medium truncate">"{item.query}"</p>
                  {item.answerPreview && (
                    <p className="mt-1 text-xs text-[#65726d] line-clamp-2">{item.answerPreview}</p>
                  )}
                </div>
                <span className="flex-shrink-0 rounded-full bg-[#f3eee7] px-2 py-1 text-[10px] font-medium text-[#65726d]">
                  {item.channel === "voice" ? "Voice" : "Text"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── TOGGLE HELPER ─────────────────────────────────────────────────────── */

function Toggle({ enabled, onChange, color }: { enabled: boolean; onChange: (v: boolean) => void; color: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="relative flex-shrink-0 w-12 h-7 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{ backgroundColor: enabled ? color : "#e7dfd4", flexShrink: 0 }}
    >
      <span
        className="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ left: "4px", transform: enabled ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}

/* ─── SETTINGS TAB ───────────────────────────────────────────────────────── */

function SettingsTab({ voiceEnabled, setVoiceEnabled, webDataOnly, setWebDataOnly, activeSite }: {
  voiceEnabled: boolean; setVoiceEnabled: (v: boolean) => void;
  webDataOnly: boolean; setWebDataOnly: (v: boolean) => void;
  activeSite: Website | null;
}) {
  return (
    <div className="space-y-4">
      <div className={`${DASH_PANEL} p-6`}>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${voiceEnabled ? "bg-[#f6eee3]" : "bg-[#f3eee7]"}`}>
              {voiceEnabled ? <Volume2 className="h-5 w-5 text-[#bc6c25]" /> : <VolumeX className="h-5 w-5 text-[#8a938f]" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-[#1f2522]">Voice input & responses</h3>
              <p className="mt-0.5 text-xs text-[#8a938f]">Visitors can speak questions and hear answers read aloud.</p>
            </div>
          </div>
          <Toggle enabled={voiceEnabled} onChange={setVoiceEnabled} color="#bc6c25" />
        </div>
      </div>

      <div className={`${DASH_PANEL} p-6`}>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${webDataOnly ? "bg-green-100" : "bg-[#f3eee7]"}`}>
              <Globe className={`h-5 w-5 ${webDataOnly ? "text-green-600" : "text-[#8a938f]"}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-[#1f2522]">Website-only answers</h3>
              <p className="mt-0.5 text-xs text-[#8a938f]">Bot only uses your indexed pages — never external sources.</p>
            </div>
          </div>
          <Toggle enabled={webDataOnly} onChange={setWebDataOnly} color="#22c55e" />
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-red-100 bg-white/76 p-6 shadow-[0_18px_40px_rgba(31,37,34,0.045)] backdrop-blur-xl">
        <h3 className="text-sm font-semibold text-red-600 mb-1">Danger zone</h3>
        <p className="mb-4 text-xs text-[#8a938f]">
          {activeSite ? `Delete ${activeSite.hostname} and all its indexed data permanently.` : "Delete all data across all websites."}
        </p>
        <button className="rounded-full border border-red-200 px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50">
          {activeSite ? `Delete ${activeSite.hostname}` : "Delete all data"}
        </button>
      </div>
    </div>
  );
}
