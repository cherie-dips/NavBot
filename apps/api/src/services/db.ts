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
export function trackQuery(siteId: string, query: string): void {
  db.prepare("INSERT INTO chat_query (site_id, query) VALUES (?, ?)").run(siteId, query);
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