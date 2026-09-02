/**
 * Guards dashboard-only routes on `/api/sites/:siteId/*`.
 *
 * Verifies the bearer token minted by apps/server (see apps/api/src/services/api-token.ts)
 * and confirms the resulting userId actually owns this siteId — not just that some
 * dashboard user is logged in. Previously several of these routes trusted a raw
 * `userId` query/body param with no verification at all; a few took no credential
 * whatsoever.
 */
import type { Request, Response, NextFunction } from "express";
import { verifyApiToken } from "../services/platform/api-token";
import { isSiteOwner } from "../services/platform/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
}

/**
 * apps/api's top-level CORS is deliberately `origin: "*"` for the public widget routes
 * (any customer's website must be able to call them). These dashboard routes don't need
 * that — restricting them to the actual dashboard origin is defense-in-depth on top of
 * the bearer-token check above, not a substitute for it (a request with no Origin header,
 * e.g. curl or a server, is unaffected — this only stops cross-origin browser JS).
 */
const DASHBOARD_ORIGINS = new Set(
  [process.env.CORS_ORIGIN, "http://localhost:5173", "http://localhost:5174"]
    .flatMap((v) => v?.split(",") ?? [])
    .map((v) => v.trim())
    .filter(Boolean)
);

export function restrictToDashboardOrigin(req: Request, res: Response, next: NextFunction): void {
  // The app-wide cors({origin: "*"}) middleware (index.ts) already stamped this response
  // with a wildcard before it got here — clear it so a disallowed origin's browser can't
  // read this response no matter what status code follows.
  res.removeHeader("Access-Control-Allow-Origin");

  const origin = req.headers.origin;
  if (origin && !DASHBOARD_ORIGINS.has(origin)) {
    res.status(403).json({ error: "origin_not_allowed" });
    return;
  }
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  next();
}

export async function requireSiteOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = verifyApiToken(bearerToken(req));
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const { siteId } = req.params;
  if (!siteId) {
    res.status(400).json({ error: "siteId is required" });
    return;
  }

  const owns = await isSiteOwner(siteId, userId).catch((err) => {
    console.error("[require-site-owner] ownership check failed:", err);
    return false;
  });
  if (!owns) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  req.userId = userId;
  next();
}

/** For routes with no :siteId param (e.g. the site-list route) — just requires a verified caller. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = verifyApiToken(bearerToken(req));
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.userId = userId;
  next();
}
