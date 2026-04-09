import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "../../navbot.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS site (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id       TEXT    NOT NULL,
    user_id       TEXT    NOT NULL,
    url           TEXT    NOT NULL,
    hostname      TEXT    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'active',
    pages_indexed INTEGER NOT NULL DEFAULT 0,
    added_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    last_crawled  TEXT    NOT NULL DEFAULT (datetime('now')),
    widget_theme  TEXT,
    UNIQUE(site_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS page_lastmod (
    site_id      TEXT NOT NULL,
    url          TEXT NOT NULL,
    content_hash TEXT,
    indexed_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (site_id, url)
  );
`);

try { db.exec(`ALTER TABLE site ADD COLUMN widget_theme TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE page_lastmod ADD COLUMN content_hash TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE page_lastmod ADD COLUMN lastmod TEXT`); } catch { /* already exists */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS faq (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id     TEXT    NOT NULL,
    label       TEXT    NOT NULL,
    question    TEXT    NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_query (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id     TEXT    NOT NULL,
    query       TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

try { db.exec(`ALTER TABLE chat_query ADD COLUMN channel TEXT NOT NULL DEFAULT 'text'`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE chat_query ADD COLUMN answer_preview TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE chat_query ADD COLUMN latency_ms INTEGER`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE chat_query ADD COLUMN source_count INTEGER`); } catch { /* already exists */ }

db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_query_site_created ON chat_query(site_id, created_at)`);

console.log("API database ready (shared navbot.db).");

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
};

export function upsertSite(params: {
  siteId: string;
  userId: string;
  url: string;
  hostname: string;
  pagesIndexed: number;
}): SiteRow {
  const stmt = db.prepare(`
    INSERT INTO site (site_id, user_id, url, hostname, pages_indexed, last_crawled)
    VALUES (@siteId, @userId, @url, @hostname, @pagesIndexed, datetime('now'))
    ON CONFLICT(site_id, user_id) DO UPDATE SET
      url           = @url,
      hostname      = @hostname,
      pages_indexed = @pagesIndexed,
      last_crawled  = datetime('now'),
      status        = 'active'
    RETURNING *
  `);
  return stmt.get({
    siteId: params.siteId,
    userId: params.userId,
    url: params.url,
    hostname: params.hostname,
    pagesIndexed: params.pagesIndexed,
  }) as SiteRow;
}

export function getSitesByUser(userId: string): SiteRow[] {
  return db
    .prepare("SELECT *, added_at || 'Z' as added_at, last_crawled || 'Z' as last_crawled FROM site WHERE user_id = ? ORDER BY added_at DESC")
    .all(userId) as SiteRow[];
}

export function deleteSite(siteId: string, userId: string): boolean {
  const result = db
    .prepare("DELETE FROM site WHERE site_id = ? AND user_id = ?")
    .run(siteId, userId);
  return result.changes > 0;
}


export function upsertSiteTheme(siteId: string, userId: string, theme: WidgetTheme): boolean {
  const result = db
    .prepare(`UPDATE site SET widget_theme = @theme WHERE site_id = @siteId AND user_id = @userId`)
    .run({ theme: JSON.stringify(theme), siteId, userId });
  return result.changes > 0;
}

export function getSiteTheme(siteId: string, userId: string): WidgetTheme | null {
  const row = db
    .prepare(`SELECT widget_theme FROM site WHERE site_id = ? AND user_id = ?`)
    .get(siteId, userId) as { widget_theme: string | null } | undefined;
  if (!row?.widget_theme) return null;
  try { return JSON.parse(row.widget_theme) as WidgetTheme; } catch { return null; }
}

export function getSiteThemePublic(siteId: string): WidgetTheme | null {
  const row = db
    .prepare(`SELECT widget_theme FROM site WHERE site_id = ?`)
    .get(siteId) as { widget_theme: string | null } | undefined;
  if (!row?.widget_theme) return null;
  try { return JSON.parse(row.widget_theme) as WidgetTheme; } catch { return null; }
}


