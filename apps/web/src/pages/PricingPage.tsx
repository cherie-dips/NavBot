import { useState } from "react";
import {
  Check,
  X,
  Zap,
  Globe,
  MessageSquare,
  BarChart3,
  Mic,
  Users,
  RefreshCw,
  ArrowRight,
  ChevronDown,
} from "lucide-react";

interface PricingPageProps {
  onGetStarted: () => void;
}

const PLANS = [
  {
    id: "free",
    name: "Starter",
    tagline: "Try it out, no card needed",
    monthlyPrice: 0,
    annualPrice: 0,
    color: "#64748b",
    highlight: false,
    cta: "Get started free",
    features: [
      { label: "1 website", included: true },
      { label: "50 pages indexed", included: true },
      { label: "500 conversations / mo", included: true },
      { label: "Text chat only", included: true },
      { label: "NavBot branding", included: true },
      { label: "Voice input & TTS", included: false },
      { label: "Analytics dashboard", included: false },
      { label: "Custom widget theme", included: false },
      { label: "Smart sync (sitemap)", included: false },
      { label: "Priority support", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For growing businesses",
    monthlyPrice: 29,
    annualPrice: 19,
    color: "#478EDB",
    highlight: true,
    cta: "Start 14-day trial",
    badge: "Most popular",
    features: [
      { label: "5 websites", included: true },
      { label: "Unlimited pages indexed", included: true },
      { label: "10,000 conversations / mo", included: true },
      { label: "Text chat + voice", included: true },
      { label: "Remove NavBot branding", included: true },
      { label: "Voice input & TTS", included: true },
      { label: "Analytics dashboard", included: true },
      { label: "Custom widget theme", included: true },
      { label: "Smart sync (sitemap)", included: true },
      { label: "Priority support", included: false },
    ],
  },
  {
    id: "team",
    name: "Team",
    tagline: "For agencies & power users",
    monthlyPrice: 79,
    annualPrice: 59,
    color: "#8691CA",
    highlight: false,
    cta: "Start 14-day trial",
    features: [
      { label: "Unlimited websites", included: true },
      { label: "Unlimited pages indexed", included: true },
      { label: "Unlimited conversations", included: true },
      { label: "Text chat + voice", included: true },
      { label: "Remove NavBot branding", included: true },
      { label: "Voice input & TTS", included: true },
      { label: "Analytics dashboard", included: true },
      { label: "Custom widget theme", included: true },
      { label: "Smart sync (sitemap)", included: true },
      { label: "Priority support", included: true },
    ],
  },
];

const FAQS = [
  {
    q: "Can I cancel anytime?",
    a: "Yes. You can cancel your subscription at any time from your dashboard settings. You'll retain access until the end of your billing period — no penalties, no questions.",
  },
  {
    q: "What counts as a conversation?",
    a: "A conversation is a single session between a visitor and your NavBot — from the first message until they close the chat or it times out after 30 minutes of inactivity.",
  },
  {
    q: "How does the 14-day trial work?",
    a: "You get full access to your chosen plan for 14 days with no credit card required. At the end of the trial you'll be asked to add a payment method to continue — or you can downgrade to Starter for free.",
  },
  {
    q: "What happens if I exceed my conversation limit?",
    a: "The chatbot keeps working but you'll get an email notification when you hit 80% of your limit. If you hit 100%, new conversations will be paused until the next billing cycle or until you upgrade.",
  },
  {
    q: "Can I use NavBot on multiple domains?",
    a: "Yes — each website you add is tracked separately. Pro allows up to 5 websites, Team is unlimited.",
  },
  {
    q: "Do you support Indian languages?",
    a: "Yes. NavBot uses Sarvam AI under the hood which has native support for Hindi, Tamil, Telugu, Bengali, and more Indian languages for both voice input and text-to-speech.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
      >
        <span className="text-sm font-medium text-[#2E3538] group-hover:text-[#478EDB] transition-colors">
          {q}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-48 pb-5" : "max-h-0"}`}
      >
        <p className="text-sm text-slate-500 leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

export const PricingPage = ({ onGetStarted }: PricingPageProps) => {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="animate-fade-in-up min-h-screen bg-[#F9F9FA] pt-24 pb-32 relative overflow-hidden">
      {/* ── Ambient background ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-8%] right-[-4%] w-[600px] h-[600px] bg-[#8EBFF2] opacity-20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-[30%] left-[-8%] w-[500px] h-[500px] bg-[#8691CA] opacity-15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute bottom-[10%] right-[20%] w-[400px] h-[400px] bg-[#478EDB] opacity-10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 container mx-auto px-6 max-w-6xl">

        {/* ── Header ── */}
        <div className="text-center mb-14">
          <h1 className="font-serif text-5xl md:text-6xl font-light text-[#2E3538] mb-5 leading-tight">
            One chatbot, any website.
          </h1>

          {/* ── Annual toggle ── */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <span className={`text-sm font-medium transition-colors ${!annual ? "text-[#2E3538]" : "text-slate-400"}`}>
              Monthly
            </span>
            <button
              type="button"
              onClick={() => setAnnual(!annual)}
              className="relative w-12 h-6 rounded-full transition-colors duration-200"
              style={{ backgroundColor: annual ? "#478EDB" : "#e2e8f0" }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                style={{ left: "2px", transform: annual ? "translateX(22px)" : "translateX(0)" }}
              />
            </button>
            <span className={`text-sm font-medium transition-colors flex items-center gap-2 ${annual ? "text-[#2E3538]" : "text-slate-400"}`}>
              Annual
              <span className="text-[11px] font-semibold text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                Save ~35%
              </span>
            </span>
          </div>
        </div>

        {/* ── Pricing cards ── */}
        <div className="grid md:grid-cols-3 gap-5 mb-20">
          {PLANS.map((plan, i) => {
            const price = annual ? plan.annualPrice : plan.monthlyPrice;
            return (
              <div
                key={plan.id}
                className={`
                  relative flex flex-col rounded-3xl p-8 transition-all duration-300
                  ${plan.highlight
                    ? "bg-[#2E3538] text-white shadow-2xl shadow-[#2E3538]/20 scale-[1.02]"
                    : "bg-white border border-slate-100 shadow-sm hover:shadow-lg hover:border-slate-200"
                  }
                `}
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                {/* Popular badge */}
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#478EDB] text-white shadow-lg shadow-[#478EDB]/30">
                      <Zap className="w-3 h-3" /> {plan.badge}
                    </span>
                  </div>
                )}

                {/* Plan name */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: plan.highlight ? "#478EDB" : plan.color }}
                    />
                    <span className={`text-xs font-bold uppercase tracking-widest ${plan.highlight ? "text-slate-400" : "text-slate-400"}`}>
                      {plan.name}
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${plan.highlight ? "text-slate-400" : "text-slate-500"}`}>
                    {plan.tagline}
                  </p>
                </div>

                {/* Price */}
                <div className="mb-8">
                  <div className="flex items-end gap-1">
                    <span className={`text-5xl font-light font-serif ${plan.highlight ? "text-white" : "text-[#2E3538]"}`}>
                      {price === 0 ? "Free" : `$${price}`}
                    </span>
                    {price > 0 && (
                      <span className={`text-sm mb-2 ${plan.highlight ? "text-slate-400" : "text-slate-400"}`}>
                        / mo{annual ? " · billed annually" : ""}
                      </span>
                    )}
                  </div>
                  {plan.id !== "free" && annual && (
                    <p className="text-xs text-green-400 mt-1 font-medium">
                      Save ${(plan.monthlyPrice - plan.annualPrice) * 12}/year vs monthly
                    </p>
                  )}
                </div>

                {/* CTA */}
                <button
                  onClick={onGetStarted}
                  className={`
                    w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold
                    transition-all duration-200 mb-8 group
                    ${plan.highlight
                      ? "bg-[#478EDB] text-white hover:bg-[#3b7ac2] shadow-lg shadow-[#478EDB]/30"
                      : "bg-[#F9F9FA] text-[#2E3538] border border-slate-200 hover:border-[#478EDB]/40 hover:bg-[#478EDB]/5 hover:text-[#478EDB]"
                    }
                  `}
                >
                  {plan.cta}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>

                {/* Divider */}
                <div className={`h-px mb-6 ${plan.highlight ? "bg-white/10" : "bg-slate-100"}`} />

                {/* Features */}
                <ul className="space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature.label} className="flex items-center gap-3">
                      {feature.included ? (
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: plan.highlight ? "#478EDB20" : plan.color + "15" }}
                        >
                          <Check
                            className="w-2.5 h-2.5"
                            style={{ color: plan.highlight ? "#478EDB" : plan.color }}
                          />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100">
                          <X className="w-2.5 h-2.5 text-slate-300" />
                        </div>
                      )}
                      <span
                        className={`text-sm ${
                          feature.included
                            ? plan.highlight ? "text-slate-200" : "text-slate-600"
                            : plan.highlight ? "text-slate-600" : "text-slate-300"
                        }`}
                      >
                        {feature.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* ── Feature comparison strip ── */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-20">
          <div className="px-8 py-6 border-b border-slate-100">
            <h2 className="font-serif text-xl font-light text-[#2E3538]">Everything included</h2>
            <p className="text-sm text-slate-400 mt-1">A closer look at what powers NavBot</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {[
              {
                icon: Globe,
                color: "#478EDB",
                title: "Smart crawling",
                desc: "NavBot indexes your entire site — pages, PDFs, tables — and updates automatically via sitemap sync.",
              },
              {
                icon: MessageSquare,
                color: "#8691CA",
                title: "RAG-powered answers",
                desc: "Every answer is grounded in your actual website content. No hallucinations, no off-topic replies.",
              },
              {
                icon: Mic,
                color: "#478EDB",
                title: "Voice + Indian languages",
                desc: "Visitors can speak in Hindi, Tamil, Telugu and more. Powered by Sarvam AI's saaras:v3.",
              },
              {
                icon: RefreshCw,
                color: "#8691CA",
                title: "Auto sync",
                desc: "Update your website? NavBot detects changes via sitemap and re-indexes only what changed.",
              },
              {
                icon: BarChart3,
                color: "#478EDB",
                title: "Visitor analytics",
                desc: "See exactly what visitors ask, which questions go unanswered, and how to improve your content.",
              },
              {
                icon: Users,
                color: "#8691CA",
                title: "Multi-site support",
                desc: "One account to manage all your websites. Switch between them instantly from the dashboard.",
              },
            ].map((feat) => {
              const Icon = feat.icon;
              return (
                <div key={feat.title} className="p-7 hover:bg-[#F9F9FA] transition-colors">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: feat.color + "15" }}
                  >
                    <Icon className="w-4 h-4" style={{ color: feat.color }} />
                  </div>
                  <h3 className="text-sm font-semibold text-[#2E3538] mb-2">{feat.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Social proof strip ── */}
        <div className="text-center mb-20">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-6">
            Trusted by teams at
          </p>
          <div className="flex items-center justify-center gap-10 flex-wrap">
            {["Plaksha University", "LeapAI", "Your site next →"].map((name, i) => (
              <span
                key={name}
                className={`text-sm font-medium ${
                  i === 2 ? "text-[#478EDB] italic" : "text-slate-400"
                }`}
              >
                {name}
              </span>
            ))}
          </div>
        </div>

        {/* ── FAQ ── */}
        <div className="grid lg:grid-cols-5 gap-12 mb-20">
          <div className="lg:col-span-2">
            <div className="sticky top-24">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#478EDB] mb-3">FAQ</p>
              <h2 className="font-serif text-3xl font-light text-[#2E3538] leading-snug mb-4">
                Questions you might have
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Can't find your answer? Email us at{" "}
                <a href="mailto:hello@navbot.ai" className="text-[#478EDB] hover:underline">
                  hello@navbot.ai
                </a>
              </p>
            </div>
          </div>

          <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-100 shadow-sm px-8">
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>

        {/* ── Bottom CTA ── */}
        <div className="relative rounded-3xl overflow-hidden">
          <div className="absolute inset-0 bg-[#2E3538]" />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-20%] right-[-5%] w-96 h-96 bg-[#478EDB] opacity-20 rounded-full blur-[80px]" />
            <div className="absolute bottom-[-20%] left-[10%] w-80 h-80 bg-[#8691CA] opacity-20 rounded-full blur-[80px]" />
          </div>
          <div className="relative z-10 px-8 py-16 text-center">
            <h2 className="font-serif text-4xl md:text-5xl font-light text-white mb-4 leading-tight">
              Your website deserves a
              <br />
              <span className="italic text-[#8EBFF2]">smarter assistant.</span>
            </h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto font-light leading-relaxed">
              Set up in under 5 minutes. One script tag. No backend changes needed.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onGetStarted}
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#478EDB] text-white text-sm font-semibold hover:bg-[#3b7ac2] transition-all duration-200 shadow-xl shadow-[#478EDB]/30 hover:-translate-y-0.5"
              >
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