/**
 * Serper.dev — the Google Search API both search paths run on.
 *
 * There were two copies of this call: one in the social search, one in the site search.
 * They drifted, and only one of them had a timeout — so a hung Serper request blocked a
 * chat turn indefinitely on the social path while the site path gave up after 6s. One
 * client, one timeout, one place to change the key handling.
 */

/** Read per call rather than cached: the key is only present after dotenv has run. */
export function getSerperApiKey(): string {
  return process.env.SERPER_API_KEY?.trim() ?? "";
}

export function hasSerperApiKey(): boolean {
  return getSerperApiKey().length > 0;
}

export interface SerperResult {
  title: string;
  link: string;
  snippet: string;
}

const DEFAULT_TIMEOUT_MS = 6_000;

/**
 * One Google search. Returns [] on any failure — every caller treats search as an
 * enhancement to retrieval, never as the thing an answer depends on, so a Serper
 * outage must degrade quality rather than fail the request.
 */
export async function serperSearch(
  query: string,
  options: { num?: number; timeoutMs?: number; label?: string } = {}
): Promise<SerperResult[]> {
  const key = getSerperApiKey();
  if (!key) return [];

  const { num = 5, timeoutMs = DEFAULT_TIMEOUT_MS, label = "serper" } = options;

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      console.warn(`[${label}] Serper ${res.status} for "${query.slice(0, 60)}"`);
      return [];
    }

    const data = (await res.json()) as {
      organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };
    return (data.organic ?? [])
      .filter((r) => r.link)
      .map((r) => ({ title: r.title ?? "", link: r.link!, snippet: r.snippet ?? "" }));
  } catch (err) {
    console.warn(
      `[${label}] Serper failed for "${query.slice(0, 60)}":`,
      err instanceof Error ? err.message.slice(0, 120) : err
    );
    return [];
  }
}
