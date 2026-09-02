import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Loader2,
  Share2,
} from "lucide-react";
import { API_BASE } from "../../lib/api-base";
import { apiFetch } from "../../lib/api-fetch";
import { DASH_PANEL, DASH_PANEL_SOFT } from "./styles";
import type { Website } from "./types";

/* ─── SOCIAL TAB ─────────────────────────────────────────────────────────── */

const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", placeholder: "e.g. your_college", color: "#E1306C" },
  { key: "twitter", label: "Twitter / X", placeholder: "e.g. your_college", color: "#1DA1F2" },
  { key: "linkedin", label: "LinkedIn", placeholder: "e.g. your-college-page", color: "#0077B5" },
  { key: "facebook", label: "Facebook", placeholder: "e.g. YourCollegePage", color: "#1877F2" },
] as const;

export function SocialTab({ activeSite }: { activeSite: Website | null }) {
  const [handles, setHandles] = useState<Record<string, string>>({ instagram: "", twitter: "", linkedin: "", facebook: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch existing handles when site changes
  useEffect(() => {
    if (!activeSite) return;
    setLoading(true);
    setSaved(false);
    fetch(`${API_BASE}/api/sites/${activeSite.id}/social`)
      .then(r => r.json())
      .then(data => setHandles({ instagram: data.instagram ?? "", twitter: data.twitter ?? "", linkedin: data.linkedin ?? "", facebook: data.facebook ?? "" }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeSite?.id]);

  const handleSave = async () => {
    if (!activeSite) return;
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch(`${API_BASE}/api/sites/${activeSite.id}/social`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(handles),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const configured = Object.values(handles).filter(v => v.trim()).length;

  if (!activeSite) {
    return <p className="text-xs text-[#8a938f]">Select a website first to configure social handles.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-[#8a938f]">
          Add your social media usernames for <span className="font-medium text-[#1f2522]">{activeSite.hostname}</span>.
          When visitors ask about events, updates, or announcements, NavBot will search Google for your latest social media posts and include them in answers.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-[#8a938f]">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="space-y-3">
          {SOCIAL_PLATFORMS.map(({ key, label, placeholder, color }) => (
            <div key={key} className={`${DASH_PANEL} flex items-center gap-4 px-6 py-4`}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + "15" }}>
                <Share2 className="w-4 h-4" style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-sm font-medium text-[#1f2522] block mb-1">{label}</label>
                <input
                  type="text"
                  value={handles[key] ?? ""}
                  onChange={e => setHandles(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full text-sm bg-transparent border-b border-[#1f2522]/10 focus:border-[#bc6c25] outline-none py-1 text-[#1f2522] placeholder:text-[#8a938f]/50 transition-colors"
                />
              </div>
              {handles[key]?.trim() && (
                <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex-shrink-0">Active</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-[#8a938f]">
          {configured} of {SOCIAL_PLATFORMS.length} platforms configured
        </p>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="rounded-full px-5 py-2 text-xs font-medium bg-[#1f2522] text-white hover:bg-[#bc6c25] transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save handles"}
          </button>
        </div>
      </div>

      <div className={`${DASH_PANEL_SOFT} p-4 mt-2`}>
        <p className="text-xs text-[#8a938f] leading-relaxed">
          <span className="font-medium text-[#1f2522]">How it works:</span> When a visitor asks about events, workshops, fests, placements, or any updates,
          NavBot searches Google for your social media posts and includes relevant links in the answer.
          Results are cached for 4 hours to stay within the Google Search free tier (100 queries/day).
        </p>
      </div>
    </div>
  );
}
