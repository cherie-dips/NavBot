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
}

export const DEFAULT_THEME: WidgetTheme = {
  primary: "#2E3538",
  launcherBg: "#2E3538",
  botBubbleBg: "rgba(255,255,255,0.4)",
  userBubbleBg: "rgba(0,0,0,0.06)",
  headerTextColor: "#2E3538",
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