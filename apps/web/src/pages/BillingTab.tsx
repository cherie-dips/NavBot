/**
 * BillingTab — drop inside DashboardPage's tab switch.
 *
 * Shows the user's current plan + usage, lets them upgrade/downgrade,
 * and routes to MockPaymentPage for any paid plan selection.
 *
 * Usage inside DashboardPage:
 *   1. Add "billing" to the TABS array
 *   2. Render <BillingTab onUpgrade={...} /> in the tab switch
 *   3. In App.tsx / DashboardPage, pass onUpgrade that sets currentView="pricing"
 *      OR handle payment inline by swapping to <MockPaymentPage />
 */

import { useState } from "react";
import {
  Zap, CheckCircle2, ArrowRight, AlertCircle,
  CreditCard, Calendar, RefreshCw, X, Globe,
  MessageSquare, Mic, BarChart3,
} from "lucide-react";
import { MockPaymentPage, type PlanInfo } from "./Mockpaymentpage";

/* ─── Plan catalogue (mirrors PricingPage) ─────────────────────────────── */

const PLANS: Array<
  PlanInfo & {
    highlight: boolean;
    badge?: string;
    tagline: string;
    allFeatures: Array<{ label: string; included: boolean }>;
  }
> = [
  {
    id: "free",
    name: "Starter",
    tagline: "Free forever",
    price: 0,
    annualPrice: 0,
    billing: "monthly",
    color: "#64748b",
    highlight: false,
    features: ["1 website", "50 pages indexed", "500 conversations / mo", "Text chat only"],
    allFeatures: [
      { label: "1 website", included: true },
      { label: "50 pages indexed", included: true },
      { label: "500 conversations / mo", included: true },
      { label: "Text chat", included: true },
      { label: "Voice input & TTS", included: false },
      { label: "Analytics dashboard", included: false },
      { label: "Custom widget theme", included: false },
      { label: "Smart sync", included: false },
      { label: "Priority support", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For growing businesses",
    price: 29,
    annualPrice: 19,
    billing: "monthly",
    color: "#478EDB",
    highlight: true,
    badge: "Most popular",
    features: ["5 websites", "Unlimited pages", "10,000 conversations / mo", "Voice + analytics"],
    allFeatures: [
      { label: "5 websites", included: true },
      { label: "Unlimited pages indexed", included: true },
      { label: "10,000 conversations / mo", included: true },
      { label: "Text chat + voice", included: true },
      { label: "Voice input & TTS", included: true },
      { label: "Analytics dashboard", included: true },
      { label: "Custom widget theme", included: true },
      { label: "Smart sync", included: true },
      { label: "Priority support", included: false },
    ],
  },
  {
    id: "team",
    name: "Team",
    tagline: "For agencies & power users",
    price: 79,
    annualPrice: 59,
    billing: "monthly",
    color: "#8691CA",
    highlight: false,
    features: ["Unlimited websites", "Unlimited everything", "Priority support"],
    allFeatures: [
      { label: "Unlimited websites", included: true },
      { label: "Unlimited pages indexed", included: true },
      { label: "Unlimited conversations", included: true },
      { label: "Text chat + voice", included: true },
      { label: "Voice input & TTS", included: true },
      { label: "Analytics dashboard", included: true },
      { label: "Custom widget theme", included: true },
      { label: "Smart sync", included: true },
      { label: "Priority support", included: true },
    ],
  },
];

/* ─── Mock billing history ──────────────────────────────────────────────── */

const MOCK_INVOICES = [
  { id: "INV-2026-003", date: "Mar 1, 2026",  amount: "$29.00", status: "Paid"    },
  { id: "INV-2026-002", date: "Feb 1, 2026",  amount: "$29.00", status: "Paid"    },
  { id: "INV-2026-001", date: "Jan 1, 2026",  amount: "$29.00", status: "Paid"    },
  { id: "INV-2025-012", date: "Dec 1, 2025",  amount: "$0.00",  status: "Trial"   },
];

/* ─── UsageBar ──────────────────────────────────────────────────────────── */

function UsageBar({ label, used, max, color }: { label: string; used: number; max: number | null; color: string }) {
  const pct = max ? Math.min((used / max) * 100, 100) : 10;
  const isUnlimited = max === null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500 font-medium">{label}</span>
        <span className="text-[#2E3538] font-semibold">
          {isUnlimited ? "Unlimited" : `${used.toLocaleString()} / ${max!.toLocaleString()}`}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: pct > 85 ? "#ef4444" : color }}
        />
      </div>
    </div>
  );
}

