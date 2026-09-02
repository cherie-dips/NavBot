import { useState, useEffect } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Brain,
  Loader2,
  MessageSquare,
  Search,
  TrendingUp,
  Zap,
} from "lucide-react";
import { API_BASE } from "../../lib/api-base";
import { apiFetch } from "../../lib/api-fetch";
import { DASH_PANEL } from "./styles";
import type { DashboardAnalytics, Website } from "./types";

/* ─── ANALYTICS TAB ──────────────────────────────────────────────────────── */

export function AnalyticsTab({ activeSite, analytics, analyticsLoading }: {
  activeSite: Website | null;
  analytics: DashboardAnalytics | null;
  analyticsLoading: boolean;
}) {
  const [faqView, setFaqView] = useState<"analytics" | "faqs" | "training">("analytics");
  const [faqItems, setFaqItems] = useState<
    Array<{
      id?: number;
      label: string;
      question: string;
      answerPreview?: string | null;
      answer?: string | null;
      hasUserAnswer?: boolean;
      userAnswerIsStale?: boolean;
    }>
  >([]);
  const [faqLoading, setFaqLoading] = useState(false);
  const [faqErr, setFaqErr] = useState<string | null>(null);
  const [selectedFaq, setSelectedFaq] = useState<(typeof faqItems)[number] | null>(null);
  const [editedFaqAnswer, setEditedFaqAnswer] = useState("");
  const [savingFaq, setSavingFaq] = useState(false);
  const [faqSaveMsg, setFaqSaveMsg] = useState<string | null>(null);

  const oneLinePreview = (text: string | null | undefined, max = 120): string => {
    const single = (text ?? "").replace(/\s+/g, " ").trim();
    if (!single) return "Answer preview unavailable right now.";
    if (single.length <= max) return single;
    return `${single.slice(0, max).trimEnd()} +more`;
  };

  useEffect(() => {
    if (faqView !== "faqs" || !activeSite) {
      setFaqItems([]);
      setFaqErr(null);
      return;
    }
    setFaqLoading(true);
    setFaqErr(null);
    fetch(`${API_BASE}/api/sites/${encodeURIComponent(activeSite.id)}/faqs?includeAnswers=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body: {
        faqs?: Array<{
          id?: number;
          label: string;
          question: string;
          answerPreview?: string | null;
          answer?: string | null;
          hasUserAnswer?: boolean;
          userAnswerIsStale?: boolean;
        }>;
      }) => {
        setFaqItems(body.faqs ?? []);
        setSelectedFaq((prev) => {
          if (!prev?.id) return prev;
          const next = (body.faqs ?? []).find((f) => f.id === prev.id) ?? null;
          if (next) setEditedFaqAnswer(next.answer ?? next.answerPreview ?? "");
          return next;
        });
      })
      .catch(() => setFaqErr("Could not load FAQs."))
      .finally(() => setFaqLoading(false));
  }, [faqView, activeSite?.id]);

  const saveFaqAnswer = async () => {
    if (!activeSite || !selectedFaq?.id || !editedFaqAnswer.trim()) return;
    setSavingFaq(true);
    setFaqSaveMsg(null);
    try {
      const res = await apiFetch(
        `${API_BASE}/api/sites/${encodeURIComponent(activeSite.id)}/faqs/${selectedFaq.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: editedFaqAnswer.trim() }),
        }
      );
      if (!res.ok) throw new Error();
      const saved = editedFaqAnswer.trim();
      setFaqItems((prev) =>
        prev.map((f) =>
          f.id === selectedFaq.id
            ? {
                ...f,
                answer: saved,
                answerPreview: saved,
                hasUserAnswer: true,
                userAnswerIsStale: false,
              }
            : f
        )
      );
      setSelectedFaq((prev) =>
        prev ? { ...prev, answer: saved, answerPreview: saved, hasUserAnswer: true, userAnswerIsStale: false } : prev
      );
      setFaqSaveMsg("Saved. Future answers to this FAQ will follow your feedback unless content changes.");
    } catch {
      setFaqSaveMsg("Could not save this response. Please try again.");
    } finally {
      setSavingFaq(false);
    }
  };

  const vol = analytics?.volumeByDay?.length
    ? analytics.volumeByDay
    : Array.from({ length: 7 }, (_, i) => ({
        date: `p${i}`,
        dayLabel: ["S", "M", "T", "W", "T", "F", "S"][i]!,
        count: 0,
      }));
  const maxBar = Math.max(...vol.map((d) => d.count), 1);
  const avgMs = analytics?.totals.avgLatencyMs;
  const avgStr = analyticsLoading && !analytics ? "…" : avgMs != null ? `${(avgMs / 1000).toFixed(1)}s avg` : "—";
  const top = analytics?.topQueries ?? [];
  const ctx = analytics?.context;

  return (
    <div className="space-y-6">
      <div className="flex w-fit gap-1 rounded-xl border border-[#1f2522]/8 bg-[#f3eee7] p-1">
        {(["analytics", "faqs", "training"] as const).map(step => (
          <button key={step} onClick={() => setFaqView(step)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${faqView === step ? "bg-white text-[#1f2522] shadow-sm" : "text-[#8a938f] hover:text-[#5f6b67]"}`}>
            {step === "analytics" && <><BarChart3 className="w-3.5 h-3.5" /> Analytics</>}
            {step === "faqs"      && <><Brain className="w-3.5 h-3.5" /> FAQs</>}
            {step === "training"  && <><Zap className="w-3.5 h-3.5" /> Training</>}
          </button>
        ))}
      </div>

      {faqView === "analytics" && (
        <>
          <div className="grid md:grid-cols-2 gap-5">
            <div className={`${DASH_PANEL} p-6`}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-medium text-[#1f2522]">Chat volume (7 days)</h3>
                <span className="text-xs text-[#8a938f]">{avgStr}</span>
              </div>
              <div className="flex items-end gap-3" style={{ height: "9rem" }}>
                {vol.map((d) => {
                  const barH = Math.max((d.count / maxBar) * 100, d.count > 0 ? 6 : 4);
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end" style={{ height: "100%" }}>
                      <span className="mb-1.5 text-[10px] font-medium text-[#1f2522]">{d.count}</span>
                      <div className="w-full rounded-lg hover:opacity-75 transition-opacity relative group/bar cursor-default"
                        style={{ height: `${barH}%`, minHeight: "4px", background: "linear-gradient(to top, #bc6c25, #ead4bd)" }}>
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#1f2522] px-2 py-1 text-[10px] text-white opacity-0 transition-opacity pointer-events-none group-hover/bar:opacity-100">
                          {d.count}
                        </div>
                      </div>
                      <span className="mt-2 text-[10px] text-[#8a938f]">{d.dayLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`${DASH_PANEL} p-6`}>
              <h3 className="mb-4 text-sm font-medium text-[#1f2522]">Top questions</h3>
              {analyticsLoading && top.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-[#8a938f] py-6">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : top.length === 0 ? (
                <p className="text-xs text-[#8a938f] py-4">No questions logged yet.</p>
              ) : (
                <div className="space-y-1">
                  {top.map((q, i) => (
                    <div key={`${q.query}-${i}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[#fbf7f2]">
                      <span className="w-4 flex-shrink-0 text-xs font-mono text-[#c3baad]">#{i + 1}</span>
                      <p className="flex-1 truncate text-sm text-[#1f2522]">{q.query}</p>
                      <span className="flex-shrink-0 text-[11px] text-[#8a938f]">{q.count}×</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${q.answered ? "text-green-600 bg-green-50" : "text-amber-600 bg-amber-50"}`}>{q.answered ? "Sources" : "No match"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: "Pages indexed", value: ctx?.pagesIndexed ?? 0, icon: Search, color: "#bc6c25" },
              { label: "Turns with page sources", value: analytics?.totals.turnsWithSources ?? 0, icon: ArrowUpRight, color: "#456a92" },
              { label: "Websites in view", value: ctx?.websiteCount ?? 0, icon: TrendingUp, color: "#27C93F" },
            ].map(stat => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className={`${DASH_PANEL} flex items-center gap-4 p-5`}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: stat.color + "15" }}>
                    <Icon className="w-5 h-5" style={{ color: stat.color }} />
                  </div>
                  <div>
                    <p className="text-2xl font-light text-[#1f2522]">
                      {analyticsLoading && !analytics ? "…" : typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
                    </p>
                    <p className="text-xs text-[#8a938f]">{stat.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {faqView === "faqs" && (
        <div className="space-y-3">
          {!activeSite ? (
            <p className="text-sm text-[#65726d]">Select a website to load FAQs generated from its indexed content and popular queries.</p>
          ) : faqLoading ? (
            <div className={`${DASH_PANEL} flex items-center gap-2 p-6 text-sm text-[#8a938f]`}>
              <Loader2 className="w-4 h-4 animate-spin" /> Loading FAQs…
            </div>
          ) : faqErr ? (
            <p className="text-sm text-red-600">{faqErr}</p>
          ) : faqItems.length === 0 ? (
            <p className="text-sm text-[#8a938f]">No FAQs yet. They are created when visitors open the widget or when the API first requests them.</p>
          ) : selectedFaq ? (
            <div className={`${DASH_PANEL} p-6`}>
              <button
                type="button"
                onClick={() => { setSelectedFaq(null); setFaqSaveMsg(null); }}
                className="mb-4 text-xs font-medium text-[#bc6c25] hover:underline"
              >
                ← Back to FAQs
              </button>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#bc6c25]">{selectedFaq.label}</p>
              <h4 className="mb-3 text-base font-semibold text-[#1f2522]">{selectedFaq.question}</h4>
              <div className="mb-5 rounded-xl bg-[#fbf7f2] p-4">
                <p className="mb-2 text-xs font-medium text-[#8a938f]">Current chatbot answer</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-[#47534d]">
                  {selectedFaq.answer?.trim() || selectedFaq.answerPreview?.trim() || "Answer unavailable."}
                </p>
                {selectedFaq.hasUserAnswer && selectedFaq.userAnswerIsStale && (
                  <p className="mt-2 text-xs text-amber-700">
                    Your saved response is currently out of date due to newer indexed content.
                  </p>
                )}
              </div>
              <label className="mb-2 block text-xs font-medium text-[#65726d]">
                Edit chatbot response for this FAQ
              </label>
              <textarea
                value={editedFaqAnswer}
                onChange={(e) => setEditedFaqAnswer(e.target.value)}
                rows={8}
                className="w-full resize-y rounded-xl border border-[#1f2522]/12 bg-white px-4 py-3 text-sm leading-relaxed text-[#1f2522] outline-none focus:border-[#bc6c25]/40"
                placeholder="Write the preferred answer..."
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  disabled={savingFaq || !editedFaqAnswer.trim()}
                  onClick={() => void saveFaqAnswer()}
                  className="rounded-full bg-[#1f2522] px-4 py-2 text-xs font-medium text-white transition-all hover:bg-[#bc6c25] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {savingFaq ? "Saving..." : "Save response"}
                </button>
                {faqSaveMsg && <p className="text-xs text-[#65726d]">{faqSaveMsg}</p>}
              </div>
            </div>
          ) : (
            faqItems.map((faq, i) => (
              <button
                key={`${faq.label}-${i}`}
                type="button"
                onClick={() => {
                  setSelectedFaq(faq);
                  setEditedFaqAnswer(faq.answer ?? faq.answerPreview ?? "");
                  setFaqSaveMsg(null);
                }}
                className={`${DASH_PANEL} flex w-full gap-4 p-5 text-left transition-colors hover:bg-[#fbf7f2]`}
              >
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#f6eee3]"><MessageSquare className="h-4 w-4 text-[#bc6c25]" /></div>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#bc6c25] mb-1">{faq.label}</p>
                  <h4 className="mb-2 text-sm font-semibold text-[#1f2522]">{faq.question}</h4>
                  <p className="text-sm text-[#65726d]">
                    {oneLinePreview(faq.answer ?? faq.answerPreview)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {faqView === "training" && (
        <div className="space-y-5">
          <div className={`${DASH_PANEL} p-8`}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f6eee3]"><Zap className="h-7 w-7 text-[#bc6c25]" /></div>
            <h3 className="mb-2 text-base font-semibold text-[#1f2522] text-center">Knowledge base</h3>
            <p className="mx-auto max-w-md text-sm text-[#8a938f] text-center">
              NavBot does not train a separate model on your traffic. Each reply is retrieved from your crawled pages at question time. These numbers reflect how much real usage and FAQ structure you have accumulated.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Logged chat turns", value: analytics?.totals.totalTurns ?? 0 },
              { label: "FAQ entries", value: analytics?.context.faqCount ?? 0 },
              { label: "Voice turns", value: analytics?.totals.voiceTurns ?? 0 },
            ].map(s => (
              <div key={s.label} className={`${DASH_PANEL} p-5 text-center`}>
                <p className="text-2xl font-light text-[#1f2522]">
                  {analyticsLoading && !analytics ? "…" : s.value.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[#8a938f]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
