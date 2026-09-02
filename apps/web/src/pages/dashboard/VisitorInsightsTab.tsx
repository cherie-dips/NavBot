import {
  Loader2,
  MessageSquare,
} from "lucide-react";
import { formatRelativeTime } from "../../lib/format-date";
import { DASH_PANEL } from "./styles";
import type { DashboardAnalytics, Website } from "./types";

/* ─── VISITORS TAB ───────────────────────────────────────────────────────── */

export function VisitorInsightsTab({ activeSite, analytics, analyticsLoading }: {
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
