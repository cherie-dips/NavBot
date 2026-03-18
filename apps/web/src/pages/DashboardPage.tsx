import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Globe,
  Plus,
  BarChart3,
  MessageSquare,
  Share2,
  Mic,
  Users,
  Brain,
  ArrowRight,
  AlertCircle,
  TrendingUp,
  Clock,
  ChevronRight,
  Search,
  Volume2,
  VolumeX,
  FileText,
  Zap,
  ArrowUpRight,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Trash2,
  X,
} from "lucide-react";
import { authClient } from "../lib/auth-client";
import { ScrapingPage } from "./ScrapingPage";
import { IntegrationPanel } from "../components/IntegrationPanel";
import {
  mockStats, mockQueryHistory, mockTopQueries,
  mockFaqs, mockSocialMedia, mockVisitorInteractions, mockRecentConversations
} from "../lib/mock-data";
import { WidgetTheme } from "../components/ColorThemePicker";

interface DashboardPageProps {
  onViewChange: (view: string) => void;
  onSignOut?: () => void;
}

type Tab = "overview" | "websites" | "analytics" | "social" | "visitors" | "settings";

interface Website {
  id: string;
  url: string;
  hostname: string;
  status: string;
  pagesIndexed: number;
  lastCrawled: string;
  addedAt: string;
  widgetTheme: WidgetTheme | null;
}

interface IntegrationInfo {
  siteId: string;
  url: string;
  consoleCode: string;
  scriptTag: string;
}

const API_BASE =
  (import.meta as any).env?.VITE_API_URL ?? "http://localhost:3001";
const WIDGET_SCRIPT_URL =
  (import.meta as any).env?.VITE_WIDGET_SCRIPT_URL ??
  (typeof window !== "undefined"
    ? `${window.location.origin}/chat-widget.iife.js`
    : "/chat-widget.iife.js");

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "websites", label: "Websites", icon: Globe },
  { id: "analytics", label: "Analytics & FAQs", icon: BarChart3 },
  { id: "social", label: "Social Media", icon: Share2 },
  { id: "visitors", label: "Visitor Insights", icon: Users },
  { id: "settings", label: "Settings", icon: Mic },
];

