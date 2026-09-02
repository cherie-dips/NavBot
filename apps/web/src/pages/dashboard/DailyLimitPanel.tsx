import { useState, useEffect } from "react";
import {
  Loader2,
  Mail,
  MessageSquare,
} from "lucide-react";
import { API_BASE } from "../../lib/api-base";
import { apiFetch } from "../../lib/api-fetch";
import { DASH_PANEL } from "./styles";
import type { Website } from "./types";

/* ─── SETTINGS TAB ───────────────────────────────────────────────────────── */

/* ── Daily question limit ─────────────────────────────────────────────── */
export function DailyLimitPanel({ activeSite }: { activeSite: Website | null }) {
  const [dailyLimit, setDailyLimit] = useState<string>("10");
  const [limitMessage, setLimitMessage] = useState("");
  const [defaultMessage, setDefaultMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSite) return;
    setLoading(true);
    setSaved(false);
    setErr(null);
    apiFetch(`${API_BASE}/api/sites/${activeSite.id}/limits`)
      .then(r => r.json())
      .then(d => {
        if (typeof d.dailyLimit === "number") setDailyLimit(String(d.dailyLimit));
        setDefaultMessage(d.defaultMessage ?? "");
        // Blank the field when the site is on the default, so the placeholder shows
        // what visitors actually see instead of pre-filling text nobody wrote.
        setLimitMessage(d.limitMessage === d.defaultMessage ? "" : (d.limitMessage ?? ""));
      })
      .catch(() => setErr("Couldn't load the current limit."))
      .finally(() => setLoading(false));
  }, [activeSite?.id]);

  const parsed = Number(dailyLimit);
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 1000;

  const save = async () => {
    if (!activeSite || !valid) return;
    setSaving(true);
    setSaved(false);
    setErr(null);
    try {
      const res = await apiFetch(
        `${API_BASE}/api/sites/${activeSite.id}/limits`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dailyLimit: parsed, limitMessage }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
    setSaving(false);
  };

  if (!activeSite) {
    return (
      <div className={`${DASH_PANEL} p-6`}>
        <h3 className="text-sm font-medium text-[#1f2522]">Daily question limit</h3>
        <p className="mt-1 text-xs text-[#8a938f]">Select a website to set its limit.</p>
      </div>
    );
  }

  return (
    <div className={`${DASH_PANEL} p-6`}>
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#f6eee3]">
          <MessageSquare className="h-5 w-5 text-[#bc6c25]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-[#1f2522]">Daily question limit</h3>
          <p className="mt-0.5 text-xs text-[#8a938f]">
            How many questions one visitor can ask {activeSite.hostname} per day. The count resets at midnight UTC.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-[#8a938f]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#5f6b67]">
                  Questions per visitor per day
                </label>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={dailyLimit}
                  onChange={e => setDailyLimit(e.target.value)}
                  className="w-32 rounded-xl border border-[#1f2522]/10 bg-white px-3 py-2 text-sm text-[#1f2522] outline-none focus:border-[#bc6c25]"
                />
                <p className="mt-1.5 text-[11px] text-[#8a938f]">
                  {parsed === 0
                    ? "Unlimited — visitors are never cut off."
                    : valid
                      ? `Visitors get ${parsed} question${parsed === 1 ? "" : "s"} a day.`
                      : "Enter a whole number between 0 and 1000."}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#5f6b67]">
                  Message shown after the limit
                </label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={limitMessage}
                  onChange={e => setLimitMessage(e.target.value)}
                  placeholder={defaultMessage}
                  className="w-full resize-none rounded-xl border border-[#1f2522]/10 bg-white px-3 py-2 text-sm text-[#1f2522] outline-none focus:border-[#bc6c25]"
                />
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#8a938f]">
                  <Mail className="h-3 w-3 flex-shrink-0" />
                  Include the email address you want visitors to write to. Leave blank to use the default.
                </p>
              </div>

              {err && <p className="text-[11px] text-red-600">{err}</p>}

              <div className="flex items-center gap-3">
                <button
                  onClick={save}
                  disabled={saving || !valid}
                  className="rounded-full bg-[#1f2522] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save limit"}
                </button>
                {saved && <span className="text-[11px] font-medium text-green-600">Saved</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
