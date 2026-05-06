import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to apps/api/.env (e.g. Render PostgreSQL internal URL)."
  );
}

export const pool = new pg.Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

let schemaReady: Promise<void> | null = null;

export function initAppDatabase(): Promise<void> {
  if (!schemaReady) {
    schemaReady = ensureSchema().then(() => {
      console.log("API database ready (PostgreSQL).");
    });
  }
  return schemaReady;
}

async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site (
      id BIGSERIAL PRIMARY KEY,
      site_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      hostname TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      pages_indexed INTEGER NOT NULL DEFAULT 0,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_crawled TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      widget_theme TEXT,
      social_handles TEXT,
      UNIQUE(site_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS page_lastmod (
      site_id TEXT NOT NULL,
      url TEXT NOT NULL,
      content_hash TEXT,
      lastmod TEXT,
      indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (site_id, url)
    );

    CREATE TABLE IF NOT EXISTS faq (
      id BIGSERIAL PRIMARY KEY,
      site_id TEXT NOT NULL,
      label TEXT NOT NULL,
      question TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      answer_preview TEXT,
      user_answer TEXT,
      user_answer_updated_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS chat_query (
      id BIGSERIAL PRIMARY KEY,
      site_id TEXT NOT NULL,
      query TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      channel TEXT NOT NULL DEFAULT 'text',
      answer_preview TEXT,
      latency_ms INTEGER,
      source_count INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_chat_query_site_created ON chat_query(site_id, created_at);
  `);
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    if (v.includes("T")) return v.endsWith("Z") ? v : `${v}Z`;
    return `${v.replace(" ", "T")}Z`;
  }
  return String(v);
}

function numId(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return Number(v);
}

export interface SiteRow {
  id: number;
  site_id: string;
  user_id: string;
  url: string;
  hostname: string;
  status: string;
  pages_indexed: number;
  added_at: string;
  last_crawled: string;
  widget_theme: string | null;
}

export interface WidgetTheme {
  primary: string;
  launcherBg: string;
  botBubbleBg: string;
  userBubbleBg: string;
  headerTextColor: string;
  timestampColor: string;
  iconColor: string;
  sendBtnBg: string;
  sendBtnColor: string;
  fontFamily: string;
  widgetOpacity: number;
}

export const DEFAULT_THEME: WidgetTheme = {
  primary: "#2E3538",
  launcherBg: "#2E3538",
  botBubbleBg: "rgba(255,255,255,0.4)",
  userBubbleBg: "rgba(0,0,0,0.06)",
  headerTextColor: "#2E3538",
  timestampColor: "#94a3b8",
  iconColor: "#94a3b8",
  sendBtnBg: "#2E3538",
  sendBtnColor: "#ffffff",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  widgetOpacity: 0.45,
};

export async function upsertSite(params: {
  siteId: string;
  userId: string;
  url: string;
  hostname: string;
  pagesIndexed: number;
}): Promise<SiteRow> {
  const { rows } = await pool.query(
    `
    INSERT INTO site (site_id, user_id, url, hostname, pages_indexed, last_crawled)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (site_id, user_id) DO UPDATE SET
      url = EXCLUDED.url,
      hostname = EXCLUDED.hostname,
      pages_indexed = EXCLUDED.pages_indexed,
      last_crawled = NOW(),
      status = 'active'
    RETURNING *
    `,
    [params.siteId, params.userId, params.url, params.hostname, params.pagesIndexed]
  );
  const r = rows[0] as Record<string, unknown>;
  return {
    id: numId(r.id),
    site_id: r.site_id as string,
    user_id: r.user_id as string,
    url: r.url as string,
    hostname: r.hostname as string,
    status: r.status as string,
    pages_indexed: Number(r.pages_indexed),
    added_at: toIso(r.added_at),
    last_crawled: toIso(r.last_crawled),
    widget_theme: (r.widget_theme as string | null) ?? null,
  };
}

export async function getSitesByUser(userId: string): Promise<SiteRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM site WHERE user_id = $1 ORDER BY added_at DESC`,
    [userId]
  );
  return rows.map((r: unknown) => {
    const row = r as Record<string, unknown>;
    return {
      id: numId(row.id),
      site_id: row.site_id as string,
      user_id: row.user_id as string,
      url: row.url as string,
      hostname: row.hostname as string,
      status: row.status as string,
      pages_indexed: Number(row.pages_indexed),
      added_at: toIso(row.added_at),
      last_crawled: toIso(row.last_crawled),
      widget_theme: (row.widget_theme as string | null) ?? null,
    };
  });
}

export async function deleteSite(siteId: string, userId: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM site WHERE site_id = $1 AND user_id = $2`, [
    siteId,
    userId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function upsertSiteTheme(
  siteId: string,
  userId: string,
  theme: WidgetTheme
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE site SET widget_theme = $1 WHERE site_id = $2 AND user_id = $3`,
    [JSON.stringify(theme), siteId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getSiteTheme(
  siteId: string,
  userId: string
): Promise<WidgetTheme | null> {
  const { rows } = await pool.query(
    `SELECT widget_theme FROM site WHERE site_id = $1 AND user_id = $2`,
    [siteId, userId]
  );
  const row = rows[0] as { widget_theme: string | null } | undefined;
  if (!row?.widget_theme) return null;
  try {
    return JSON.parse(row.widget_theme) as WidgetTheme;
  } catch {
    return null;
  }
}

export async function getSiteThemePublic(siteId: string): Promise<WidgetTheme | null> {
  const { rows } = await pool.query(`SELECT widget_theme FROM site WHERE site_id = $1`, [siteId]);
  const row = rows[0] as { widget_theme: string | null } | undefined;
  if (!row?.widget_theme) return null;
  try {
    return JSON.parse(row.widget_theme) as WidgetTheme;
  } catch {
    return null;
  }
}

export async function getPageHashes(siteId: string): Promise<Record<string, string>> {
  const { rows } = await pool.query(
    `SELECT url, content_hash FROM page_lastmod WHERE site_id = $1`,
    [siteId]
  );
  const result: Record<string, string> = {};
  for (const row of rows as { url: string; content_hash: string | null }[]) {
    if (row.content_hash) result[row.url] = row.content_hash;
  }
  return result;
}

export async function upsertPageHashes(
  siteId: string,
  pages: Array<{ url: string; hash: string }>
): Promise<void> {
  if (pages.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stmt = `
      INSERT INTO page_lastmod (site_id, url, content_hash, indexed_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (site_id, url) DO UPDATE SET
        content_hash = EXCLUDED.content_hash,
        indexed_at = NOW()
    `;
    for (const p of pages) {
      await client.query(stmt, [siteId, p.url, p.hash]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function deletePageHashes(siteId: string): Promise<void> {
  await pool.query(`DELETE FROM page_lastmod WHERE site_id = $1`, [siteId]);
}

export async function getSyncStats(siteId: string): Promise<{
  totalTracked: number;
  lastSynced: string | null;
}> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            MAX(indexed_at) AS last_synced
     FROM page_lastmod WHERE site_id = $1`,
    [siteId]
  );
  const row = rows[0] as { total: number; last_synced: Date | null } | undefined;
  return {
    totalTracked: row?.total ?? 0,
    lastSynced: row?.last_synced ? toIso(row.last_synced) : null,
  };
}

export async function getTrackedUrls(siteId: string): Promise<Set<string>> {
  const { rows } = await pool.query(`SELECT url FROM page_lastmod WHERE site_id = $1`, [siteId]);
  return new Set((rows as { url: string }[]).map((r) => r.url));
}

export async function deletePageHashesForUrls(siteId: string, urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const url of urls) {
      await client.query(`DELETE FROM page_lastmod WHERE site_id = $1 AND url = $2`, [siteId, url]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getSiteCountBySiteId(siteId: string): Promise<number> {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS cnt FROM site WHERE site_id = $1`, [
    siteId,
  ]);
  return (rows[0] as { cnt: number }).cnt;
}

export async function getAllActiveSites(): Promise<SiteRow[]> {
  const { rows } = await pool.query(`SELECT * FROM site WHERE status = 'active'`);
  return rows.map((r: unknown) => {
    const row = r as Record<string, unknown>;
    return {
      id: numId(row.id),
      site_id: row.site_id as string,
      user_id: row.user_id as string,
      url: row.url as string,
      hostname: row.hostname as string,
      status: row.status as string,
      pages_indexed: Number(row.pages_indexed),
      added_at: toIso(row.added_at),
      last_crawled: toIso(row.last_crawled),
      widget_theme: (row.widget_theme as string | null) ?? null,
    };
  });
}

export async function getPageLastmods(siteId: string): Promise<Record<string, string | null>> {
  const { rows } = await pool.query(`SELECT url, lastmod FROM page_lastmod WHERE site_id = $1`, [
    siteId,
  ]);
  const result: Record<string, string | null> = {};
  for (const row of rows as { url: string; lastmod: string | null }[]) {
    result[row.url] = row.lastmod;
  }
  return result;
}

export async function upsertPageLastmods(
  siteId: string,
  pages: Array<{ url: string; lastmod: string | null }>
): Promise<void> {
  if (pages.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stmt = `
      INSERT INTO page_lastmod (site_id, url, lastmod, indexed_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (site_id, url) DO UPDATE SET
        lastmod = EXCLUDED.lastmod,
        indexed_at = NOW()
    `;
    for (const p of pages) {
      await client.query(stmt, [siteId, p.url, p.lastmod]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export interface FaqRow {
  id: number;
  site_id: string;
  label: string;
  question: string;
  answer_preview: string | null;
  user_answer: string | null;
  user_answer_updated_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function getFaqsBySite(siteId: string): Promise<FaqRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM faq WHERE site_id = $1 ORDER BY sort_order ASC, id ASC`,
    [siteId]
  );
  return rows.map((r: unknown) => {
    const row = r as Record<string, unknown>;
    return {
      id: numId(row.id),
      site_id: row.site_id as string,
      label: row.label as string,
      question: row.question as string,
      answer_preview: (row.answer_preview as string | null) ?? null,
      user_answer: (row.user_answer as string | null) ?? null,
      user_answer_updated_at: row.user_answer_updated_at
        ? toIso(row.user_answer_updated_at)
        : null,
      sort_order: Number(row.sort_order),
      created_at: toIso(row.created_at),
      updated_at: toIso(row.updated_at),
    };
  });
}

export async function replaceFaqs(
  siteId: string,
  items: Array<{ label: string; question: string; answerPreview?: string | null }>
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM faq WHERE site_id = $1`, [siteId]);
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      await client.query(
        `INSERT INTO faq (site_id, label, question, answer_preview, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [siteId, item.label, item.question, item.answerPreview ?? null, i]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function updateFaqAnswerPreview(
  faqId: number,
  answerPreview: string | null
): Promise<void> {
  await pool.query(`UPDATE faq SET answer_preview = $1, updated_at = NOW() WHERE id = $2`, [
    answerPreview,
    faqId,
  ]);
}

export async function updateFaqUserAnswer(
  siteId: string,
  faqId: number,
  userAnswer: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE faq
     SET user_answer = $1,
         user_answer_updated_at = NOW(),
         updated_at = NOW()
     WHERE id = $2 AND site_id = $3`,
    [userAnswer, faqId, siteId]
  );
  return (result.rowCount ?? 0) > 0;
}

function parseUtcTimestamp(ts: string): Date {
  if (ts.includes("T")) return new Date(ts.endsWith("Z") ? ts : `${ts}Z`);
  return new Date(`${ts.replace(" ", "T")}Z`);
}

export async function isFaqUserAnswerStale(
  siteId: string,
  userAnswerUpdatedAt: string | null
): Promise<boolean> {
  if (!userAnswerUpdatedAt) return true;
  const { rows } = await pool.query(
    `SELECT MAX(indexed_at) AS latest FROM page_lastmod WHERE site_id = $1`,
    [siteId]
  );
  const latest = rows[0] as { latest: Date | null } | undefined;
  if (!latest?.latest) return false;
  const latestMs =
    latest.latest instanceof Date ? latest.latest.getTime() : parseUtcTimestamp(toIso(latest.latest)).getTime();
  return latestMs > parseUtcTimestamp(userAnswerUpdatedAt).getTime();
}

export async function getFaqUserAnswerForQuestion(
  siteId: string,
  question: string
): Promise<{ answer: string; stale: boolean } | null> {
  const { rows } = await pool.query(
    `SELECT user_answer, user_answer_updated_at
     FROM faq
     WHERE site_id = $1
       AND lower(trim(question)) = lower(trim($2))
       AND user_answer IS NOT NULL
       AND trim(user_answer) <> ''
     ORDER BY id ASC
     LIMIT 1`,
    [siteId, question]
  );
  const row = rows[0] as
    | { user_answer: string | null; user_answer_updated_at: Date | string | null }
    | undefined;
  if (!row?.user_answer) return null;
  const updatedAtStr = row.user_answer_updated_at
    ? row.user_answer_updated_at instanceof Date
      ? row.user_answer_updated_at.toISOString()
      : String(row.user_answer_updated_at)
    : null;
  return {
    answer: row.user_answer,
    stale: await isFaqUserAnswerStale(siteId, updatedAtStr),
  };
}

const PREVIEW_MAX = 480;

export async function logChatTurn(params: {
  siteId: string;
  query: string;
  channel: "text" | "voice";
  answerPreview?: string | null;
  latencyMs?: number | null;
  sourceCount?: number | null;
}): Promise<void> {
  const preview =
    params.answerPreview && params.answerPreview.length > PREVIEW_MAX
      ? params.answerPreview.slice(0, PREVIEW_MAX) + "…"
      : params.answerPreview ?? null;

  await pool.query(
    `INSERT INTO chat_query (site_id, query, channel, answer_preview, latency_ms, source_count)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.siteId,
      params.query,
      params.channel,
      preview,
      params.latencyMs ?? null,
      params.sourceCount ?? null,
    ]
  );
}

/** @deprecated use logChatTurn — kept for scripts / backward compatibility */
export async function trackQuery(siteId: string, query: string): Promise<void> {
  await logChatTurn({ siteId, query, channel: "text" });
}

export async function getTopQueries(
  siteId: string,
  limit = 20
): Promise<Array<{ query: string; count: number }>> {
  const { rows } = await pool.query(
    `SELECT query, COUNT(*)::int AS count FROM chat_query
     WHERE site_id = $1
     GROUP BY query ORDER BY count DESC LIMIT $2`,
    [siteId, limit]
  );
  return rows as Array<{ query: string; count: number }>;
}

export async function deleteChatQueriesForSite(siteId: string): Promise<void> {
  await pool.query(`DELETE FROM chat_query WHERE site_id = $1`, [siteId]);
}

export async function purgeSiteDerivedData(siteId: string): Promise<void> {
  await deleteChatQueriesForSite(siteId);
  await pool.query(`DELETE FROM faq WHERE site_id = $1`, [siteId]);
}

export async function userOwnsSite(userId: string, siteId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 AS ok FROM site WHERE user_id = $1 AND site_id = $2 LIMIT 1`,
    [userId, siteId]
  );
  return rows.length > 0;
}

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
  context: {
    websiteCount: number;
    pagesIndexed: number;
    faqCount: number;
  };
}

function utcDayKeys(numDays: number): Array<{ date: string; dayLabel: string }> {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const out: Array<{ date: string; dayLabel: string }> = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    out.push({ date, dayLabel: labels[d.getUTCDay()]! });
  }
  return out;
}

export async function getDashboardAnalytics(
  userId: string,
  filterSiteId?: string | null
): Promise<DashboardAnalytics | null> {
  const sites = await getSitesByUser(userId);
  let siteIds = sites.map((s) => s.site_id);
  if (filterSiteId) {
    if (!siteIds.includes(filterSiteId)) return null;
    siteIds = [filterSiteId];
  }

  const websiteCount = filterSiteId ? 1 : sites.length;
  const pagesIndexed = (filterSiteId ? sites.filter((s) => s.site_id === filterSiteId) : sites).reduce(
    (sum, s) => sum + (s.pages_indexed || 0),
    0
  );

  let faqCount = 0;
  for (const sid of siteIds) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM faq WHERE site_id = $1`, [sid]);
    faqCount += (rows[0] as { c: number }).c;
  }

  const empty: DashboardAnalytics = {
    totals: {
      totalTurns: 0,
      last7Days: 0,
      thisCalendarMonth: 0,
      avgLatencyMs: null,
      turnsWithSources: 0,
      voiceTurns: 0,
      textTurns: 0,
    },
    volumeByDay: utcDayKeys(7).map((d) => ({ ...d, count: 0 })),
    topQueries: [],
    recentTurns: [],
    context: { websiteCount, pagesIndexed, faqCount },
  };

  if (siteIds.length === 0) return empty;

  const ph = siteIds.map((_, i) => `$${i + 1}`).join(", ");

  const totalTurns = await pool.query(
    `SELECT COUNT(*)::int AS c FROM chat_query WHERE site_id IN (${ph})`,
    siteIds
  );
  const last7 = await pool.query(
    `SELECT COUNT(*)::int AS c FROM chat_query WHERE site_id IN (${ph})
     AND created_at >= NOW() - INTERVAL '7 days'`,
    siteIds
  );
  const thisMonth = await pool.query(
    `SELECT COUNT(*)::int AS c FROM chat_query WHERE site_id IN (${ph})
     AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
    siteIds
  );
  const avgRow = await pool.query(
    `SELECT AVG(latency_ms) AS avg_ms FROM chat_query WHERE site_id IN (${ph}) AND latency_ms IS NOT NULL`,
    siteIds
  );
  const withSources = await pool.query(
    `SELECT COUNT(*)::int AS c FROM chat_query WHERE site_id IN (${ph})
     AND COALESCE(source_count, 0) > 0`,
    siteIds
  );
  const voiceRow = await pool.query(
    `SELECT COUNT(*)::int AS c FROM chat_query WHERE site_id IN (${ph}) AND channel = 'voice'`,
    siteIds
  );
  const textRow = await pool.query(
    `SELECT COUNT(*)::int AS c FROM chat_query WHERE site_id IN (${ph}) AND channel = 'text'`,
    siteIds
  );
  const volRows = await pool.query(
    `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d, COUNT(*)::int AS c
     FROM chat_query
     WHERE site_id IN (${ph})
       AND created_at >= NOW() - INTERVAL '7 days'
     GROUP BY d`,
    siteIds
  );

  const volMap = new Map(
    (volRows.rows as Array<{ d: string; c: number }>).map((r) => [r.d, r.c])
  );
  const volumeByDay = utcDayKeys(7).map(({ date, dayLabel }) => ({
    date,
    dayLabel,
    count: volMap.get(date) ?? 0,
  }));

  const topRows = await pool.query(
    `SELECT query,
            COUNT(*)::int AS cnt,
            MAX(COALESCE(source_count, 0))::int AS max_src
     FROM chat_query
     WHERE site_id IN (${ph})
     GROUP BY query
     ORDER BY cnt DESC
     LIMIT 15`,
    siteIds
  );

  const recentRows = await pool.query(
    `SELECT id, site_id, query, answer_preview, created_at, channel, source_count
     FROM chat_query
     WHERE site_id IN (${ph})
     ORDER BY id DESC
     LIMIT 30`,
    siteIds
  );

  const tt = totalTurns.rows[0] as { c: number };
  const l7 = last7.rows[0] as { c: number };
  const tm = thisMonth.rows[0] as { c: number };
  const ar = avgRow.rows[0] as { avg_ms: string | null };
  const ws = withSources.rows[0] as { c: number };
  const vr = voiceRow.rows[0] as { c: number };
  const tr = textRow.rows[0] as { c: number };
  const avgMs = ar.avg_ms != null ? parseFloat(ar.avg_ms) : null;

  return {
    totals: {
      totalTurns: tt.c,
      last7Days: l7.c,
      thisCalendarMonth: tm.c,
      avgLatencyMs: avgMs != null && !Number.isNaN(avgMs) ? Math.round(avgMs) : null,
      turnsWithSources: ws.c,
      voiceTurns: vr.c,
      textTurns: tr.c,
    },
    volumeByDay,
    topQueries: (topRows.rows as Array<{ query: string; cnt: number; max_src: number }>).map((r) => ({
      query: r.query,
      count: r.cnt,
      answered: r.max_src > 0,
    })),
    recentTurns: (
      recentRows.rows as Array<{
        id: unknown;
        site_id: string;
        query: string;
        answer_preview: string | null;
        created_at: unknown;
        channel: string;
        source_count: number | null;
      }>
    ).map((r) => ({
      id: numId(r.id),
      siteId: r.site_id,
      query: r.query,
      answerPreview: r.answer_preview,
      createdAt: toIso(r.created_at),
      channel: r.channel,
      sourceCount: r.source_count,
    })),
    context: { websiteCount, pagesIndexed, faqCount },
  };
}

export interface SocialHandles {
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  facebook?: string;
}

export async function getSocialHandles(siteId: string): Promise<SocialHandles> {
  const { rows } = await pool.query(
    `SELECT social_handles FROM site
     WHERE site_id = $1 AND social_handles IS NOT NULL AND social_handles <> ''
     LIMIT 1`,
    [siteId]
  );
  const row = rows[0] as { social_handles: string | null } | undefined;
  if (!row?.social_handles) return {};
  try {
    return JSON.parse(row.social_handles) as SocialHandles;
  } catch {
    return {};
  }
}

export async function upsertSocialHandles(
  siteId: string,
  userId: string,
  handles: SocialHandles
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE site SET social_handles = $1 WHERE site_id = $2 AND user_id = $3`,
    [JSON.stringify(handles), siteId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}
