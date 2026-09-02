/**
 * Shared dashboard types.
 *
 * `Website` is the client-side view of a site; `SiteApiRow` is exactly what
 * GET /api/sites returns, kept separate so a change on the API side shows up as a
 * mapping error here rather than as `undefined` on a screen.
 */
import type { SiteOption } from "../../components/SiteSelector";
import type { WidgetTheme } from "@repo/widget-theme";

export interface Website extends SiteOption {
  addedAt: string;
  widgetTheme: WidgetTheme | null;
}

export interface SiteApiRow {
  id: string;
  url: string;
  hostname: string;
  status: string;
  pagesIndexed: number;
  lastCrawled: string | null;
  addedAt: string;
  widgetTheme: WidgetTheme | null;
}

export type Tab = "overview" | "websites" | "pages" | "analytics" | "social" | "visitors" | "settings" | "billing";

export interface DashboardAnalytics {
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
