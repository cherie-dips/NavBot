import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CreditCard,
  FileText,
  Globe,
  LayoutDashboard,
  Loader2,
  Mic,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { authClient } from "../lib/auth-client";
import { apiFetch } from "../lib/api-fetch";
import { API_BASE, siteHostnameFromInput } from "../lib/api-base";
import { errorMessage } from "../lib/errors";
import { formatSyncAgo } from "../lib/format-date";
import { ScrapingPage } from "./ScrapingPage";
import { BillingTab } from "./BillingTab";
import { IntegrationPanel } from "../components/IntegrationPanel";
import { SiteOption } from "../components/SiteSelector";
import { DASH_BUTTON_PRIMARY } from "./dashboard/styles";
import type { DashboardAnalytics, SiteApiRow, Tab, Website } from "./dashboard/types";
import { OverviewTab } from "./dashboard/OverviewTab";
import { WebsitesTab } from "./dashboard/WebsitesTab";
import { AnalyticsTab } from "./dashboard/AnalyticsTab";
import { SocialTab } from "./dashboard/SocialTab";
import { VisitorInsightsTab } from "./dashboard/VisitorInsightsTab";
import { PagesTab } from "./dashboard/PagesTab";
import { SettingsTab } from "./dashboard/SettingsTab";

interface DashboardPageProps {
  onViewChange: (view: string) => void;
  onSignOut?: () => void;
  // Lifted state from App — so Navbar's selector and Dashboard stay in sync
  externalSites: SiteOption[];
  onSitesChange: (sites: SiteOption[]) => void;
  selectedSite: SiteOption | null;
  onSiteSelect: (site: SiteOption | null) => void;
}

/** Background refresh of chat analytics while the dashboard is open */
const DASHBOARD_ANALYTICS_POLL_MS = 30_000;
const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard; desc: string }[] = [
  { id: "overview",  label: "Overview",        icon: LayoutDashboard, desc: "Stats & quick view"      },
  { id: "websites",  label: "Websites",         icon: Globe,           desc: "Manage indexed sites"    },
  { id: "pages",     label: "Pages",             icon: FileText,        desc: "Indexed page list"       },
  { id: "analytics", label: "Analytics",        icon: BarChart3,       desc: "Queries & FAQs"          },
  { id: "social",    label: "Social",            icon: Share2,          desc: "Connect channels"        },
  { id: "visitors",  label: "Visitors",          icon: Users,           desc: "Interaction history"     },
  { id: "settings",  label: "Settings",          icon: Mic,             desc: "Bot configuration"       },
  { id: "billing", label: "Billing", icon: CreditCard, desc: "Plan & invoices" }
];

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


  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
        apiFetch(`${API_BASE}/api/sites`)
          .then(r => r.json())
          .then((sites: SiteApiRow[]) => {
            const mapped: Website[] = sites.map((s) => ({
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
        const q = new URLSearchParams();
        if (activeSiteId) q.set("siteId", activeSiteId);
        const r = await apiFetch(`${API_BASE}/api/sites/dashboard-stats?${q.toString()}`);
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
    if (!user?.id) {
      setIndexError(
        "Your account session is still loading. Wait a moment, then try adding the site again."
      );
      return;
    }
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
      const res = await apiFetch(
        `${API_BASE}/api/sites/${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to delete site.");
      const updated = websites.filter(s => s.id !== deleteTarget.id);
      setWebsitesBoth(updated);
      if (selectedSite?.id === deleteTarget.id) onSiteSelect(null);
      setDeleteTarget(null);
      setDeleteConfirmText("");
    } catch (err) {
      setDeleteError(errorMessage(err, "Something went wrong while deleting."));
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
          const hostname = siteHostnameFromInput(scrapingUrl);
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
            info={{ siteId: integrationSite.id, url: integrationSite.url }}
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
          {activeTab === "websites"  && <WebsitesTab websites={websites} showAddSite={showAddSite} setShowAddSite={setShowAddSite} newSiteUrl={newSiteUrl} setNewSiteUrl={setNewSiteUrl} onAddWebsite={handleAddWebsite} onIntegrate={setIntegrationSite} onDelete={setDeleteTarget} />}
          {activeTab === "analytics" && (
            <AnalyticsTab activeSite={activeSite} analytics={analytics} analyticsLoading={analyticsLoading} />
          )}
          {activeTab === "social"    && <SocialTab activeSite={activeSite} />}
          {activeTab === "visitors"  && (
            <VisitorInsightsTab activeSite={activeSite} analytics={analytics} analyticsLoading={analyticsLoading} />
          )}
          {activeTab === "settings"  && <SettingsTab voiceEnabled={voiceEnabled} setVoiceEnabled={setVoiceEnabled} webDataOnly={webDataOnly} setWebDataOnly={setWebDataOnly} activeSite={activeSite} />}
          {activeTab === "pages"     && <PagesTab activeSite={activeSite} />}
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
