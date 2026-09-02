import {
  ChevronRight,
  Clock,
  FileText,
  Globe,
  MessageSquare,
} from "lucide-react";
import { formatLocalDate, formatRelativeTime } from "../../lib/format-date";
import { DASH_PANEL } from "./styles";
import type { DashboardAnalytics, Tab, Website } from "./types";

/* ─── OVERVIEW TAB ───────────────────────────────────────────────────────── */

export function OverviewTab({ websites, activeSite, onIntegrate, onSwitchTab, analytics, analyticsLoading }: {
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
