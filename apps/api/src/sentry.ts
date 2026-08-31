/**
 * Opt-in error tracking — a no-op until SENTRY_DSN is set. Failures otherwise only ever
 * reach Render's ephemeral logs.
 */
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({ dsn, environment: process.env.NODE_ENV || "development" });
}

export { Sentry };
export const sentryEnabled = Boolean(dsn);