/**
 * Returns a map of { url → content_hash } for all tracked pages of a site.
 * An empty object means the site has never been synced / hashes not yet stored.
 */
export function getPageHashes(siteId: string): Record<string, string> {
  const rows = db
    .prepare(`SELECT url, content_hash FROM page_lastmod WHERE site_id = ?`)
    .all(siteId) as { url: string; content_hash: string | null }[];

  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.content_hash) result[row.url] = row.content_hash;
  }
  return result;
}

/**
 * Upserts content hashes for a batch of pages.
 * Called after every crawl (initial index + syncs).
 */
export function upsertPageHashes(
  siteId: string,
  pages: Array<{ url: string; hash: string }>
): void {
  const stmt = db.prepare(`
    INSERT INTO page_lastmod (site_id, url, content_hash, indexed_at)
    VALUES (@siteId, @url, @hash, datetime('now'))
    ON CONFLICT(site_id, url) DO UPDATE SET
      content_hash = @hash,
      indexed_at   = datetime('now')
  `);

  const runAll = db.transaction((items: typeof pages) => {
    for (const p of items) stmt.run({ siteId, url: p.url, hash: p.hash });
  });

  runAll(pages);
}

export function deletePageHashes(siteId: string): void {
  db.prepare(`DELETE FROM page_lastmod WHERE site_id = ?`).run(siteId);
}

export function getSyncStats(siteId: string): {
  totalTracked: number;
  lastSynced: string | null;
} {
  const row = db
    .prepare(
      `SELECT COUNT(*) as total,
              CASE WHEN MAX(indexed_at) IS NOT NULL THEN MAX(indexed_at) || 'Z' ELSE NULL END as last_synced
       FROM page_lastmod WHERE site_id = ?`
    )
    .get(siteId) as { total: number; last_synced: string | null } | undefined;

  return {
    totalTracked: row?.total ?? 0,
    lastSynced: row?.last_synced ?? null,
  };
}


export function getTrackedUrls(siteId: string): Set<string> {
  const rows = db
    .prepare(`SELECT url FROM page_lastmod WHERE site_id = ?`)
    .all(siteId) as { url: string }[];
  return new Set(rows.map((r) => r.url));
}

export function deletePageHashesForUrls(siteId: string, urls: string[]): void {
  if (urls.length === 0) return;
  const stmt = db.prepare(`DELETE FROM page_lastmod WHERE site_id = ? AND url = ?`);
  const runAll = db.transaction(() => {
    for (const url of urls) stmt.run(siteId, url);
  });
  runAll();
}

/**
 * Returns the number of users who have registered a given siteId.
 */
export function getSiteCountBySiteId(siteId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) as cnt FROM site WHERE site_id = ?")
    .get(siteId) as { cnt: number };
  return row.cnt;
}

/**
 * Returns all active sites across all users.
 */
export function getAllActiveSites(): SiteRow[] {
  return db
    .prepare("SELECT * FROM site WHERE status = 'active'")
    .all() as SiteRow[];
}

/**
 * Returns a map of { url → lastmod } from the page_lastmod table.
 * Used for sitemap-based diff to detect which pages have changed.
 */
export function getPageLastmods(siteId: string): Record<string, string | null> {
  const rows = db
    .prepare(`SELECT url, lastmod FROM page_lastmod WHERE site_id = ?`)
    .all(siteId) as { url: string; lastmod: string | null }[];

  const result: Record<string, string | null> = {};
  for (const row of rows) {
    result[row.url] = row.lastmod;
  }
  return result;
}

/**
 * Updates the lastmod timestamp for pages from the sitemap.
 */
export function upsertPageLastmods(
  siteId: string,
  pages: Array<{ url: string; lastmod: string | null }>
): void {
  const stmt = db.prepare(`
    INSERT INTO page_lastmod (site_id, url, lastmod, indexed_at)
    VALUES (@siteId, @url, @lastmod, datetime('now'))
    ON CONFLICT(site_id, url) DO UPDATE SET
      lastmod    = @lastmod,
      indexed_at = datetime('now')
  `);

  const runAll = db.transaction((items: typeof pages) => {
    for (const p of items) stmt.run({ siteId, url: p.url, lastmod: p.lastmod });
  });

  runAll(pages);
}

