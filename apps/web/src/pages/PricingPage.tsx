import { useState } from "react";
import {
  Check, X, Zap, Globe, MessageSquare, BarChart3,
  Mic, Users, RefreshCw, ArrowRight, ChevronDown,
} from "lucide-react";
import { MockPaymentPage, type PlanInfo } from "./Mockpaymentpage";

interface PricingPageProps {
  onGetStarted: () => void;
  /** Called after a successful mock payment — routes back to dashboard */
  onPaymentSuccess?: (planId: string) => void;
}

const PLAN_DEFS: PlanInfo[] = [
  {
    id: "free",
    name: "Starter",
    price: 0,
    annualPrice: 0,
    billing: "monthly",
    color: "#64748b",
    features: [
      "1 website",
      "50 pages indexed",
      "500 conversations / mo",
      "Text chat only",
      "NavBot branding",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    annualPrice: 19,
    billing: "monthly",
    color: "#478EDB",
    features: [
      "5 websites",
      "Unlimited pages indexed",
      "10,000 conversations / mo",
      "Text chat + voice",
      "Remove NavBot branding",
      "Analytics dashboard",
      "Custom widget theme",
      "Smart sync (sitemap)",
    ],
  },
  {
    id: "team",
    name: "Team",
    price: 79,
    annualPrice: 59,
    billing: "monthly",
    color: "#8691CA",
    features: [
      "Unlimited websites",
      "Unlimited pages indexed",
      "Unlimited conversations",
      "Text chat + voice",
      "Remove NavBot branding",
      "Analytics + visitor insights",
      "Custom widget theme",
      "Smart sync (sitemap)",
      "Priority support",
    ],
  },
];

const ALL_FEATURES = [
  { label: "1 website",                   starter: true,  pro: false, team: false },
  { label: "5 websites",                  starter: false, pro: true,  team: false },
  { label: "Unlimited websites",          starter: false, pro: false, team: true  },
  { label: "50 pages indexed",            starter: true,  pro: false, team: false },
  { label: "Unlimited pages indexed",     starter: false, pro: true,  team: true  },
  { label: "500 conversations / mo",      starter: true,  pro: false, team: false },
  { label: "10,000 conversations / mo",   starter: false, pro: true,  team: false },
  { label: "Unlimited conversations",     starter: false, pro: false, team: true  },
  { label: "Voice input & TTS",           starter: false, pro: true,  team: true  },
  { label: "Analytics dashboard",         starter: false, pro: true,  team: true  },
  { label: "Custom widget theme",         starter: false, pro: true,  team: true  },
  { label: "Smart sync (sitemap)",        starter: false, pro: true,  team: true  },
  { label: "Remove NavBot branding",      starter: false, pro: true,  team: true  },
  { label: "Priority support",            starter: false, pro: false, team: true  },
];

const FAQS = [
  { q: "Can I cancel anytime?", a: "Yes. Cancel at any time from dashboard settings. You retain access until the end of your billing period — no penalties." },
  { q: "What counts as a conversation?", a: "A single visitor session — from the first message until the chat closes or times out after 30 minutes." },
  { q: "How does the 14-day trial work?", a: "Full access to your plan for 14 days, no card required. Add payment at the end or downgrade to Starter free." },
  { q: "What if I exceed my conversation limit?", a: "You'll get an email at 80%. At 100% new conversations pause until the next billing cycle or you upgrade." },
  { q: "Do you support Indian languages?", a: "Yes. NavBot uses Sarvam AI which natively supports Hindi, Tamil, Telugu, Bengali, and more." },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-4 py-5 text-left group">
        <span className="text-sm font-medium text-[#2E3538] group-hover:text-[#478EDB] transition-colors">{q}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? "max-h-48 pb-5" : "max-h-0"}`}>
        <p className="text-sm text-slate-500 leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

export const PricingPage = ({ onGetStarted, onPaymentSuccess }: PricingPageProps) => {
  const [annual, setAnnual] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanInfo | null>(null);

  // If a plan is selected, show payment page
  if (selectedPlan) {
    return (
      <MockPaymentPage
        plan={{ ...selectedPlan, billing: annual ? "yearly" : "monthly" }}
        onBack={() => setSelectedPlan(null)}
        onSuccess={(planId) => {
          setSelectedPlan(null);
          if (onPaymentSuccess) {
            onPaymentSuccess(planId);
          } else {
            onGetStarted();
          }
        }}
      />
    );
  }

  return (
    <div className="animate-fade-in-up min-h-screen bg-[#F9F9FA] pt-24 pb-32 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-8%] right-[-4%] w-[600px] h-[600px] bg-[#8EBFF2] opacity-20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-[30%] left-[-8%] w-[500px] h-[500px] bg-[#8691CA] opacity-15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute bottom-[10%] right-[20%] w-[400px] h-[400px] bg-[#478EDB] opacity-10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 container mx-auto px-6 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-14">
          <h1 className="font-serif text-5xl md:text-6xl font-light text-[#2E3538] mb-5 leading-tight">
            Simple, honest pricing.
          </h1>
          <p className="text-lg text-slate-500 font-light max-w-xl mx-auto">
            Start free. Upgrade when you're ready. Cancel anytime.
          </p>

          {/* Annual toggle */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <span className={`text-sm font-medium transition-colors ${!annual ? "text-[#2E3538]" : "text-slate-400"}`}>Monthly</span>
            <button type="button" onClick={() => setAnnual(!annual)}
              className="relative w-12 h-6 rounded-full transition-colors duration-200"
              style={{ backgroundColor: annual ? "#478EDB" : "#e2e8f0" }}>
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                style={{ left: "2px", transform: annual ? "translateX(22px)" : "translateX(0)" }} />
            </button>
            <span className={`text-sm font-medium flex items-center gap-2 transition-colors ${annual ? "text-[#2E3538]" : "text-slate-400"}`}>
              Annual
              <span className="text-[11px] font-semibold text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">Save ~35%</span>
            </span>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-5 mb-20">
          {PLAN_DEFS.map((plan, i) => {
            const isHighlight = plan.id === "pro";
            const price = annual ? plan.annualPrice : plan.price;
            return (
              <div key={plan.id}
                className={`relative flex flex-col rounded-3xl p-8 transition-all duration-300 ${
                  isHighlight
                    ? "bg-[#2E3538] text-white shadow-2xl shadow-[#2E3538]/20 scale-[1.02]"
                    : "bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:border-slate-200 hover:-translate-y-0.5"
                }`}
                style={{ animationDelay: `${i * 0.08}s` }}>
                {isHighlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#478EDB] text-white shadow-lg shadow-[#478EDB]/30">
                      <Zap className="w-3 h-3" /> Most popular
                    </span>
                  </div>
                )}
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isHighlight ? "#478EDB" : plan.color }} />
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{plan.name}</span>
                  </div>
                </div>

                <div className="mb-8">
                  <div className="flex items-end gap-1">
                    <span className={`text-5xl font-light font-serif ${isHighlight ? "text-white" : "text-[#2E3538]"}`}>
                      {price === 0 ? "Free" : `$${price}`}
                    </span>
                    {price > 0 && (
                      <span className={`text-sm mb-2 ${isHighlight ? "text-slate-400" : "text-slate-400"}`}>
                        /mo{annual ? " · billed annually" : ""}
                      </span>
                    )}
                  </div>
                  {plan.id !== "free" && annual && (
                    <p className="text-xs text-green-400 mt-1 font-medium">
                      Save ${(plan.price - plan.annualPrice) * 12}/year
                    </p>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (plan.id === "free") { onGetStarted(); }
                    else { setSelectedPlan(plan); }
                  }}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 mb-8 group ${
                    isHighlight
                      ? "bg-[#478EDB] text-white hover:bg-[#3b7ac2] shadow-lg shadow-[#478EDB]/30"
                      : "bg-[#F9F9FA] text-[#2E3538] border border-slate-200 hover:border-[#478EDB]/40 hover:bg-[#478EDB]/5 hover:text-[#478EDB]"
                  }`}>
                  {plan.id === "free" ? "Get started free" : "Start 14-day trial"}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>

                <div className={`h-px mb-6 ${isHighlight ? "bg-white/10" : "bg-slate-100"}`} />

                <ul className="space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: isHighlight ? "#478EDB20" : plan.color + "15" }}>
                        <Check className="w-2.5 h-2.5" style={{ color: isHighlight ? "#478EDB" : plan.color }} />
                      </div>
                      <span className={`text-sm ${isHighlight ? "text-slate-200" : "text-slate-600"}`}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Feature grid */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-20">
          <div className="px-8 py-6 border-b border-slate-100">
            <h2 className="font-serif text-xl font-light text-[#2E3538]">Everything included</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {[
              { icon: Globe,         color: "#478EDB", title: "Smart crawling",       desc: "Indexes your entire site — pages, tables, PDFs — and updates via sitemap sync." },
              { icon: MessageSquare, color: "#8691CA", title: "RAG-powered answers",  desc: "Every answer is grounded in your actual website content. No hallucinations." },
              { icon: Mic,           color: "#478EDB", title: "Voice + Indian langs", desc: "Visitors speak in Hindi, Tamil, Telugu & more. Powered by Sarvam AI." },
              { icon: RefreshCw,     color: "#8691CA", title: "Auto sync",            desc: "Detects changes via sitemap and re-indexes only what changed." },
              { icon: BarChart3,     color: "#478EDB", title: "Visitor analytics",    desc: "See what visitors ask, what goes unanswered, and how to improve content." },
              { icon: Users,         color: "#8691CA", title: "Multi-site support",   desc: "One account, unlimited websites. Switch between them instantly." },
            ].map((feat) => {
              const Icon = feat.icon;
              return (
                <div key={feat.title} className="p-7 hover:bg-[#F9F9FA] transition-colors">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: feat.color + "15" }}>
                    <Icon className="w-4 h-4" style={{ color: feat.color }} />
                  </div>
                  <h3 className="text-sm font-semibold text-[#2E3538] mb-2">{feat.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* FAQ */}
        <div className="grid lg:grid-cols-5 gap-12 mb-20">
          <div className="lg:col-span-2">
            <div className="sticky top-24">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#478EDB] mb-3">FAQ</p>
              <h2 className="font-serif text-3xl font-light text-[#2E3538] leading-snug mb-4">Common questions</h2>
              <p className="text-sm text-slate-500">
                Still unsure?{" "}
                <a href="mailto:hello@navbot.ai" className="text-[#478EDB] hover:underline">hello@navbot.ai</a>
              </p>
            </div>
          </div>
          <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-100 shadow-sm px-8">
            {FAQS.map((faq) => <FaqItem key={faq.q} q={faq.q} a={faq.a} />)}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="relative rounded-3xl overflow-hidden">
          <div className="absolute inset-0 bg-[#2E3538]" />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-20%] right-[-5%] w-96 h-96 bg-[#478EDB] opacity-20 rounded-full blur-[80px]" />
            <div className="absolute bottom-[-20%] left-[10%] w-80 h-80 bg-[#8691CA] opacity-20 rounded-full blur-[80px]" />
          </div>
          <div className="relative z-10 px-8 py-16 text-center">
            <h2 className="font-serif text-4xl md:text-5xl font-light text-white mb-4 leading-tight">
              Your website deserves a<br />
              <span className="italic text-[#8EBFF2]">smarter assistant.</span>
            </h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto font-light leading-relaxed">
              Set up in under 5 minutes. One script tag. No backend changes needed.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={onGetStarted}
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#478EDB] text-white text-sm font-semibold hover:bg-[#3b7ac2] transition-all duration-200 shadow-xl shadow-[#478EDB]/30 hover:-translate-y-0.5">
                Start for free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <span className="text-xs text-slate-500">No credit card required</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};