/* ─── Main BillingTab component ─────────────────────────────────────────── */

interface BillingTabProps {
  /** Called after successful payment to navigate away (e.g. back to overview) */
  onPlanActivated?: (planId: string) => void;
}

export function BillingTab({ onPlanActivated }: BillingTabProps) {
  // In a real app this would come from the backend / session
  const [currentPlanId, setCurrentPlanId] = useState<string>("pro");
  const [annual, setAnnual] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<PlanInfo | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const currentPlan = PLANS.find((p) => p.id === currentPlanId) ?? PLANS[0]!;
  const nextBilling = "April 1, 2026";

  // ── Checkout flow ────────────────────────────────────────────────────────
  if (checkoutPlan) {
    return (
      <MockPaymentPage
        plan={{ ...checkoutPlan, billing: annual ? "yearly" : "monthly" }}
        onBack={() => setCheckoutPlan(null)}
        onSuccess={(planId) => {
          setCurrentPlanId(planId);
          setCheckoutPlan(null);
          onPlanActivated?.(planId);
        }}
      />
    );
  }

  // ── Cancelled state ──────────────────────────────────────────────────────
  if (cancelled) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-[#2E3538] mb-2">Subscription cancelled</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
            Your plan has been downgraded to Starter. You'll keep Pro access until {nextBilling}.
          </p>
          <button
            onClick={() => { setCancelled(false); setCurrentPlanId("free"); }}
            className="px-6 py-2.5 rounded-xl bg-[#F9F9FA] border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Back to billing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Current plan card ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Current Plan</p>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-[#2E3538]">NavBot {currentPlan.name}</h2>
              {currentPlan.id !== "free" && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: currentPlan.color }}>
                  Active
                </span>
              )}
            </div>
          </div>
          {currentPlan.id !== "free" && (
            <div className="text-right">
              <p className="text-2xl font-light text-[#2E3538]">${currentPlan.price}<span className="text-sm text-slate-400">/mo</span></p>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center justify-end gap-1">
                <Calendar className="w-3 h-3" /> Next billing {nextBilling}
              </p>
            </div>
          )}
        </div>

        {/* Usage meters */}
        <div className="px-6 py-5 grid md:grid-cols-3 gap-5">
          <UsageBar
            label="Conversations this month"
            used={2847}
            max={currentPlan.id === "free" ? 500 : currentPlan.id === "pro" ? 10000 : null}
            color={currentPlan.color}
          />
          <UsageBar
            label="Pages indexed"
            used={124}
            max={currentPlan.id === "free" ? 50 : null}
            color={currentPlan.color}
          />
          <UsageBar
            label="Active websites"
            used={3}
            max={currentPlan.id === "free" ? 1 : currentPlan.id === "pro" ? 5 : null}
            color={currentPlan.color}
          />
        </div>

        {/* Features summary */}
        <div className="px-6 pb-5">
          <div className="flex flex-wrap gap-2">
            {currentPlan.allFeatures.filter((f) => f.included).map((f) => (
              <span key={f.label} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-[#F9F9FA] border border-slate-100 text-slate-600">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        {currentPlan.id !== "free" && (
          <div className="px-6 pb-5 flex items-center gap-3">
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1.5"
            >
              <X className="w-3 h-3" /> Cancel subscription
            </button>
            <span className="text-slate-200">·</span>
            <button className="text-xs text-slate-400 hover:text-[#478EDB] transition-colors flex items-center gap-1.5">
              <CreditCard className="w-3 h-3" /> Update payment method
            </button>
          </div>
        )}
      </div>

      {/* ── Cancel confirm modal ── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 relative">
            <button type="button" onClick={() => setShowCancelConfirm(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center mb-4">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <h3 className="text-base font-semibold text-[#2E3538] mb-2">Cancel subscription?</h3>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              You'll keep Pro access until <strong>{nextBilling}</strong>, then be downgraded to the free Starter plan.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Keep plan
              </button>
              <button
                onClick={() => { setShowCancelConfirm(false); setCancelled(true); }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Yes, cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upgrade / switch plans ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#2E3538]">
            {currentPlan.id === "free" ? "Upgrade your plan" : "Switch plan"}
          </h3>
          {/* Annual toggle */}
          <div className="flex items-center gap-3 text-xs">
            <span className={`font-medium transition-colors ${!annual ? "text-[#2E3538]" : "text-slate-400"}`}>Monthly</span>
            <button type="button" onClick={() => setAnnual(!annual)}
              className="relative w-9 h-5 rounded-full transition-colors duration-200"
              style={{ backgroundColor: annual ? "#478EDB" : "#e2e8f0" }}>
              <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
                style={{ left: "2px", transform: annual ? "translateX(16px)" : "translateX(0)" }} />
            </button>
            <span className={`font-medium transition-colors flex items-center gap-1.5 ${annual ? "text-[#2E3538]" : "text-slate-400"}`}>
              Annual
              <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full font-bold">~35% off</span>
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const price = annual ? plan.annualPrice : plan.price;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-5 transition-all duration-200 ${
                  isCurrent
                    ? "border-2 bg-[#478EDB]/5"
                    : plan.highlight
                    ? "border border-[#478EDB]/30 bg-white hover:border-[#478EDB]/60 hover:shadow-lg hover:shadow-[#478EDB]/5"
                    : "border border-slate-100 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
                style={isCurrent ? { borderColor: plan.color } : {}}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full text-white" style={{ backgroundColor: plan.color }}>
                      <CheckCircle2 className="w-3 h-3" /> Current
                    </span>
                  </div>
                )}
                {plan.badge && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#478EDB] text-white">
                      <Zap className="w-3 h-3" /> {plan.badge}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{plan.name}</p>
                    <div className="flex items-end gap-1 mt-1">
                      <span className="text-2xl font-light text-[#2E3538]">
                        {price === 0 ? "Free" : `$${price}`}
                      </span>
                      {price > 0 && <span className="text-xs text-slate-400 mb-0.5">/mo</span>}
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: plan.color + "15" }}>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: plan.color }} />
                  </div>
                </div>

                <div className="space-y-1.5 mb-4">
                  {plan.allFeatures.slice(0, 5).map((f) => (
                    <div key={f.label} className="flex items-center gap-2 text-xs">
                      {f.included
                        ? <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                        : <X className="w-3 h-3 text-slate-300 flex-shrink-0" />
                      }
                      <span className={f.included ? "text-slate-600" : "text-slate-300"}>{f.label}</span>
                    </div>
                  ))}
                </div>

                {isCurrent ? (
                  <div className="w-full py-2 rounded-xl text-xs font-semibold text-center border" style={{ color: plan.color, borderColor: plan.color + "40", backgroundColor: plan.color + "08" }}>
                    Current plan
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (plan.id === "free") {
                        // Downgrade to free: just show cancel confirm
                        setShowCancelConfirm(true);
                      } else {
                        setCheckoutPlan(plan);
                      }
                    }}
                    className="w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 group transition-all duration-200"
                    style={{
                      backgroundColor: plan.highlight ? "#478EDB" : plan.color + "12",
                      color: plan.highlight ? "white" : plan.color,
                    }}
                  >
                    {plan.id === "free" ? "Downgrade" : currentPlan.id === "free" ? "Upgrade" : "Switch"}
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Billing history ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#2E3538]">Billing History</h3>
          <button className="text-xs text-[#478EDB] hover:underline flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Download all
          </button>
        </div>
        <div className="divide-y divide-slate-50">
          {MOCK_INVOICES.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-[#F9F9FA] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#2E3538]">{inv.id}</p>
                  <p className="text-xs text-slate-400">{inv.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-[#2E3538]">{inv.amount}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  inv.status === "Paid" ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"
                }`}>
                  {inv.status}
                </span>
                <button className="text-xs text-[#478EDB] hover:underline">PDF</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature icons strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Globe,         color: "#478EDB", label: "Smart crawling"    },
          { icon: MessageSquare, color: "#8691CA", label: "RAG answers"       },
          { icon: Mic,           color: "#478EDB", label: "Voice support"     },
          { icon: BarChart3,     color: "#8691CA", label: "Analytics"         },
        ].map((feat) => {
          const Icon = feat.icon;
          return (
            <div key={feat.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: feat.color + "15" }}>
                <Icon className="w-4 h-4" style={{ color: feat.color }} />
              </div>
              <p className="text-xs font-medium text-slate-600">{feat.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}