/**
 * Date formatting shared across the dashboard.
 *
 * Timestamps reach the browser in two shapes: ISO strings from the API's `toIso()`, and
 * bare "YYYY-MM-DD HH:MM:SS" values from older rows. The second kind has no timezone
 * marker, so `new Date()` reads it as local time and a UTC row shows hours in the past —
 * `parseSqliteDatetime` is what stops "2 minutes ago" rendering as "5 hours ago".
 */

/** Absolute date for a timestamp, or a friendly word when there isn't one. */
export function formatLocalDate(raw: string | null | undefined): string {
  if (!raw || raw === "Just now") return raw || "Never";
  try {
    return new Date(raw).toLocaleString([], {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return raw;
  }
}

/** Parse a timestamp that may or may not carry a timezone, always as UTC. */
export function parseSqliteDatetime(s: string): Date {
  if (s.includes("T")) return new Date(s.endsWith("Z") ? s : `${s}Z`);
  return new Date(`${s.replace(" ", "T")}Z`);
}

/** "3 min ago" for a server timestamp. */
export function formatRelativeTime(iso: string): string {
  const d = parseSqliteDatetime(iso);
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 45) return "Just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  if (sec < 172800) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** "45s ago" for a local `Date.now()` reading, such as the last analytics poll. */
export function formatSyncAgo(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}