export const DashboardPage = ({ onViewChange: _onViewChange }: DashboardPageProps) => {
  const [user, setUser] = useState<{ id?: string; name?: string; email?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
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

  const buildIntegration = (site: Website): IntegrationInfo => {
    const siteId = site.id;
    const consoleCode = `(function(){if(document.getElementById("chat-widget-root")){console.log("NavBot already loaded.");return;}window.NAVBOT_CONFIG={apiBase:"${API_BASE}",siteId:"${siteId}"};var s=document.createElement("script");s.src="${WIDGET_SCRIPT_URL}";s.crossOrigin="anonymous";document.body.appendChild(s);})();`;
    const scriptTag = `<script>
  window.NAVBOT_CONFIG = { apiBase: "${API_BASE}", siteId: "${siteId}" };
</script>
<script src="${WIDGET_SCRIPT_URL}" crossorigin="anonymous"></script>`;
    return { siteId, url: site.url, consoleCode, scriptTag };
  };

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
        // Load previously saved websites for this user
        fetch(`${API_BASE}/api/sites?userId=${encodeURIComponent(data.user.id)}`)
          .then((r) => r.json())
          .then((sites: any[]) => {
            setWebsites(
              sites.map((s: any) => ({
                id: s.id,
                url: s.url,
                hostname: s.hostname,
                status: s.status,
                pagesIndexed: s.pagesIndexed,
                lastCrawled: s.lastCrawled,
                addedAt: s.addedAt,
                widgetTheme: s.widgetTheme ?? null
              }))
            );
          })
          .catch(() => {});
      }
    });
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
      setWebsites((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteConfirmText("");
    } catch (err: any) {
      setDeleteError(err?.message || "Something went wrong while deleting.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isScraping) {
    return (
      <ScrapingPage
        websiteUrl={scrapingUrl}
        userId={user?.id}
        apiBase={API_BASE}
        onComplete={(result) => {
          const hostname = (() => {
            try { return new URL(scrapingUrl).hostname; } catch { return scrapingUrl; }
          })();
          setWebsites((prev) => [
            ...prev,
            {
              id: result.siteId,
              url: scrapingUrl,
              hostname,
              status: "active",
              pagesIndexed: result.stored,
              lastCrawled: "Just now",
              addedAt: new Date().toISOString().split("T")[0],
              widgetTheme: result.widgetTheme ?? null,
            },
          ]);
          setIsScraping(false);
          setNewSiteUrl("");
          setActiveTab("websites");
        }}
        onError={(msg) => {
          setIndexError(msg);
          setIsScraping(false);
          setNewSiteUrl("");
          setActiveTab("websites");
        }}
      />
    );
  }
  const maxQueries = Math.max(...mockQueryHistory.map(d => d.queries));

  if (integrationSite) {
    const info = buildIntegration(integrationSite);
    return (
      <div className="min-h-screen bg-[#F9F9FA] pt-28">
        <div className="max-w-[1400px] mx-auto px-6 pb-4">
          <button
            type="button"
            onClick={() => setIntegrationSite(null)}
            className="text-sm text-slate-500 hover:text-[#478EDB] inline-flex items-center gap-1 mb-4"
          >
            <span className="text-lg leading-none">←</span> Back to dashboard
          </button>
        </div>
        <div className="max-w-[1400px] mx-auto px-6 pb-12">
          <IntegrationPanel
            info={info}
            userId={user?.id ?? ""}
            apiBase={API_BASE}
            initialTheme={integrationSite?.widgetTheme ?? null}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F9FA] pt-28">
      {indexError && (
        <div className="max-w-[1400px] mx-auto px-6 pb-4">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
            {indexError}
          </div>
        </div>
      )}
      <div className="max-w-[1400px] mx-auto flex gap-6 px-6 pb-12">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 pt-4 hidden lg:block">
          <nav className="space-y-1 sticky top-24">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-[#478EDB]/10 text-[#478EDB]"
                      : "text-slate-500 hover:bg-slate-100 hover:text-[#2E3538]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Mobile tab bar */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-100 px-2 py-2 flex gap-1 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium flex-shrink-0 ${
                  activeTab === tab.id ? "text-[#478EDB] bg-[#478EDB]/10" : "text-slate-400"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Main Content */}
        <main className="flex-1 min-w-0 pt-4 pb-20 lg:pb-0">
          {activeTab === "overview" && (
            <OverviewTab
              websites={websites}
              onAddSite={() => { setActiveTab("websites"); setShowAddSite(true); }}
              onIntegrate={setIntegrationSite}
              onDelete={setDeleteTarget}
            />
          )}
          {activeTab === "websites" && (
            <WebsitesTab
              websites={websites}
              showAddSite={showAddSite}
              setShowAddSite={setShowAddSite}
              newSiteUrl={newSiteUrl}
              setNewSiteUrl={setNewSiteUrl}
              onAddWebsite={handleAddWebsite}
              onIntegrate={setIntegrationSite}
              onDelete={setDeleteTarget}
            />
          )}
          {activeTab === "analytics" && <AnalyticsTab maxQueries={maxQueries} />}
          {activeTab === "social" && <SocialTab />}
          {activeTab === "visitors" && <VisitorInsightsTab />}
          {activeTab === "settings" && <SettingsTab voiceEnabled={voiceEnabled} setVoiceEnabled={setVoiceEnabled} webDataOnly={webDataOnly} setWebDataOnly={setWebDataOnly} />}
        </main>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 relative animate-fade-in-up">
            <button
              type="button"
              onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); setDeleteError(null); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-medium text-[#2E3538]">Delete Website</h3>
                <p className="text-xs text-slate-400">{deleteTarget.hostname}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-1">
              This will permanently delete <span className="font-medium text-[#2E3538]">{deleteTarget.hostname}</span> and all its indexed data from the database and vector store.
            </p>
            <p className="text-sm text-slate-600 mb-4">
              To confirm, type the site ID below:
            </p>
            <div className="bg-[#F9F9FA] rounded-lg px-3 py-2 mb-3 text-xs font-mono text-slate-500 select-all">
              {deleteTarget.id}
            </div>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type site ID to confirm"
              className="w-full px-4 py-3 rounded-xl bg-[#F9F9FA] border border-slate-200 focus:border-red-400 outline-none transition-all text-sm text-[#2E3538] placeholder:text-slate-400 font-mono"
            />
            {deleteError && (
              <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-3 mt-5">
              <button
                type="button"
                onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); setDeleteError(null); }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmText !== deleteTarget.id || isDeleting}
                onClick={handleDeleteSite}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isDeleting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Delete Website</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── UPDATE PAGES PANEL (inline per-site) ──────────────────────────── */

function UpdatePagesPanel({ site }: { site: Website }) {
  const [expanded, setExpanded] = useState(false);
  const [urlsText, setUrlsText] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const urls = urlsText
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) return;

    setIsUpdating(true);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/sites/${encodeURIComponent(site.id)}/pages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Update failed");

      setResult({
        success: true,
        message: `Updated ${data.stored} chunks from ${data.pagesFound} of ${data.requestedUrls} pages`,
      });
      setUrlsText("");
    } catch (err: any) {
      setResult({
        success: false,
        message: err?.message || "Something went wrong",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setExpanded(!expanded);
          setResult(null);
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#478EDB] bg-[#478EDB]/10 hover:bg-[#478EDB]/20 transition-colors"
      >
        <RefreshCw className="w-3 h-3" />
        Update Pages
      </button>

      {expanded && (
        <div className="mt-3 p-4 bg-[#F9F9FA] rounded-xl border border-slate-200">
          <form onSubmit={handleSubmit}>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Enter page URLs to recrawl (one per line)
            </label>
            <textarea
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder={`https://${site.hostname}/about\nhttps://${site.hostname}/admissions`}
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-[#478EDB] outline-none text-sm text-[#2E3538] placeholder:text-slate-400 font-mono resize-none"
            />
            <div className="flex items-center justify-between mt-3">
              <button
                type="submit"
                disabled={isUpdating || !urlsText.trim()}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2E3538] text-white text-xs font-medium hover:bg-[#478EDB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Updating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3" /> Recrawl & Update
                  </>
                )}
              </button>
              {result && (
                <span
                  className={`text-xs font-medium ${
                    result.success ? "text-green-600" : "text-red-600"
                  }`}
                >
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

/* ─── OVERVIEW TAB ───────────────────────────────────────────────────── */

function OverviewTab({ websites, onAddSite, onIntegrate, onDelete }: { websites: Website[]; onAddSite: () => void; onIntegrate: (site: Website) => void; onDelete: (site: Website) => void }) {
  const totalPages = websites.length > 0
    ? websites.reduce((sum, w) => sum + (w.pagesIndexed || 0), 0)
    : mockStats.pagesIndexed;
  const siteCount = websites.length > 0 ? websites.length : mockStats.activeWebsites;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-light text-[#2E3538]">Dashboard</h1>
        <button onClick={onAddSite} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#478EDB] text-white text-sm font-medium hover:bg-[#3b7ac2] transition-colors shadow-lg shadow-[#478EDB]/20">
          <Plus className="w-4 h-4" /> Add Website
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Websites", value: siteCount.toString(), icon: Globe, color: "#478EDB" },
          { label: "Pages Indexed", value: totalPages.toLocaleString(), icon: FileText, color: "#27C93F" },
          { label: "Conversations", value: mockStats.totalConversations.toLocaleString(), icon: MessageSquare, color: "#8691CA" },
          { label: "Avg Response", value: mockStats.avgResponseTime, icon: Clock, color: "#F59E0B" },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: stat.color + "15" }}>
                  <Icon className="w-4 h-4" style={{ color: stat.color }} />
                </div>
              </div>
              <p className="text-2xl font-light text-[#2E3538] mb-0.5">{stat.value}</p>
              <p className="text-xs text-slate-400">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Query Chart + Recent Conversations */}
      <div className="grid md:grid-cols-5 gap-6">
        {/* Mini bar chart */}
        <div className="md:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-medium text-[#2E3538]">Conversations This Week</h3>
            <span className="text-lg font-light text-[#478EDB]">{mockStats.conversationsThisWeek}</span>
          </div>
          {mockStats.conversationsThisWeek === 0 ? (
            <div className="flex items-center justify-center h-28 text-sm text-slate-400">
              <p>Data will appear once visitors use the chatbot</p>
            </div>
          ) : (
            <div className="flex items-end gap-2" style={{ height: "7rem" }}>
              {mockQueryHistory.map(d => {
                const maxQ = Math.max(...mockQueryHistory.map(x => x.queries), 1);
                const barH = Math.max((d.queries / maxQ) * 100, 4);
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center justify-end" style={{ height: "100%" }}>
                    <div className="w-full rounded-lg transition-all duration-500 hover:opacity-80" style={{ height: `${barH}%`, minHeight: "4px", background: `linear-gradient(to top, #478EDB, #8EBFF2)` }} />
                    <span className="text-[10px] text-slate-400 mt-1.5">{d.day}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent conversations */}
        <div className="md:col-span-3 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[#2E3538]">Recent Conversations</h3>
          </div>
          {mockRecentConversations.length === 0 ? (
            <div className="text-center py-10">
              <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No conversations yet</p>
              <p className="text-xs text-slate-400 mt-1">Conversations will appear here as visitors use your chatbot</p>
            </div>
          ) : (
            <div className="space-y-3">
              {mockRecentConversations.slice(0, 3).map(conv => (
                <div key={conv.id} className="flex items-start gap-3 p-3 rounded-xl bg-[#F9F9FA] border border-slate-50">
                  <div className="w-8 h-8 rounded-lg bg-[#478EDB]/10 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-3.5 h-3.5 text-[#478EDB]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-[#2E3538]">{conv.visitor}</span>
                      <span className="text-[10px] text-slate-400">{conv.timestamp}</span>
                      {conv.redirected && <span className="text-[10px] text-[#8691CA] bg-[#8691CA]/10 px-1.5 py-0.5 rounded">redirected</span>}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{conv.query}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active websites */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <h3 className="text-sm font-medium text-[#2E3538] mb-4">Active Websites</h3>
        {websites.length === 0 ? (
          <div className="text-center py-12">
            <Globe className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400 text-sm mb-4">No websites added yet</p>
            <button onClick={onAddSite} className="text-[#478EDB] text-sm font-medium hover:underline">Add your first website</button>
          </div>
        ) : (
          <div className="space-y-3">
            {websites.map(site => (
              <div
                key={site.id}
                className="relative p-4 rounded-xl bg-[#F9F9FA] border border-slate-50"
              >
                <div
                  className="flex items-center gap-4 cursor-pointer"
                  onClick={() => onIntegrate(site)}
                >
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#2E3538]">{site.hostname}</p>
                    <p className="text-xs text-slate-400">{site.pagesIndexed} pages indexed · Last crawled {site.lastCrawled}</p>
                  </div>
                  <span className="text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full flex-shrink-0">Active</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(site); }}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                    title="Delete website"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3">
                  <UpdatePagesPanel site={site} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── WEBSITES TAB ───────────────────────────────────────────────────── */

function WebsitesTab({ websites, showAddSite, setShowAddSite, newSiteUrl, setNewSiteUrl, onAddWebsite, onIntegrate, onDelete }: {
  websites: Website[];
  showAddSite: boolean;
  setShowAddSite: (v: boolean) => void;
  newSiteUrl: string;
  setNewSiteUrl: (v: string) => void;
  onAddWebsite: (e: React.FormEvent) => void;
  onIntegrate: (site: Website) => void;
  onDelete: (site: Website) => void;
}) {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-light text-[#2E3538]">Websites</h1>
        <button onClick={() => setShowAddSite(!showAddSite)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#478EDB] text-white text-sm font-medium hover:bg-[#3b7ac2] transition-colors shadow-lg shadow-[#478EDB]/20">
          <Plus className="w-4 h-4" /> Add Website
        </button>
      </div>

      {/* Add website form */}
      {showAddSite && (
        <div className="bg-white rounded-2xl p-6 border border-[#478EDB]/20 shadow-lg shadow-[#478EDB]/5">
          <h3 className="text-sm font-medium text-[#2E3538] mb-4">Add a new website</h3>
          <form onSubmit={onAddWebsite} className="flex gap-3">
            <input
              type="url"
              placeholder="https://yourwebsite.com"
              value={newSiteUrl}
              onChange={e => setNewSiteUrl(e.target.value)}
              required
              className="flex-1 px-4 py-3 rounded-xl bg-[#F9F9FA] border border-slate-200 focus:border-[#478EDB] focus:bg-white outline-none transition-all text-sm text-[#2E3538] placeholder:text-slate-400"
            />
            <button type="submit" className="px-6 py-3 rounded-xl bg-[#2E3538] text-white text-sm font-medium hover:bg-[#478EDB] transition-colors flex items-center gap-2">
              Crawl & Index <ArrowRight className="w-4 h-4" />
            </button>
          </form>
          <p className="text-xs text-slate-400 mt-2">We'll crawl your website, extract content, and build a knowledge base for your chatbot.</p>
        </div>
      )}

      {/* Website list */}
      <div className="space-y-3">
        {websites.map(site => (
          <div
            key={site.id}
            className="relative bg-white rounded-2xl p-6 border border-slate-100 shadow-sm"
          >
            <div
              className="flex items-start gap-4 flex-wrap cursor-pointer"
              onClick={() => onIntegrate(site)}
            >
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                <Globe className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-medium text-[#2E3538] truncate">{site.hostname}</h3>
                  <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex-shrink-0">Active</span>
                </div>
                <p className="text-xs text-slate-400 mb-3 truncate">{site.url}</p>
                <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {site.pagesIndexed} pages indexed</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Last crawled {site.lastCrawled}</span>
                  <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Added {site.addedAt}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(site); }}
                className="p-2.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0 self-start"
                title="Delete website"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="mt-4">
              <UpdatePagesPanel site={site} />
            </div>
          </div>
        ))}
      </div>

      {websites.length === 0 && !showAddSite && (
        <div className="bg-white rounded-2xl p-16 border border-slate-100 text-center">
          <Globe className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-[#2E3538] mb-2">No websites yet</h3>
          <p className="text-slate-400 text-sm mb-6">Add your first website to start building your NavBot knowledge base.</p>
          <button onClick={() => setShowAddSite(true)} className="px-6 py-3 rounded-xl bg-[#478EDB] text-white text-sm font-medium hover:bg-[#3b7ac2] transition-colors">
            Add Website
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── ANALYTICS & FAQs TAB ───────────────────────────────────────────── */

function AnalyticsTab({ maxQueries }: { maxQueries: number }) {
  const [faqView, setFaqView] = useState<"analytics" | "faqs" | "training">("analytics");

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-light text-[#2E3538]">Analytics & FAQs</h1>
      </div>

      {/* Pipeline: Analytics → FAQs → Model Training */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2">
          {(["analytics", "faqs", "training"] as const).map((step, i) => (
            <div key={step} className="flex items-center gap-2 flex-1">
              <button
                onClick={() => setFaqView(step)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  faqView === step ? "bg-[#478EDB] text-white shadow-lg shadow-[#478EDB]/20" : "bg-[#F9F9FA] text-slate-500 hover:bg-slate-100"
                }`}
              >
                {step === "analytics" && <><BarChart3 className="w-3.5 h-3.5" /> Data Analytics</>}
                {step === "faqs" && <><Brain className="w-3.5 h-3.5" /> Generated FAQs</>}
                {step === "training" && <><Zap className="w-3.5 h-3.5" /> Model Training</>}
              </button>
              {i < 2 && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {faqView === "analytics" && (
        <>
          {/* Conversation Volume (left) + Most Asked Questions (right) */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Query volume chart */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-medium text-[#2E3538]">Conversation Volume (7 days)</h3>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Clock className="w-3 h-3" /> Avg: {mockStats.avgResponseTime}
                </div>
              </div>
              {maxQueries === 0 ? (
                <div className="flex items-center justify-center h-40 text-sm text-slate-400">
                  <div className="text-center">
                    <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p>Conversation data will appear here once visitors use your chatbot</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-end gap-3" style={{ height: "10rem" }}>
                  {mockQueryHistory.map(d => {
                    const barH = Math.max((d.queries / maxQueries) * 100, 4);
                    return (
                      <div key={d.day} className="flex-1 flex flex-col items-center justify-end" style={{ height: "100%" }}>
                        <span className="text-xs font-medium text-[#2E3538] mb-2">{d.queries}</span>
                        <div className="w-full rounded-xl transition-all duration-500 hover:opacity-80 relative group" style={{ height: `${barH}%`, minHeight: "4px", background: `linear-gradient(to top, #478EDB, #8EBFF2)` }}>
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#2E3538] text-white text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            {d.queries} conversations
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 mt-2">{d.day}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top queries table */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <h3 className="text-sm font-medium text-[#2E3538] mb-4">Most Asked Questions</h3>
              {mockTopQueries.length === 0 ? (
                <div className="text-center py-10">
                  <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Top questions will appear here as visitors interact with the chatbot</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mockTopQueries.map((q, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#F9F9FA] transition-colors">
                      <span className="text-xs font-mono text-slate-400 w-5">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#2E3538] truncate">{q.question}</p>
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap">{q.count}x</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${q.answered ? "text-green-600 bg-green-50" : "text-amber-600 bg-amber-50"}`}>
                        {q.answered ? "Answered" : "Review"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Content stats */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-[#478EDB]/10 flex items-center justify-center">
                  <Search className="w-4 h-4 text-[#478EDB]" />
                </div>
                <span className="text-xs text-slate-400">Content Summaries</span>
              </div>
              <p className="text-2xl font-light text-[#2E3538]">{mockStats.contentSummaries}</p>
              <p className="text-xs text-slate-400 mt-1">Auto-generated from indexed pages</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-[#8691CA]/10 flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4 text-[#8691CA]" />
                </div>
                <span className="text-xs text-slate-400">Page Redirects</span>
              </div>
              <p className="text-2xl font-light text-[#2E3538]">{mockStats.redirectsTriggered}</p>
              <p className="text-xs text-slate-400 mt-1">Visitors guided to relevant pages</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-xs text-slate-400">Active Websites</span>
              </div>
              <p className="text-2xl font-light text-[#2E3538]">{mockStats.activeWebsites}</p>
              <p className="text-xs text-slate-400 mt-1">Websites with chatbot deployed</p>
            </div>
          </div>
        </>
      )}

      {faqView === "faqs" && (
        <div className="space-y-4">
          <div className="bg-[#478EDB]/5 rounded-2xl p-4 border border-[#478EDB]/10">
            <div className="flex items-center gap-2 text-sm text-[#478EDB]">
              <Brain className="w-4 h-4" />
              <span className="font-medium">Auto-generated FAQs from conversation analytics</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">These FAQs are generated from the most common visitor questions. They're used to improve response accuracy and train the model.</p>
          </div>

          {mockFaqs.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 border border-slate-100 shadow-sm text-center">
              <Brain className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-medium text-[#2E3538] mb-1">No FAQs generated yet</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">Once your chatbot handles enough conversations, NavBot will automatically identify frequently asked questions and generate FAQ entries here.</p>
            </div>
          ) : (
            mockFaqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#478EDB]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageSquare className="w-4 h-4 text-[#478EDB]" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-[#2E3538] mb-2">{faq.question}</h4>
                    <p className="text-sm text-slate-500 leading-relaxed mb-3">{faq.answer}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>Generated from {faq.generatedFrom} conversations</span>
                      <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3 h-3" /> Approved</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {faqView === "training" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#478EDB]/10 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-[#478EDB]" />
            </div>
            <h3 className="text-lg font-medium text-[#2E3538] mb-2">Model Training Pipeline</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">Your chatbot continuously improves from analytics data and approved FAQs. Training runs automatically when new data meets the threshold.</p>

            {/* Training pipeline steps */}
            <div className="flex items-center justify-center gap-3 mb-8">
              {[
                { label: "Data Collection", status: "done" },
                { label: "FAQ Generation", status: "done" },
                { label: "Fine-tuning", status: "active" },
                { label: "Deployment", status: "pending" },
              ].map((step, i) => (
                <div key={step.label} className="flex items-center gap-3">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                    step.status === "done" ? "bg-green-50 text-green-600" :
                    step.status === "active" ? "bg-[#478EDB]/10 text-[#478EDB]" :
                    "bg-slate-50 text-slate-400"
                  }`}>
                    {step.status === "done" && <CheckCircle2 className="w-3 h-3" />}
                    {step.status === "active" && <div className="w-3 h-3 border-2 border-[#478EDB]/30 border-t-[#478EDB] rounded-full animate-spin" />}
                    {step.status === "pending" && <AlertCircle className="w-3 h-3" />}
                    {step.label}
                  </div>
                  {i < 3 && <ChevronRight className="w-4 h-4 text-slate-300" />}
                </div>
              ))}
            </div>

            <div className="bg-[#F9F9FA] rounded-xl p-4 max-w-sm mx-auto">
              <div className="flex justify-between text-xs text-slate-500 mb-2">
                <span>Training progress</span>
                <span>67%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div className="h-full rounded-full bg-gradient-to-r from-[#478EDB] to-[#8EBFF2] transition-all" style={{ width: "67%" }} />
              </div>
              <p className="text-xs text-slate-400 mt-2">Estimated completion: ~12 minutes</p>
            </div>
          </div>

          {/* Training data summary */}
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: "Training Samples", value: "1,284", desc: "From query history" },
              { label: "Approved FAQs", value: "4", desc: "Human-verified answers" },
              { label: "Model Accuracy", value: "94.7%", desc: "On validation set" },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <p className="text-2xl font-light text-[#2E3538] mb-0.5">{stat.value}</p>
                <p className="text-sm font-medium text-[#2E3538]">{stat.label}</p>
                <p className="text-xs text-slate-400 mt-1">{stat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── SOCIAL MEDIA TAB ───────────────────────────────────────────────── */

function SocialTab() {
  const [socialAccounts, setSocialAccounts] = useState(mockSocialMedia);

  const toggleConnection = (platform: string) => {
    setSocialAccounts(prev => prev.map(s =>
      s.platform === platform ? { ...s, connected: !s.connected } : s
    ));
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="font-serif text-2xl font-light text-[#2E3538] mb-1">Social Media</h1>
        <p className="text-sm text-slate-400">Connect your social media handles to enrich chatbot responses with your social content.</p>
      </div>

      <div className="space-y-3">
        {socialAccounts.map(account => (
          <div key={account.platform} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: account.color + "15" }}>
                <Share2 className="w-5 h-5" style={{ color: account.color }} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-[#2E3538]">{account.platform}</h3>
                  {account.connected && <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">Connected</span>}
                </div>
                <p className="text-xs text-slate-400">{account.handle} · {account.followers || account.subscribers} {account.subscribers ? "subscribers" : "followers"}</p>
              </div>
              <button
                onClick={() => toggleConnection(account.platform)}
                className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                  account.connected
                    ? "border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                    : "bg-[#478EDB] text-white hover:bg-[#3b7ac2] shadow-lg shadow-[#478EDB]/20"
                }`}
              >
                {account.connected ? "Disconnect" : "Connect"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Social data info */}
      <div className="bg-[#F9F9FA] rounded-2xl p-6 border border-slate-100">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#478EDB] flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-[#2E3538] mb-1">How social data is used</h4>
            <p className="text-xs text-slate-500 leading-relaxed">Connected social media accounts allow NavBot to reference your latest posts, product announcements, and social content when answering visitor questions. Only public data is used — we never post on your behalf.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── VISITOR INSIGHTS TAB ────────────────────────────────────────────── */

function VisitorInsightsTab() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="font-serif text-2xl font-light text-[#2E3538] mb-1">Visitor Insights</h1>
        <p className="text-sm text-slate-400">See how visitors interact with your chatbot and track conversations for follow-up.</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Conversations", value: mockStats.totalConversations.toString(), color: "#478EDB" },
          { label: "This Week", value: mockStats.conversationsThisWeek.toString(), color: "#8691CA" },
          { label: "Content Summaries", value: mockStats.contentSummaries.toString(), color: "#27C93F" },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm text-center">
            <p className="text-2xl font-light text-[#2E3538]">{stat.value}</p>
            <p className="text-xs mt-1 font-medium" style={{ color: stat.color }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Visitor interactions */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-sm font-medium text-[#2E3538]">Recent Visitor Interactions</h3>
        </div>
        {mockVisitorInteractions.length <= 1 && mockVisitorInteractions[0]?.query === "No interactions yet" ? (
          <div className="text-center py-16">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-medium text-[#2E3538] mb-1">No visitor data yet</h3>
            <p className="text-sm text-slate-400 max-w-sm mx-auto">Once visitors start using your chatbot, their questions and interactions will appear here so you can follow up.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {mockVisitorInteractions.map(interaction => (
              <div key={interaction.id} className="flex items-center gap-4 p-4 hover:bg-[#F9F9FA] transition-colors">
                <div className="w-9 h-9 rounded-full bg-[#478EDB]/10 flex items-center justify-center text-[#478EDB] flex-shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#2E3538]">{interaction.visitor}</span>
                    <span className="text-[10px] text-slate-400">{interaction.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">"{interaction.query}"</p>
                </div>
                <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-[#478EDB]/10 text-[#478EDB]">
                  {interaction.source}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info card */}
      <div className="bg-[#F9F9FA] rounded-2xl p-6 border border-slate-100">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#478EDB] flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-[#2E3538] mb-1">How visitor insights work</h4>
            <p className="text-xs text-slate-500 leading-relaxed">NavBot tracks every chatbot conversation so you can understand what visitors are looking for. Use these insights to improve your website content, identify common questions, and follow up with interested visitors.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── SETTINGS TAB ───────────────────────────────────────────────────── */

function SettingsTab({ voiceEnabled, setVoiceEnabled, webDataOnly, setWebDataOnly }: {
  voiceEnabled: boolean; setVoiceEnabled: (v: boolean) => void;
  webDataOnly: boolean; setWebDataOnly: (v: boolean) => void;
}) {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <h1 className="font-serif text-2xl font-light text-[#2E3538]">Settings</h1>

      {/* Voice Chatbot */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${voiceEnabled ? "bg-[#478EDB]/10" : "bg-slate-100"}`}>
              {voiceEnabled ? <Volume2 className="w-5 h-5 text-[#478EDB]" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
            </div>
            <div>
              <h3 className="text-sm font-medium text-[#2E3538]">Voice Enabled Chatbot</h3>
              <p className="text-xs text-slate-400 mt-0.5">Allow visitors to interact with NavBot using voice input and receive spoken responses.</p>
            </div>
          </div>
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`relative w-12 h-7 rounded-full transition-colors ${voiceEnabled ? "bg-[#478EDB]" : "bg-slate-200"}`}
          >
            <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${voiceEnabled ? "left-6" : "left-1"}`} />
          </button>
        </div>
      </div>

      {/* Website Data Only */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${webDataOnly ? "bg-green-100" : "bg-slate-100"}`}>
              <Globe className={`w-5 h-5 ${webDataOnly ? "text-green-600" : "text-slate-400"}`} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-[#2E3538]">Website Data Only — No Google/Web Data</h3>
              <p className="text-xs text-slate-400 mt-0.5">Restrict NavBot to only use your indexed website content. Prevents answers sourced from external search results.</p>
            </div>
          </div>
          <button
            onClick={() => setWebDataOnly(!webDataOnly)}
            className={`relative w-12 h-7 rounded-full transition-colors ${webDataOnly ? "bg-green-500" : "bg-slate-200"}`}
          >
            <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${webDataOnly ? "left-6" : "left-1"}`} />
          </button>
        </div>
        {webDataOnly && (
          <div className="mt-4 ml-15 pl-15 bg-green-50 rounded-xl p-3 flex items-center gap-2 text-xs text-green-700">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            Only your website content is used for generating responses. No external data sources.
          </div>
        )}
      </div>

      {/* Danger zone placeholder */}
      <div className="bg-white rounded-2xl p-6 border border-red-100 shadow-sm">
        <h3 className="text-sm font-medium text-red-600 mb-1">Danger Zone</h3>
        <p className="text-xs text-slate-400 mb-4">Permanently delete your NavBot data and all indexed content.</p>
        <button className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors">
          Delete All Data
        </button>
      </div>
    </div>
  );
}