// ---------------------------------------------------------------------------
// FAQ helpers
// ---------------------------------------------------------------------------
export interface FaqRow {
  id: number;
  site_id: string;
  label: string;
  question: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function getFaqsBySite(siteId: string): FaqRow[] {
  return db
    .prepare("SELECT * FROM faq WHERE site_id = ? ORDER BY sort_order ASC, id ASC")
    .all(siteId) as FaqRow[];
}

export function replaceFaqs(siteId: string, items: Array<{ label: string; question: string }>): void {
  const del = db.prepare("DELETE FROM faq WHERE site_id = ?");
  const ins = db.prepare(
    "INSERT INTO faq (site_id, label, question, sort_order) VALUES (?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    del.run(siteId);
    items.forEach((item, i) => ins.run(siteId, item.label, item.question, i));
  });
  tx();
}

// ---------------------------------------------------------------------------
// Chat query tracking
// ---------------------------------------------------------------------------
const PREVIEW_MAX = 480;

export function logChatTurn(params: {
  siteId: string;
  query: string;
  channel: "text" | "voice";
  answerPreview?: string | null;
  latencyMs?: number | null;
  sourceCount?: number | null;
}): void {
  const preview =
    params.answerPreview && params.answerPreview.length > PREVIEW_MAX
      ? params.answerPreview.slice(0, PREVIEW_MAX) + "…"
      : params.answerPreview ?? null;

  db.prepare(
    `INSERT INTO chat_query (site_id, query, channel, answer_preview, latency_ms, source_count)
     VALUES (@siteId, @query, @channel, @answer_preview, @latency_ms, @source_count)`
  ).run({
    siteId: params.siteId,
    query: params.query,
    channel: params.channel,
    answer_preview: preview,
    latency_ms: params.latencyMs ?? null,
    source_count: params.sourceCount ?? null,
  });
}

/** @deprecated use logChatTurn — kept for scripts / backward compatibility */
export function trackQuery(siteId: string, query: string): void {
  logChatTurn({ siteId, query, channel: "text" });
}

export function getTopQueries(siteId: string, limit = 20): Array<{ query: string; count: number }> {
  return db
    .prepare(
      `SELECT query, COUNT(*) as count FROM chat_query
       WHERE site_id = ?
       GROUP BY query ORDER BY count DESC LIMIT ?`
    )
    .all(siteId, limit) as Array<{ query: string; count: number }>;
}

export function deleteChatQueriesForSite(siteId: string): void {
  db.prepare("DELETE FROM chat_query WHERE site_id = ?").run(siteId);
}

/** Remove conversation logs and generated FAQs when no owners remain for a site. */
export function purgeSiteDerivedData(siteId: string): void {
  deleteChatQueriesForSite(siteId);
  db.prepare("DELETE FROM faq WHERE site_id = ?").run(siteId);
}

