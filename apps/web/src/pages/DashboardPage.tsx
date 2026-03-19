import { useEffect, useState } from "react";
import {
  LayoutDashboard, Globe, Plus, BarChart3, MessageSquare, Share2,
  Mic, Users, Brain, ArrowRight, AlertCircle, TrendingUp, Clock,
  ChevronRight, Search, Volume2, VolumeX, FileText, Zap, ArrowUpRight,
  RefreshCw, Loader2, CheckCircle2, Trash2, X,
} from "lucide-react";
import { authClient } from "../lib/auth-client";
import { ScrapingPage } from "./ScrapingPage";
import { IntegrationPanel } from "../components/IntegrationPanel";
import {
  mockStats, mockQueryHistory, mockTopQueries,
  mockFaqs, mockSocialMedia, mockVisitorInteractions, mockRecentConversations,
} from "../lib/mock-data";
import { WidgetTheme } from "../components/ColorThemePicker";
import { SitemapSyncPanel } from "../components/SitemapSyncPanel";
import { SiteOption } from "../components/SiteSelector";

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

type Tab = "overview" | "websites" | "analytics" | "social" | "visitors" | "settings";

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:3001";
const WIDGET_SCRIPT_URL =
  (import.meta as any).env?.VITE_WIDGET_SCRIPT_URL ??
  (typeof window !== "undefined" ? `${window.location.origin}/chat-widget.iife.js` : "/chat-widget.iife.js");

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard; desc: string }[] = [
  { id: "overview",  label: "Overview",        icon: LayoutDashboard, desc: "Stats & quick view"      },
  { id: "websites",  label: "Websites",         icon: Globe,           desc: "Manage indexed sites"    },
  { id: "analytics", label: "Analytics",        icon: BarChart3,       desc: "Queries & FAQs"          },
  { id: "social",    label: "Social Media",      icon: Share2,          desc: "Connect channels"        },
  { id: "visitors",  label: "Visitors",          icon: Users,           desc: "Interaction history"     },
  { id: "settings",  label: "Settings",          icon: Mic,             desc: "Bot configuration"       },
];

/* ─────────────────────────────────────────────────────────────────────────── */

