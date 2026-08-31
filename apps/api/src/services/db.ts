import pg from "pg";

let _pool: pg.Pool | null = null;

let _indexingActive = false;
export function isIndexingActive(): boolean { return _indexingActive; }
export function setIndexingActive(v: boolean) { _indexingActive = v; }

const IS_LOCAL = !(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost"));

function getPool(): pg.Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn("DATABASE_URL is not set — DB queries will fail gracefully.");
    }
    _pool = new pg.Pool({
      connectionString: connectionString || "postgresql://localhost:5432/unused",
      max: IS_LOCAL ? 10 : 5,
      idleTimeoutMillis: IS_LOCAL ? 30_000 : 3_000,
      connectionTimeoutMillis: IS_LOCAL ? 5_000 : 10_000,
      allowExitOnIdle: !IS_LOCAL,
      ...(!IS_LOCAL ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" } } : {}),
    });
    _pool.on("error", (err) => {
      console.error("[db pool] idle client error:", err.message);
    });
  }
  return _pool;
}

async function queryWithRetry<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  values?: unknown[]
): Promise<pg.QueryResult<T>> {
  const MAX = IS_LOCAL ? 1 : 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      return await getPool().query<T>(text, values);
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = msg.includes("timeout") || msg.includes("ECONNRESET") ||
        msg.includes("ECONNREFUSED") || msg.includes("Connection terminated");
      if (!retryable || attempt === MAX) throw err;
      const wait = 1000 * attempt + Math.floor(Math.random() * 500);
      console.warn(`[db] query failed (attempt ${attempt}/${MAX}): ${msg.slice(0, 200)}. Retrying in ${wait}ms…`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function connectWithRetry(): Promise<pg.PoolClient> {
  const MAX = IS_LOCAL ? 1 : 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      return await getPool().connect();
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = msg.includes("timeout") || msg.includes("ECONNRESET") ||
        msg.includes("ECONNREFUSED") || msg.includes("Connection terminated");
      if (!retryable || attempt === MAX) throw err;
      const wait = 1000 * attempt + Math.floor(Math.random() * 500);
      console.warn(`[db] connect failed (attempt ${attempt}/${MAX}): ${msg.slice(0, 200)}. Retrying in ${wait}ms…`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    if (prop === "query") return queryWithRetry;
    if (prop === "connect") return connectWithRetry;
    return (getPool() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * Serverless Postgres (Neon) suspends its compute after a few idle minutes and a cold
 * boot can take longer to wake up than queryWithRetry's normal (fast-fail) budget
 * allows — that budget is intentionally short for request-time queries, so give startup
 * its own, more patient one instead of loosening it for every query app-wide.
 */
async function waitForDatabase(maxAttempts = 5): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await getPool().query("SELECT 1");
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /timeout|ECONNRESET|ECONNREFUSED|Connection terminated/i.test(msg);
      if (!retryable || attempt === maxAttempts) throw err;
      const wait = 2000 * attempt;
      console.warn(
        `[db] startup connection failed (attempt ${attempt}/${maxAttempts}, likely a cold-starting database): ${msg.slice(0, 200)}. Retrying in ${wait}ms…`
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

let schemaReady: Promise<void> | null = null;

export function initAppDatabase(): Promise<void> {
  if (!schemaReady) {
    schemaReady = waitForDatabase()
      .then(() => ensureSchema())
      .then(async () => {
        console.log("API database ready (PostgreSQL).");
        const purged = await purgeNoInfoCacheEntries().catch(() => 0);
        if (purged > 0) console.log(`[db] Purged ${purged} stale "no info" cache entries.`);
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

    CREATE TABLE IF NOT EXISTS rag_cache (
      id BIGSERIAL PRIMARY KEY,
      site_id TEXT NOT NULL,
      query_hash TEXT NOT NULL,
      query_text TEXT NOT NULL,
      answer TEXT NOT NULL,
      sources JSONB NOT NULL DEFAULT '[]',
      page_links JSONB NOT NULL DEFAULT '[]',
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(site_id, query_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_rag_cache_lookup ON rag_cache(site_id, query_hash);

    -- Per-visitor daily usage. One row per (site, session, day) so the count resets
    -- at midnight UTC without a scheduled job, and yesterday's rows are cheap to drop.
    CREATE TABLE IF NOT EXISTS chat_session (
      site_id TEXT NOT NULL,
      session_token TEXT NOT NULL,
      usage_date DATE NOT NULL,
      query_count INTEGER NOT NULL DEFAULT 0,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (site_id, session_token, usage_date)
    );

    CREATE INDEX IF NOT EXISTS idx_chat_session_date ON chat_session(usage_date);
  `);

  // Added after the first release, so they are ALTERs rather than part of the CREATE.
  await pool.query(`
    ALTER TABLE site ADD COLUMN IF NOT EXISTS daily_query_limit INTEGER NOT NULL DEFAULT ${DEFAULT_DAILY_QUERY_LIMIT};
    ALTER TABLE site ADD COLUMN IF NOT EXISTS limit_message TEXT;
  `);
}

// ---------------------------------------------------------------------------
// Per-visitor daily limits
// ---------------------------------------------------------------------------
/** Questions one visitor may ask per day before the site's cut-off message shows. */
export const DEFAULT_DAILY_QUERY_LIMIT = 10;

/** Shown when a visitor runs out. Sites override it from the dashboard. */
export const DEFAULT_LIMIT_MESSAGE =
  "You've reached the daily question limit. If you need more help, please email our team and we'll get back to you.";

export interface ChatLimits {
  /** 0 means unlimited. */
  dailyLimit: number;
  limitMessage: string;
}

/**
 * A site_id can have several rows — the `site` table is keyed (site_id, user_id), so
 * every user who adds the same domain gets their own. The widget only knows the
 * site_id, so this config has to resolve to one deterministic answer; `ORDER BY id`
 * gives that, and `updateChatLimits` keeps every row for the domain in step so the
 * choice of row cannot matter.
 */
export async function getChatLimits(siteId: string): Promise<ChatLimits> {
  const { rows } = await pool.query(
    `SELECT daily_query_limit, limit_message FROM site WHERE site_id = $1 ORDER BY id LIMIT 1`,
    [siteId]
  );
  const row = rows[0] as { daily_query_limit?: number; limit_message?: string | null } | undefined;
  return {
    dailyLimit:
      typeof row?.daily_query_limit === "number" ? row.daily_query_limit : DEFAULT_DAILY_QUERY_LIMIT,
    limitMessage: row?.limit_message?.trim() || DEFAULT_LIMIT_MESSAGE,
  };
}

/**
 * Ownership is checked first, then every row for the domain is updated.
 *
 * Writing only the caller's row would not work: the widget reads one row by site_id, so
 * an owner could save a limit and have the widget keep serving a different one. These
 * users already share a crawl and a vector namespace keyed by site_id — the limit is
 * likewise a property of the site, not of one owner's view of it.
 */
export async function updateChatLimits(
  siteId: string,
  userId: string,
  limits: { dailyLimit: number; limitMessage: string }
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM site WHERE site_id = $1 AND user_id = $2 LIMIT 1`,
    [siteId, userId]
  );
  if (rows.length === 0) return false;

  await pool.query(
    `UPDATE site SET daily_query_limit = $2, limit_message = $3 WHERE site_id = $1`,
    [siteId, limits.dailyLimit, limits.limitMessage.trim() || null]
  );
  return true;
}

export interface SessionUsage {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

/**
 * Read usage without spending a question. Used when the widget opens so it can show
 * what is left before the visitor types anything.
 */
export async function peekSessionUsage(siteId: string, token: string): Promise<SessionUsage> {
  const { dailyLimit } = await getChatLimits(siteId);
  const { rows } = await pool.query(
    `SELECT query_count FROM chat_session
     WHERE site_id = $1 AND session_token = $2 AND usage_date = CURRENT_DATE`,
    [siteId, token]
  );
  const used = (rows[0] as { query_count?: number } | undefined)?.query_count ?? 0;
  if (dailyLimit <= 0) return { allowed: true, used, limit: 0, remaining: Number.MAX_SAFE_INTEGER };
  return { allowed: used < dailyLimit, used, limit: dailyLimit, remaining: Math.max(0, dailyLimit - used) };
}

/**
 * Spend one question if the visitor has any left.
 *
 * The check and the increment are a single statement: `ON CONFLICT DO UPDATE` with a
 * WHERE guard only increments while the count is under the limit, and RETURNING tells
 * us what happened. Two tabs firing at once therefore cannot both pass a check and
 * push the visitor over, which a read-then-write would allow.
 */
export async function consumeSessionQuery(siteId: string, token: string): Promise<SessionUsage> {
  const { dailyLimit } = await getChatLimits(siteId);

  if (dailyLimit <= 0) {
    await pool.query(
      `INSERT INTO chat_session (site_id, session_token, usage_date, query_count)
       VALUES ($1, $2, CURRENT_DATE, 1)
       ON CONFLICT (site_id, session_token, usage_date)
       DO UPDATE SET query_count = chat_session.query_count + 1, last_seen = NOW()`,
      [siteId, token]
    );
    return { allowed: true, used: 0, limit: 0, remaining: Number.MAX_SAFE_INTEGER };
  }

  const { rows } = await pool.query(
    `INSERT INTO chat_session (site_id, session_token, usage_date, query_count)
     VALUES ($1, $2, CURRENT_DATE, 1)
     ON CONFLICT (site_id, session_token, usage_date)
     DO UPDATE SET query_count = chat_session.query_count + 1, last_seen = NOW()
     WHERE chat_session.query_count < $3
     RETURNING query_count`,
    [siteId, token, dailyLimit]
  );

  if (rows.length > 0) {
    const used = (rows[0] as { query_count: number }).query_count;
    return { allowed: true, used, limit: dailyLimit, remaining: Math.max(0, dailyLimit - used) };
  }

  // No row returned: the WHERE guard blocked the increment, so they are at the cap.
  return { allowed: false, used: dailyLimit, limit: dailyLimit, remaining: 0 };
}

/** Yesterday's counters are dead weight; the cap only ever reads CURRENT_DATE. */
export async function purgeOldSessions(days = 7): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM chat_session WHERE usage_date < CURRENT_DATE - $1::int`,
    [days]
  );
  return rowCount ?? 0;
}

/** chat_query stores raw visitor questions indefinitely otherwise — this bounds retention. */
export async function purgeOldChatQueries(days = 90): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM chat_query WHERE created_at < NOW() - $1::int * INTERVAL '1 day'`,
    [days]
  );
  return rowCount ?? 0;
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

interface SiteRow {
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
  /** Shown as a small disclosure link in the widget when set — not required. */
  privacyPolicyUrl?: string;
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

/** Does this verified userId actually own this siteId? Multiple users can share a siteId, so this checks a specific pairing, not just existence. */
export async function isSiteOwner(siteId: string, userId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM site WHERE site_id = $1 AND user_id = $2 LIMIT 1`, [
    siteId,
    userId,
  ]);
  return rows.length > 0;
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
  const deduped = new Map<string, { url: string; hash: string }>();
  for (const p of pages) deduped.set(p.url, p);
  const unique = [...deduped.values()];
  const BATCH = 50;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    for (let j = 0; j < batch.length; j++) {
      const off = j * 3;
      placeholders.push(`($${off + 1}, $${off + 2}, $${off + 3}, NOW())`);
      values.push(siteId, batch[j]!.url, batch[j]!.hash);
    }
    await pool.query(
      `INSERT INTO page_lastmod (site_id, url, content_hash, indexed_at)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (site_id, url) DO UPDATE SET
         content_hash = EXCLUDED.content_hash,
         indexed_at = NOW()`,
      values
    );
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

interface IndexedPage {
  url: string;
  contentHash: string | null;
  lastmod: string | null;
  indexedAt: string;
}

export async function getIndexedPages(siteId: string): Promise<IndexedPage[]> {
  const { rows } = await pool.query(
    `SELECT url, content_hash, lastmod, indexed_at
     FROM page_lastmod WHERE site_id = $1
     ORDER BY indexed_at DESC`,
    [siteId]
  );
  return (rows as Array<{ url: string; content_hash: string | null; lastmod: string | null; indexed_at: Date | string }>).map((r) => ({
    url: r.url,
    contentHash: r.content_hash,
    lastmod: r.lastmod,
    indexedAt: toIso(r.indexed_at),
  }));
}

export async function deletePageHashesForUrls(siteId: string, urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  await pool.query(
    `DELETE FROM page_lastmod WHERE site_id = $1 AND url = ANY($2::text[])`,
    [siteId, urls]
  );
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
  const deduped = new Map<string, { url: string; lastmod: string | null }>();
  for (const p of pages) deduped.set(p.url, p);
  const unique = [...deduped.values()];
  const BATCH = 50;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    for (let j = 0; j < batch.length; j++) {
      const off = j * 3;
      placeholders.push(`($${off + 1}, $${off + 2}, $${off + 3}, NOW())`);
      values.push(siteId, batch[j]!.url, batch[j]!.lastmod);
    }
    await pool.query(
      `INSERT INTO page_lastmod (site_id, url, lastmod, indexed_at)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (site_id, url) DO UPDATE SET
         lastmod = EXCLUDED.lastmod,
         indexed_at = NOW()`,
      values
    );
  }
}

interface FaqRow {
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

async function deleteChatQueriesForSite(siteId: string): Promise<void> {
  await pool.query(`DELETE FROM chat_query WHERE site_id = $1`, [siteId]);
}

export async function purgeSiteDerivedData(siteId: string): Promise<void> {
  await deleteChatQueriesForSite(siteId);
  await pool.query(`DELETE FROM faq WHERE site_id = $1`, [siteId]);
  await invalidateRagCache(siteId);
}

// ---------------------------------------------------------------------------
// RAG Cache
// ---------------------------------------------------------------------------
function normalizeQueryForCache(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => !["what", "is", "the", "a", "an", "how", "does", "do", "can", "are", "was", "were", "will", "would", "should", "could", "tell", "me", "about", "please", "i", "my"].includes(w))
    .sort()
    .join(" ");
}

function queryHash(normalized: string): string {
  const crypto = require("crypto");
  return crypto.createHash("md5").update(normalized).digest("hex");
}

interface RagCacheEntry {
  answer: string;
  sources: Array<{ url: string; title: string }>;
  pageLinks: Array<{ url: string; title: string }>;
}

export async function getRagCache(siteId: string, query: string): Promise<RagCacheEntry | null> {
  const normalized = normalizeQueryForCache(query);
  const hash = queryHash(normalized);
  const { rows } = await pool.query(
    `UPDATE rag_cache SET hit_count = hit_count + 1
     WHERE site_id = $1 AND query_hash = $2
     RETURNING answer, sources, page_links`,
    [siteId, hash]
  );
  if (rows.length === 0) return null;
  const row = rows[0] as { answer: string; sources: unknown; page_links: unknown };
  return {
    answer: row.answer,
    sources: (row.sources ?? []) as RagCacheEntry["sources"],
    pageLinks: (row.page_links ?? []) as RagCacheEntry["pageLinks"],
  };
}

export async function setRagCache(
  siteId: string,
  query: string,
  entry: RagCacheEntry
): Promise<void> {
  const normalized = normalizeQueryForCache(query);
  const hash = queryHash(normalized);
  await pool.query(
    `INSERT INTO rag_cache (site_id, query_hash, query_text, answer, sources, page_links)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (site_id, query_hash) DO UPDATE SET
       answer = EXCLUDED.answer,
       sources = EXCLUDED.sources,
       page_links = EXCLUDED.page_links,
       hit_count = 0,
       created_at = NOW()`,
    [siteId, hash, query, entry.answer, JSON.stringify(entry.sources), JSON.stringify(entry.pageLinks)]
  );
}

export async function invalidateRagCache(siteId: string): Promise<void> {
  await pool.query(`DELETE FROM rag_cache WHERE site_id = $1`, [siteId]);
}

async function purgeNoInfoCacheEntries(): Promise<number> {
  const res = await pool.query(
    `DELETE FROM rag_cache WHERE answer ILIKE '%have that information%' OR answer ILIKE '%find relevant information%'`
  );
  return res.rowCount ?? 0;
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

  const ph = siteIds.map((_, i) => `$${i + 1}`).join(", ");

  const faqResult = siteIds.length > 0
    ? await pool.query(`SELECT COUNT(*)::int AS c FROM faq WHERE site_id IN (${ph})`, siteIds)
    : { rows: [{ c: 0 }] };
  const faqCount = (faqResult.rows[0] as { c: number }).c;

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

  const totalsRow = await pool.query(
    `SELECT
       COUNT(*)::int AS total_turns,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_7_days,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_TIMESTAMP))::int AS this_month,
       AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS avg_ms,
       COUNT(*) FILTER (WHERE COALESCE(source_count, 0) > 0)::int AS with_sources,
       COUNT(*) FILTER (WHERE channel = 'voice')::int AS voice_turns,
       COUNT(*) FILTER (WHERE channel = 'text')::int AS text_turns
     FROM chat_query WHERE site_id IN (${ph})`,
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

  const t = totalsRow.rows[0] as {
    total_turns: number; last_7_days: number; this_month: number;
    avg_ms: string | null; with_sources: number; voice_turns: number; text_turns: number;
  };
  const avgMs = t.avg_ms != null ? parseFloat(t.avg_ms) : null;

  return {
    totals: {
      totalTurns: t.total_turns,
      last7Days: t.last_7_days,
      thisCalendarMonth: t.this_month,
      avgLatencyMs: avgMs != null && !Number.isNaN(avgMs) ? Math.round(avgMs) : null,
      turnsWithSources: t.with_sources,
      voiceTurns: t.voice_turns,
      textTurns: t.text_turns,
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
