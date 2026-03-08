import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "navbot-api.db");
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS site (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id     TEXT    NOT NULL,
    user_id     TEXT    NOT NULL,
    url         TEXT    NOT NULL,
    hostname    TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'active',
    pages_indexed INTEGER NOT NULL DEFAULT 0,
    added_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    last_crawled TEXT   NOT NULL DEFAULT (datetime('now')),
    UNIQUE(site_id, user_id)
  );
`);

console.log("API database ready.");

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
}

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
      url = @url,
      hostname = @hostname,
      pages_indexed = @pagesIndexed,
      last_crawled = datetime('now'),
      status = 'active'
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
    .prepare("SELECT * FROM site WHERE user_id = ? ORDER BY added_at DESC")
    .all(userId) as SiteRow[];
}

export function deleteSite(siteId: string, userId: string): boolean {
  const result = db
    .prepare("DELETE FROM site WHERE site_id = ? AND user_id = ?")
    .run(siteId, userId);
  return result.changes > 0;
}
