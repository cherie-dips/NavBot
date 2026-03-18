import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "../../navbot.db");
const db = new Database(dbPath);

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
    widget_theme TEXT,
    UNIQUE(site_id, user_id)
  );
`);

// Migration: add widget_theme column to existing databases
try {
  db.exec(`ALTER TABLE site ADD COLUMN widget_theme TEXT`);
} catch {
  // Column already exists — ignore
}

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
  /** Main accent — launcher button, links, highlights */
  primary: string;
  /** Launcher button background (defaults to primary) */
  launcherBg: string;
  /** Bot bubble background */
  botBubbleBg: string;
  /** User bubble background */
  userBubbleBg: string;
  /** Panel header / title text color */
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

export function upsertSiteTheme(
  siteId: string,
  userId: string,
  theme: WidgetTheme
): boolean {
  const result = db
    .prepare(
      `UPDATE site SET widget_theme = @theme WHERE site_id = @siteId AND user_id = @userId`
    )
    .run({ theme: JSON.stringify(theme), siteId, userId });
  return result.changes > 0;
}

export function getSiteTheme(
  siteId: string,
  userId: string
): WidgetTheme | null {
  const row = db
    .prepare(
      `SELECT widget_theme FROM site WHERE site_id = ? AND user_id = ?`
    )
    .get(siteId, userId) as { widget_theme: string | null } | undefined;
  if (!row?.widget_theme) return null;
  try {
    return JSON.parse(row.widget_theme) as WidgetTheme;
  } catch {
    return null;
  }
}

/**
 * getSiteThemePublic — called by the chat widget's GET /api/widget-config/:siteId
 * No userId needed — the siteId is public and scoped to one tenant.
 */
export function getSiteThemePublic(siteId: string): WidgetTheme | null {
  const row = db
    .prepare(`SELECT widget_theme FROM site WHERE site_id = ?`)
    .get(siteId) as { widget_theme: string | null } | undefined;
  if (!row?.widget_theme) return null;
  try {
    return JSON.parse(row.widget_theme) as WidgetTheme;
  } catch {
    return null;
  }
}