export const DashboardPage = ({
  onViewChange: _onViewChange,
  externalSites,
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
      <div className="min-h-screen bg-[#F9F9FA] pt-14">
        <div className="max-w-[1400px] mx-auto px-6 pt-6 pb-12">
          <button type="button" onClick={() => setIntegrationSite(null)}
            className="text-sm text-slate-500 hover:text-[#478EDB] inline-flex items-center gap-1.5 mb-6 group">
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

  const maxQueries = Math.max(...mockQueryHistory.map(d => d.queries));

  return (
    <div className="min-h-screen bg-[#F9F9FA] pt-14">
      {indexError && (
        <div className="px-6 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{indexError}</div>
        </div>
      )}

      <div className="flex min-h-[calc(100vh-56px)]">
        {/* ── Sidebar ── */}
        <aside className="w-56 flex-shrink-0 hidden lg:flex flex-col border-r border-slate-100 bg-white pt-5 pb-8 sticky top-14 self-start h-[calc(100vh-56px)] overflow-y-auto">
          {/* Site context header in sidebar */}
          {activeSite && (
            <div className="px-5 mb-4">
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#F9F9FA] border border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-[#478EDB]/10 flex items-center justify-center text-[#478EDB] text-[11px] font-bold uppercase flex-shrink-0">
                  {activeSite.hostname.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#2E3538] truncate">{activeSite.hostname}</p>
                  <p className="text-[10px] text-slate-400">{activeSite.pagesIndexed} pages</p>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
              </div>
            </div>
          )}

          {!activeSite && (
            <div className="px-5 mb-2">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                All websites
              </p>
            </div>
          )}

          {/* Nav items */}
          <nav className="flex-1 px-3 space-y-0.5">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150
                    ${isActive
                      ? "bg-[#478EDB]/10 text-[#478EDB]"
                      : "text-slate-500 hover:bg-slate-50 hover:text-[#2E3538]"
                    }
                  `}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-[#478EDB]" : "text-slate-400"}`} />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Mobile tab bar ── */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t border-slate-100 px-2 py-2 flex gap-1 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium flex-shrink-0 transition-colors ${activeTab === tab.id ? "text-[#478EDB] bg-[#478EDB]/10" : "text-slate-400 hover:text-slate-600"}`}>
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 px-8 py-8 pb-24 lg:pb-8 overflow-auto" style={{ maxHeight: 'calc(100vh - 56px)' }}>
          {/* Page title row */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="font-serif text-2xl font-light text-[#2E3538]">
                {TABS.find(t => t.id === activeTab)?.label}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeSite
                  ? `${activeSite.hostname} · ${TABS.find(t => t.id === activeTab)?.desc}`
                  : `All sites · ${TABS.find(t => t.id === activeTab)?.desc}`
                }
              </p>
            </div>

            {/* Contextual CTA per tab */}
            {activeTab === "overview" && (
              <button onClick={() => { setActiveTab("websites"); setShowAddSite(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#478EDB] text-white text-sm font-medium hover:bg-[#3b7ac2] transition-colors shadow-lg shadow-[#478EDB]/20">
                <Plus className="w-4 h-4" /> Add website
              </button>
            )}
            {activeTab === "websites" && (
              <button onClick={() => setShowAddSite(!showAddSite)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#478EDB] text-white text-sm font-medium hover:bg-[#3b7ac2] transition-colors shadow-lg shadow-[#478EDB]/20">
                <Plus className="w-4 h-4" /> Add website
              </button>
            )}
          </div>

          {/* Tab content */}
          {activeTab === "overview"  && <OverviewTab websites={websites} activeSite={activeSite} onIntegrate={setIntegrationSite} onDelete={setDeleteTarget} userId={user?.id ?? ""} onSwitchTab={setActiveTab} />}
          {activeTab === "websites"  && <WebsitesTab websites={websites} showAddSite={showAddSite} setShowAddSite={setShowAddSite} newSiteUrl={newSiteUrl} setNewSiteUrl={setNewSiteUrl} onAddWebsite={handleAddWebsite} onIntegrate={setIntegrationSite} onDelete={setDeleteTarget} userId={user?.id ?? ""} />}
          {activeTab === "analytics" && <AnalyticsTab maxQueries={maxQueries} activeSite={activeSite} />}
          {activeTab === "social"    && <SocialTab activeSite={activeSite} />}
          {activeTab === "visitors"  && <VisitorInsightsTab activeSite={activeSite} />}
          {activeTab === "settings"  && <SettingsTab voiceEnabled={voiceEnabled} setVoiceEnabled={setVoiceEnabled} webDataOnly={webDataOnly} setWebDataOnly={setWebDataOnly} activeSite={activeSite} />}
        </main>
      </div>

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 relative">
            <button type="button" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); setDeleteError(null); }} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <div><h3 className="text-base font-medium text-[#2E3538]">Delete website</h3><p className="text-xs text-slate-400">{deleteTarget.hostname}</p></div>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              This permanently deletes <span className="font-medium">{deleteTarget.hostname}</span> and all indexed data.
              Type the site ID to confirm:
            </p>
            <div className="bg-[#F9F9FA] rounded-lg px-3 py-2 mb-3 text-xs font-mono text-slate-500 select-all">{deleteTarget.id}</div>
            <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="Type site ID to confirm"
              className="w-full px-4 py-3 rounded-xl bg-[#F9F9FA] border border-slate-200 focus:border-red-400 outline-none text-sm text-[#2E3538] font-mono" />
            {deleteError && <p className="text-xs text-red-600 mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {deleteError}</p>}
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); setDeleteError(null); }} className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="button" disabled={deleteConfirmText !== deleteTarget.id || isDeleting} onClick={handleDeleteSite}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
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
    <div onClick={e => e.stopPropagation()}>
      <button type="button" onClick={e => { e.stopPropagation(); setExpanded(!expanded); setResult(null); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#478EDB] bg-[#478EDB]/10 hover:bg-[#478EDB]/20 transition-colors">
        <RefreshCw className="w-3 h-3" /> Update Pages
      </button>
      {expanded && (
        <div className="mt-3 p-4 bg-[#F9F9FA] rounded-xl border border-slate-200">
          <form onSubmit={handleSubmit}>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">URLs to recrawl (one per line)</label>
            <textarea value={urlsText} onChange={e => setUrlsText(e.target.value)} onClick={e => e.stopPropagation()}
              placeholder={`https://${site.hostname}/about`} rows={3}
              className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-[#478EDB] outline-none text-sm font-mono resize-none" />
            <div className="flex items-center justify-between mt-3">
              <button type="submit" disabled={isUpdating || !urlsText.trim()} onClick={e => e.stopPropagation()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#478EDB] text-white text-xs font-medium hover:bg-[#3b7ac2] transition-colors disabled:opacity-50">
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

function OverviewTab({ websites, activeSite, onIntegrate, onDelete, userId, onSwitchTab }: {
  websites: Website[]; activeSite: Website | null;
  onIntegrate: (s: Website) => void; onDelete: (s: Website) => void;
  userId: string; onSwitchTab: (t: Tab) => void;
}) {
  const displaySites = activeSite ? [activeSite] : websites;
  const totalPages = displaySites.reduce((s, w) => s + (w.pagesIndexed || 0), 0) || mockStats.pagesIndexed;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: activeSite ? "Website" : "Active websites", value: activeSite ? "1" : (websites.length || mockStats.activeWebsites).toString(), icon: Globe, color: "#478EDB" },
          { label: "Pages indexed", value: totalPages.toLocaleString(), icon: FileText, color: "#27C93F" },
          { label: "Conversations", value: mockStats.totalConversations.toLocaleString(), icon: MessageSquare, color: "#8691CA" },
          { label: "Avg response", value: mockStats.avgResponseTime, icon: Clock, color: "#F59E0B" },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: stat.color + "15" }}>
                <Icon className="w-4 h-4" style={{ color: stat.color }} />
              </div>
              <p className="text-2xl font-light text-[#2E3538] mb-0.5">{stat.value}</p>
              <p className="text-xs text-slate-400">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Chart + Recent */}
      <div className="grid md:grid-cols-5 gap-5">
        <div className="md:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-medium text-[#2E3538]">This week</h3>
            <button onClick={() => onSwitchTab("analytics")} className="text-xs text-[#478EDB] hover:underline flex items-center gap-1">
              Full analytics <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-end gap-2" style={{ height: "6rem" }}>
            {mockQueryHistory.map(d => {
              const maxQ = Math.max(...mockQueryHistory.map(x => x.queries), 1);
              const barH = Math.max((d.queries / maxQ) * 100, 4);
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center justify-end" style={{ height: "100%" }}>
                  <div className="w-full rounded-md hover:opacity-75 transition-opacity" style={{ height: `${barH}%`, minHeight: "4px", background: "linear-gradient(to top, #478EDB, #8EBFF2)" }} />
                  <span className="text-[10px] text-slate-400 mt-1.5">{d.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="md:col-span-3 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[#2E3538]">Recent conversations</h3>
            <button onClick={() => onSwitchTab("visitors")} className="text-xs text-[#478EDB] hover:underline flex items-center gap-1">
              See all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {mockRecentConversations.slice(0, 3).map(conv => (
              <div key={conv.id} className="flex items-start gap-3 p-3 rounded-xl bg-[#F9F9FA]">
                <div className="w-7 h-7 rounded-lg bg-[#478EDB]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MessageSquare className="w-3.5 h-3.5 text-[#478EDB]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-[#2E3538]">{conv.visitor}</span>
                    <span className="text-[10px] text-slate-400">{conv.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{conv.query}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sites list */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-medium text-[#2E3538]">{activeSite ? "Site details" : "Your websites"}</h3>
          <button onClick={() => onSwitchTab("websites")} className="text-xs text-[#478EDB] hover:underline flex items-center gap-1">
            Manage <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        {displaySites.length === 0 ? (
          <div className="text-center py-12">
            <Globe className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400 mb-3">No websites yet</p>
            <button onClick={() => onSwitchTab("websites")} className="text-sm text-[#478EDB] font-medium hover:underline">Add your first website →</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {displaySites.map(site => (
              <div key={site.id} className="flex items-center gap-4 px-6 py-4 hover:bg-[#F9F9FA] transition-colors group">
                <div className="w-9 h-9 rounded-xl bg-[#478EDB]/10 flex items-center justify-center text-[#478EDB] text-sm font-bold uppercase flex-shrink-0">
                  {site.hostname.charAt(0)}
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onIntegrate(site)}>
                  <p className="text-sm font-medium text-[#2E3538] truncate">{site.hostname}</p>
                  <p className="text-xs text-slate-400">{site.pagesIndexed} pages · {formatLocalDate(site.lastCrawled)}</p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <UpdatePagesPanel site={site} />
                  <SitemapSyncPanel siteId={site.id} userId={userId} apiBase={API_BASE} hostname={site.hostname} />
                  <button type="button" onClick={() => onDelete(site)} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <button onClick={() => onIntegrate(site)} className="flex-shrink-0 text-xs text-slate-400 hover:text-[#478EDB] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#478EDB]/8 font-medium">
                  Embed →
                </button>
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
        <div className="bg-white rounded-2xl p-6 border border-[#478EDB]/20 shadow-sm">
          <h3 className="text-sm font-medium text-[#2E3538] mb-4">Add a new website</h3>
          <form onSubmit={onAddWebsite} className="flex gap-3">
            <input type="url" placeholder="https://yourwebsite.com" value={newSiteUrl} onChange={e => setNewSiteUrl(e.target.value)} required
              className="flex-1 px-4 py-3 rounded-xl bg-[#F9F9FA] border border-slate-200 focus:border-[#478EDB] focus:bg-white outline-none transition-all text-sm placeholder:text-slate-400" />
            <button type="submit" className="px-6 py-3 rounded-xl bg-[#478EDB] text-white text-sm font-medium hover:bg-[#3b7ac2] transition-colors flex items-center gap-2 flex-shrink-0">
              Crawl & index <ArrowRight className="w-4 h-4" />
            </button>
          </form>
          <p className="text-xs text-slate-400 mt-2">We'll crawl all pages, extract content, and build a searchable knowledge base.</p>
        </div>
      )}

      {websites.length === 0 && !showAddSite && (
        <div className="bg-white rounded-2xl p-16 border border-slate-100 text-center">
          <Globe className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <h3 className="text-base font-medium text-[#2E3538] mb-2">No websites yet</h3>
          <p className="text-slate-400 text-sm mb-6">Add your first website to get started.</p>
          <button onClick={() => setShowAddSite(true)} className="px-6 py-3 rounded-xl bg-[#478EDB] text-white text-sm font-medium hover:bg-[#3b7ac2] transition-colors">
            Add website
          </button>
        </div>
      )}

      <div className="space-y-3">
        {websites.map(site => (
          <div key={site.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden group">
            {/* Site header row */}
            <div className="flex items-center gap-4 px-6 py-5 cursor-pointer" onClick={() => onIntegrate(site)}>
              <div className="w-10 h-10 rounded-xl bg-[#478EDB]/10 flex items-center justify-center text-[#478EDB] text-sm font-bold uppercase flex-shrink-0">
                {site.hostname.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm font-semibold text-[#2E3538] truncate">{site.hostname}</h3>
                  <span className="text-[10px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex-shrink-0">Active</span>
                </div>
                <p className="text-xs text-slate-400 truncate">{site.url}</p>
              </div>
              <div className="flex items-center gap-5 text-xs text-slate-400 flex-shrink-0">
                <span className="hidden md:flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> {site.pagesIndexed} pages</span>
                <span className="hidden md:flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {formatLocalDate(site.lastCrawled)}</span>
                <button type="button" onClick={e => { e.stopPropagation(); onDelete(site); }} className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Actions strip */}
            <div className="flex items-center gap-2 px-6 py-3 bg-[#F9F9FA] border-t border-slate-100">
              <button onClick={() => onIntegrate(site)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#478EDB]/10 text-[#478EDB] border border-transparent hover:bg-[#478EDB]/20 transition-colors">
                Embed widget
              </button>
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

function AnalyticsTab({ maxQueries, activeSite }: { maxQueries: number; activeSite: Website | null }) {
  const [faqView, setFaqView] = useState<"analytics" | "faqs" | "training">("analytics");

  return (
    <div className="space-y-6">
      {/* Sub-nav */}
      <div className="flex gap-1 bg-[#F9F9FA] p-1 rounded-xl border border-slate-100 w-fit">
        {(["analytics", "faqs", "training"] as const).map(step => (
          <button key={step} onClick={() => setFaqView(step)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${faqView === step ? "bg-white text-[#2E3538] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {step === "analytics" && <><BarChart3 className="w-3.5 h-3.5" /> Analytics</>}
            {step === "faqs"      && <><Brain className="w-3.5 h-3.5" /> FAQs</>}
            {step === "training"  && <><Zap className="w-3.5 h-3.5" /> Training</>}
          </button>
        ))}
      </div>

      {faqView === "analytics" && (
        <>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-medium text-[#2E3538]">Conversation volume (7 days)</h3>
                <span className="text-xs text-slate-400">{mockStats.avgResponseTime} avg</span>
              </div>
              <div className="flex items-end gap-3" style={{ height: "9rem" }}>
                {mockQueryHistory.map(d => {
                  const barH = Math.max((d.queries / maxQueries) * 100, 4);
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center justify-end" style={{ height: "100%" }}>
                      <span className="text-[10px] font-medium text-[#2E3538] mb-1.5">{d.queries}</span>
                      <div className="w-full rounded-lg hover:opacity-75 transition-opacity relative group/bar cursor-default"
                        style={{ height: `${barH}%`, minHeight: "4px", background: "linear-gradient(to top, #478EDB, #8EBFF2)" }}>
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#2E3538] text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                          {d.queries}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-2">{d.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <h3 className="text-sm font-medium text-[#2E3538] mb-4">Top questions</h3>
              <div className="space-y-1">
                {mockTopQueries.map((q, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F9F9FA] transition-colors">
                    <span className="text-xs font-mono text-slate-300 w-4 flex-shrink-0">#{i + 1}</span>
                    <p className="text-sm text-[#2E3538] flex-1 truncate">{q.question}</p>
                    <span className="text-[11px] text-slate-400 flex-shrink-0">{q.count}×</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${q.answered ? "text-green-600 bg-green-50" : "text-amber-600 bg-amber-50"}`}>{q.answered ? "OK" : "Review"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: "Content summaries", value: mockStats.contentSummaries, icon: Search, color: "#478EDB" },
              { label: "Page redirects", value: mockStats.redirectsTriggered, icon: ArrowUpRight, color: "#8691CA" },
              { label: "Active websites", value: mockStats.activeWebsites, icon: TrendingUp, color: "#27C93F" },
            ].map(stat => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: stat.color + "15" }}>
                    <Icon className="w-5 h-5" style={{ color: stat.color }} />
                  </div>
                  <div>
                    <p className="text-2xl font-light text-[#2E3538]">{stat.value}</p>
                    <p className="text-xs text-slate-400">{stat.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {faqView === "faqs" && (
        <div className="space-y-3">
          {mockFaqs.map((faq, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-[#478EDB]/10 flex items-center justify-center flex-shrink-0 mt-0.5"><MessageSquare className="w-4 h-4 text-[#478EDB]" /></div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-[#2E3538] mb-1.5">{faq.question}</h4>
                <p className="text-sm text-slate-500 leading-relaxed mb-2">{faq.answer}</p>
                <p className="text-[11px] text-slate-400">From {faq.generatedFrom} conversations · <span className="text-green-600">Approved</span></p>
              </div>
            </div>
          ))}
        </div>
      )}

      {faqView === "training" && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#478EDB]/10 flex items-center justify-center mx-auto mb-4"><Zap className="w-7 h-7 text-[#478EDB]" /></div>
            <h3 className="text-base font-semibold text-[#2E3538] mb-2">Model Training</h3>
            <p className="text-sm text-slate-400 max-w-sm mx-auto mb-6">Continuously improves from your analytics data and approved FAQs.</p>
            <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
              {[{ l: "Data", s: "done" }, { l: "FAQs", s: "done" }, { l: "Fine-tuning", s: "active" }, { l: "Deploy", s: "pending" }].map((step, i) => (
                <div key={step.l} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${step.s === "done" ? "bg-green-50 text-green-600" : step.s === "active" ? "bg-[#478EDB]/10 text-[#478EDB]" : "bg-slate-50 text-slate-400"}`}>
                    {step.s === "done" && <CheckCircle2 className="w-3 h-3" />}
                    {step.s === "active" && <div className="w-3 h-3 border-2 border-[#478EDB]/30 border-t-[#478EDB] rounded-full animate-spin" />}
                    {step.l}
                  </div>
                  {i < 3 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
                </div>
              ))}
            </div>
            <div className="bg-[#F9F9FA] rounded-xl p-4 max-w-xs mx-auto">
              <div className="flex justify-between text-xs text-slate-500 mb-2"><span>Progress</span><span>67%</span></div>
              <div className="w-full bg-slate-200 rounded-full h-1.5"><div className="h-full rounded-full bg-gradient-to-r from-[#478EDB] to-[#8EBFF2]" style={{ width: "67%" }} /></div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[{ label: "Training samples", value: "1,284" }, { label: "Approved FAQs", value: "4" }, { label: "Accuracy", value: "94.7%" }].map(s => (
              <div key={s.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm text-center">
                <p className="text-2xl font-light text-[#2E3538]">{s.value}</p>
                <p className="text-xs text-slate-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── SOCIAL TAB ─────────────────────────────────────────────────────────── */

function SocialTab({ activeSite }: { activeSite: Website | null }) {
  const [accounts, setAccounts] = useState(mockSocialMedia);
  const toggle = (p: string) => setAccounts(prev => prev.map(a => a.platform === p ? { ...a, connected: !a.connected } : a));

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {accounts.map(account => (
          <div key={account.platform} className="bg-white rounded-2xl px-6 py-4 border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: account.color + "15" }}>
              <Share2 className="w-4 h-4" style={{ color: account.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#2E3538]">{account.platform}</span>
                {account.connected && <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Connected</span>}
              </div>
              <p className="text-xs text-slate-400">{account.handle} · {account.followers || account.subscribers}</p>
            </div>
            <button onClick={() => toggle(account.platform)} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${account.connected ? "border border-slate-200 text-slate-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50" : "bg-[#478EDB] text-white hover:bg-[#3b7ac2]"}`}>
              {account.connected ? "Disconnect" : "Connect"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── VISITORS TAB ───────────────────────────────────────────────────────── */

function VisitorInsightsTab({ activeSite }: { activeSite: Website | null }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total conversations", value: mockStats.totalConversations.toString(), color: "#478EDB" },
          { label: "This week", value: mockStats.conversationsThisWeek.toString(), color: "#8691CA" },
          { label: "Summaries", value: mockStats.contentSummaries.toString(), color: "#27C93F" },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm text-center">
            <p className="text-2xl font-light text-[#2E3538]">{stat.value}</p>
            <p className="text-xs mt-1" style={{ color: stat.color }}>{stat.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-medium text-[#2E3538]">Recent interactions</h3>
        </div>
        <div className="divide-y divide-slate-50">
          {mockVisitorInteractions.map(item => (
            <div key={item.id} className="flex items-center gap-4 px-6 py-4 hover:bg-[#F9F9FA] transition-colors">
              <div className="w-8 h-8 rounded-full bg-[#478EDB]/10 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-3.5 h-3.5 text-[#478EDB]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-[#2E3538]">{item.visitor}</span>
                  <span className="text-[10px] text-slate-400">{item.timestamp}</span>
                </div>
                <p className="text-xs text-slate-400 truncate">"{item.query}"</p>
              </div>
              <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-500 flex-shrink-0">{item.source}</span>
            </div>
          ))}
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
      style={{ backgroundColor: enabled ? color : "#e2e8f0", flexShrink: 0 }}
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
      {/* Voice toggle */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${voiceEnabled ? "bg-[#478EDB]/10" : "bg-slate-100"}`}>
              {voiceEnabled ? <Volume2 className="w-5 h-5 text-[#478EDB]" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-[#2E3538]">Voice input & responses</h3>
              <p className="text-xs text-slate-400 mt-0.5">Visitors can speak questions and hear answers read aloud.</p>
            </div>
          </div>
          <Toggle enabled={voiceEnabled} onChange={setVoiceEnabled} color="#478EDB" />
        </div>
      </div>

      {/* Website-only toggle */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${webDataOnly ? "bg-green-100" : "bg-slate-100"}`}>
              <Globe className={`w-5 h-5 ${webDataOnly ? "text-green-600" : "text-slate-400"}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-[#2E3538]">Website-only answers</h3>
              <p className="text-xs text-slate-400 mt-0.5">Bot only uses your indexed pages — never external sources.</p>
            </div>
          </div>
          <Toggle enabled={webDataOnly} onChange={setWebDataOnly} color="#22c55e" />
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl p-6 border border-red-100 shadow-sm">
        <h3 className="text-sm font-semibold text-red-600 mb-1">Danger zone</h3>
        <p className="text-xs text-slate-400 mb-4">
          {activeSite ? `Delete ${activeSite.hostname} and all its indexed data permanently.` : "Delete all data across all websites."}
        </p>
        <button className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors">
          {activeSite ? `Delete ${activeSite.hostname}` : "Delete all data"}
        </button>
      </div>
    </div>
  );
}