export function userOwnsSite(userId: string, siteId: string): boolean {
  const row = db
    .prepare("SELECT 1 as ok FROM site WHERE user_id = ? AND site_id = ? LIMIT 1")
    .get(userId, siteId) as { ok: number } | undefined;
  return !!row;
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

export function getDashboardAnalytics(
  userId: string,
  filterSiteId?: string | null
): DashboardAnalytics | null {
  const sites = getSitesByUser(userId);
  let siteIds = sites.map((s) => s.site_id);
  if (filterSiteId) {
    if (!siteIds.includes(filterSiteId)) return null;
    siteIds = [filterSiteId];
  }

  const websiteCount = filterSiteId ? 1 : sites.length;
  const pagesIndexed = (filterSiteId
    ? sites.filter((s) => s.site_id === filterSiteId)
    : sites
  ).reduce((sum, s) => sum + (s.pages_indexed || 0), 0);

  let faqCount = 0;
  for (const sid of siteIds) {
    const row = db.prepare("SELECT COUNT(*) as c FROM faq WHERE site_id = ?").get(sid) as { c: number };
    faqCount += row.c;
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

  const ph = siteIds.map(() => "?").join(",");

  const totalTurns = db
    .prepare(`SELECT COUNT(*) as c FROM chat_query WHERE site_id IN (${ph})`)
    .get(...siteIds) as { c: number };

  const last7 = db
    .prepare(
      `SELECT COUNT(*) as c FROM chat_query WHERE site_id IN (${ph})
       AND datetime(created_at) >= datetime('now', '-7 days')`
    )
    .get(...siteIds) as { c: number };

  const thisMonth = db
    .prepare(
      `SELECT COUNT(*) as c FROM chat_query WHERE site_id IN (${ph})
       AND datetime(created_at) >= datetime('now', 'start of month')`
    )
    .get(...siteIds) as { c: number };

  const avgRow = db
    .prepare(
      `SELECT AVG(latency_ms) as avg_ms FROM chat_query WHERE site_id IN (${ph}) AND latency_ms IS NOT NULL`
    )
    .get(...siteIds) as { avg_ms: number | null };

  const withSources = db
    .prepare(
      `SELECT COUNT(*) as c FROM chat_query WHERE site_id IN (${ph})
       AND COALESCE(source_count, 0) > 0`
    )
    .get(...siteIds) as { c: number };

  const voiceRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM chat_query WHERE site_id IN (${ph}) AND channel = 'voice'`
    )
    .get(...siteIds) as { c: number };

  const textRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM chat_query WHERE site_id IN (${ph}) AND channel = 'text'`
    )
    .get(...siteIds) as { c: number };

  const volRows = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at) as d, COUNT(*) as c
       FROM chat_query
       WHERE site_id IN (${ph})
         AND datetime(created_at) >= datetime('now', '-7 days')
       GROUP BY d`
    )
    .all(...siteIds) as Array<{ d: string; c: number }>;

  const volMap = new Map(volRows.map((r) => [r.d, r.c]));
  const volumeByDay = utcDayKeys(7).map(({ date, dayLabel }) => ({
    date,
    dayLabel,
    count: volMap.get(date) ?? 0,
  }));

  const topRows = db
    .prepare(
      `SELECT query,
              COUNT(*) as cnt,
              MAX(COALESCE(source_count, 0)) as max_src
       FROM chat_query
       WHERE site_id IN (${ph})
       GROUP BY query
       ORDER BY cnt DESC
       LIMIT 15`
    )
    .all(...siteIds) as Array<{ query: string; cnt: number; max_src: number }>;

  const recentRows = db
    .prepare(
      `SELECT id, site_id, query, answer_preview, created_at, channel, source_count
       FROM chat_query
       WHERE site_id IN (${ph})
       ORDER BY id DESC
       LIMIT 30`
    )
    .all(...siteIds) as Array<{
      id: number;
      site_id: string;
      query: string;
      answer_preview: string | null;
      created_at: string;
      channel: string;
      source_count: number | null;
    }>;

  return {
    totals: {
      totalTurns: totalTurns.c,
      last7Days: last7.c,
      thisCalendarMonth: thisMonth.c,
      avgLatencyMs:
        avgRow.avg_ms != null && !Number.isNaN(avgRow.avg_ms)
          ? Math.round(avgRow.avg_ms)
          : null,
      turnsWithSources: withSources.c,
      voiceTurns: voiceRow.c,
      textTurns: textRow.c,
    },
    volumeByDay,
    topQueries: topRows.map((r) => ({
      query: r.query,
      count: r.cnt,
      answered: r.max_src > 0,
    })),
    recentTurns: recentRows.map((r) => ({
      id: r.id,
      siteId: r.site_id,
      query: r.query,
      answerPreview: r.answer_preview,
      createdAt: r.created_at,
      channel: r.channel,
      sourceCount: r.source_count,
    })),
    context: { websiteCount, pagesIndexed, faqCount },
  };
}