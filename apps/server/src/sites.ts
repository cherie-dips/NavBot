import { Router, type Router as RouterType, type Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { authPool, auth } from "./auth.js";

export const sitesRouter: RouterType = Router();

/** The caller's verified userId from their Better Auth session cookie, or null if not logged in. */
async function requireUserId(req: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  return session?.user?.id ?? null;
}

sitesRouter.get("/api/sites", async (req, res) => {
  const userId = await requireUserId(req);
  if (!userId) return res.status(401).json({ error: "not_authenticated" });

  const { rows } = await authPool.query(
    `SELECT site_id, url, hostname, status, pages_indexed, added_at, last_crawled, widget_theme
     FROM site WHERE user_id = $1 ORDER BY added_at`,
    [userId]
  );

  res.json(
    rows.map((r: any) => ({
      id: r.site_id,
      url: r.url,
      hostname: r.hostname,
      status: r.status,
      pagesIndexed: r.pages_indexed,
      addedAt: r.added_at,
      lastCrawled: r.last_crawled,
      widgetTheme: r.widget_theme ? JSON.parse(r.widget_theme) : null,
    }))
  );
});

sitesRouter.get("/api/sites/dashboard-stats", async (req, res) => {
  const userId = await requireUserId(req);
  if (!userId) return res.status(401).json({ error: "not_authenticated" });
  const siteId = req.query.siteId as string | undefined;

  const userSites = await authPool.query(
    "SELECT site_id FROM site WHERE user_id = $1",
    [userId]
  );
  const allSiteIds = userSites.rows.map((r: any) => r.site_id as string);
  if (allSiteIds.length === 0) {
    return res.json(emptyAnalytics());
  }

  const targetIds = siteId && allSiteIds.includes(siteId) ? [siteId] : allSiteIds;

  const [totalsRes, volumeRes, topQueriesRes, recentRes, contextRes] = await Promise.all([
    authPool.query(
      `SELECT
         count(*)::int AS "totalTurns",
         count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS "last7Days",
         count(*) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', now()))::int AS "thisCalendarMonth",
         round(avg(latency_ms))::int AS "avgLatencyMs",
         count(*) FILTER (WHERE source_count > 0)::int AS "turnsWithSources",
         count(*) FILTER (WHERE channel = 'voice')::int AS "voiceTurns",
         count(*) FILTER (WHERE channel = 'text')::int AS "textTurns"
       FROM chat_query WHERE site_id = ANY($1)`,
      [targetIds]
    ),
    authPool.query(
      `SELECT to_char(created_at::date, 'YYYY-MM-DD') AS date,
              to_char(created_at::date, 'Dy') AS "dayLabel",
              count(*)::int AS count
       FROM chat_query
       WHERE site_id = ANY($1) AND created_at >= now() - interval '30 days'
       GROUP BY created_at::date
       ORDER BY created_at::date`,
      [targetIds]
    ),
    authPool.query(
      `SELECT query, count(*)::int AS count, true AS answered
       FROM chat_query WHERE site_id = ANY($1)
       GROUP BY query ORDER BY count DESC LIMIT 10`,
      [targetIds]
    ),
    authPool.query(
      `SELECT id, site_id AS "siteId", query, answer_preview AS "answerPreview",
              created_at AS "createdAt", channel, source_count AS "sourceCount"
       FROM chat_query WHERE site_id = ANY($1)
       ORDER BY created_at DESC LIMIT 20`,
      [targetIds]
    ),
    authPool.query(
      `SELECT
         (SELECT count(*)::int FROM site WHERE user_id = $1) AS "websiteCount",
         (SELECT coalesce(sum(pages_indexed), 0)::int FROM site WHERE user_id = $1 AND ($2::text IS NULL OR site_id = $2)) AS "pagesIndexed",
         (SELECT count(*)::int FROM faq WHERE site_id = ANY($3)) AS "faqCount"`,
      [userId, siteId ?? null, targetIds]
    ),
  ]);

  res.json({
    totals: totalsRes.rows[0],
    volumeByDay: volumeRes.rows,
    topQueries: topQueriesRes.rows,
    recentTurns: recentRes.rows,
    context: contextRes.rows[0],
  });
});

function emptyAnalytics() {
  return {
    totals: {
      totalTurns: 0, last7Days: 0, thisCalendarMonth: 0,
      avgLatencyMs: null, turnsWithSources: 0, voiceTurns: 0, textTurns: 0,
    },
    volumeByDay: [],
    topQueries: [],
    recentTurns: [],
    context: { websiteCount: 0, pagesIndexed: 0, faqCount: 0 },
  };
}
