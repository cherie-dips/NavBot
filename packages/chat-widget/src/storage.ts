/**
 * Per-site browser storage: conversation history, the visitor's session token, and the
 * widget's open/width UI state.
 *
 * Keys are namespaced by siteId so two NavBot widgets on different sites in the same
 * browser cannot read each other's conversations. Every access is wrapped, because
 * storage throws outright in some privacy modes and the widget must still open.
 */
import type { Message } from "./types";

export function getHistoryKey(siteId: string) { return `navbot_history_${siteId}`; }

export function loadHistory(siteId: string): Message[] {
  try {
    const raw = localStorage.getItem(getHistoryKey(siteId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Message[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveHistory(siteId: string, messages: Message[]) {
  try { localStorage.setItem(getHistoryKey(siteId), JSON.stringify(messages.slice(-50))); }
  catch { /* quota exceeded */ }
}

export function clearHistory(siteId: string) {
  try { localStorage.removeItem(getHistoryKey(siteId)); } catch { /* ignore */ }
}

/**
 * The session token identifies this visitor for the daily question limit. It lives in
 * localStorage rather than sessionStorage on purpose: the limit is per day, so it has
 * to survive closing the tab. Clearing site data hands out a fresh allowance, which is
 * accepted — this is a courtesy limit, not an entitlement check.
 */
export function getSessionKey(siteId: string) { return `navbot_session_${siteId}`; }

export function loadSessionToken(siteId: string): string | null {
  try { return localStorage.getItem(getSessionKey(siteId)); } catch { return null; }
}

export function saveSessionToken(siteId: string, token: string) {
  try { localStorage.setItem(getSessionKey(siteId), token); } catch { /* ignore */ }
}

export function getUiStateKey(siteId: string) { return `navbot_ui_${siteId}`; }

export function loadUiState(siteId: string): { open: boolean; faqDismissed: boolean; width: number } {
  try {
    const raw = sessionStorage.getItem(getUiStateKey(siteId));
    if (!raw) return { open: false, faqDismissed: false, width: 360 };
    const parsed = JSON.parse(raw);
    return { open: !!parsed.open, faqDismissed: !!parsed.faqDismissed, width: typeof parsed.width === "number" ? parsed.width : 360 };
  } catch { return { open: false, faqDismissed: false, width: 360 }; }
}

export function saveUiState(siteId: string, state: { open: boolean; faqDismissed: boolean; width: number }) {
  try { sessionStorage.setItem(getUiStateKey(siteId), JSON.stringify(state)); }
  catch { /* quota exceeded */ }
}

/**
 * Streaming display queue.
 *
 * The network delivers whatever chunk sizes the model produced — three characters, then
 * forty — and rendering each one straight to the DOM shows the visitor the network's
 * rhythm rather than a reading rhythm. Deltas are buffered here and released a whole
 * block at a time on a steady cadence, so text arrives as lines instead of twitching
 * word by word.
 *
 * Nothing about the transport changes: the server still streams as fast as it can and
 * time-to-first-token is unaffected. This only governs when arrived text is painted.
 */

