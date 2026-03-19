import { useState } from "react";
import {
  CheckCircle2, ArrowLeft, Lock, CreditCard, Sparkles,
  Shield, AlertCircle, Loader2,
} from "lucide-react";

export interface PlanInfo {
  id: string;
  name: string;
  price: number;
  annualPrice: number;
  billing: "monthly" | "yearly";
  color: string;
  features: string[];
}

interface MockPaymentPageProps {
  plan: PlanInfo;
  onBack: () => void;
  onSuccess: (planId: string) => void;
}

const PROCESSING_STEPS = [
  "Verifying card details…",
  "Contacting payment network…",
  "Confirming subscription…",
];

function formatCard(val: string) {
  return val.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}
function formatExpiry(val: string) {
  const clean = val.replace(/\D/g, "").slice(0, 4);
  return clean.length > 2 ? clean.slice(0, 2) + "/" + clean.slice(2) : clean;
}

export function MockPaymentPage({ plan, onBack, onSuccess }: MockPaymentPageProps) {
  const [step, setStep] = useState<"form" | "processing" | "success">("form");
  const [procStep, setProcStep] = useState(0);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalCharged =
    plan.billing === "yearly"
      ? (plan.annualPrice * 12).toFixed(2)
      : plan.price.toFixed(2);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required";
    if (!email.includes("@")) e.email = "Enter a valid email";
    if (cardNumber.replace(/\s/g, "").length < 16) e.card = "Enter a valid 16-digit card number";
    if (expiry.length < 5) e.expiry = "Enter MM/YY";
    if (cvv.length < 3) e.cvv = "Enter 3-digit CVV";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setStep("processing");
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i < PROCESSING_STEPS.length) {
        setProcStep(i);
      } else {
        clearInterval(interval);
        setStep("success");
        setTimeout(() => onSuccess(plan.id), 2200);
      }
    }, 950);
  };

  const [confetti] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 4 + Math.random() * 7,
      color: ["#478EDB", "#8691CA", "#8EBFF2", "#27C93F", "#F59E0B"][Math.floor(Math.random() * 5)],
      delay: Math.random() * 0.8,
    }))
  );

  /* ── SUCCESS ──────────────────────────────────────────────── */
  if (step === "success") {
    return (
      <div className="animate-fade-in-up min-h-screen bg-[#F9F9FA] flex items-center justify-center px-6 pt-20 pb-20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-green-300 opacity-10 rounded-full blur-[130px]" />
        </div>
        {confetti.map((dot) => (
          <div
            key={dot.id}
            className="absolute rounded-full animate-ping pointer-events-none"
            style={{ left: `${dot.x}%`, top: `${dot.y}%`, width: dot.size, height: dot.size, backgroundColor: dot.color, animationDelay: `${dot.delay}s`, animationDuration: "1.6s", opacity: 0.6 }}
          />
        ))}
        <div className="relative z-10 text-center max-w-md w-full">
          <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-green-200/60">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="font-serif text-4xl font-light text-[#2E3538] mb-3">You're all set!</h1>
          <p className="text-slate-500 mb-1">
            Welcome to NavBot <span className="font-semibold text-[#2E3538]">{plan.name}</span>.
          </p>
          <p className="text-sm text-slate-400 mb-8">
            {plan.billing === "yearly" ? `$${totalCharged} billed annually` : `$${totalCharged}/month starting today`}
          </p>
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm text-left space-y-2.5 mb-8">
            {plan.features.slice(0, 5).map((f) => (
              <div key={f} className="flex items-center gap-3 text-sm text-slate-600">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mb-3">Redirecting to your dashboard…</p>
          <div className="flex justify-center">
            <div className="h-1 w-40 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-400 rounded-full" style={{ animation: "pb 2.2s linear forwards" }} />
            </div>
          </div>
          <style>{`@keyframes pb { from{width:0%} to{width:100%} }`}</style>
        </div>
      </div>
    );
  }

  /* ── PROCESSING ───────────────────────────────────────────── */
  if (step === "processing") {
    return (
      <div className="animate-fade-in-up min-h-screen bg-[#F9F9FA] flex items-center justify-center px-6">
        <div className="text-center max-w-sm w-full">
          <div className="relative w-20 h-20 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border-2 border-[#478EDB]/15" />
            <div className="absolute inset-0 rounded-full border-2 border-t-[#478EDB] border-r-[#8691CA] border-b-transparent border-l-transparent animate-spin" style={{ animationDuration: "1s" }} />
            <div className="absolute inset-3 rounded-full bg-white flex items-center justify-center shadow-sm">
              <CreditCard className="w-6 h-6 text-[#478EDB]" />
            </div>
          </div>
          <h2 className="font-serif text-2xl font-light text-[#2E3538] mb-2">Processing payment…</h2>
          <p className="text-sm text-slate-400 mb-8">Please don't close this window</p>
          <div className="space-y-3">
            {PROCESSING_STEPS.map((s, i) => (
              <div key={s} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-500 ${i < procStep ? "bg-green-50 border border-green-100" : i === procStep ? "bg-white border border-[#478EDB]/20 shadow-sm" : "bg-[#F9F9FA] border border-transparent opacity-40"}`}>
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  {i < procStep ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : i === procStep ? <Loader2 className="w-4 h-4 text-[#478EDB] animate-spin" /> : <div className="w-2 h-2 rounded-full bg-slate-300" />}
                </div>
                <span className={`text-sm ${i === procStep ? "text-[#2E3538] font-medium" : i < procStep ? "text-green-700" : "text-slate-400"}`}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── FORM ─────────────────────────────────────────────────── */
  return (
    <div className="animate-fade-in-up min-h-screen bg-[#F9F9FA] pt-20 pb-20 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-5%] right-[-5%] w-[500px] h-[500px] bg-[#8EBFF2] opacity-15 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[400px] h-[400px] bg-[#8691CA] opacity-10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-[#478EDB] transition-colors mb-8 group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to plans
        </button>

        <div className="grid md:grid-cols-5 gap-8">
          {/* Order summary */}
          <div className="md:col-span-2">
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm sticky top-24 space-y-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Order Summary</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: plan.color + "18" }}>
                  <Sparkles className="w-5 h-5" style={{ color: plan.color }} />
                </div>
                <div>
                  <p className="font-semibold text-[#2E3538] text-sm">NavBot {plan.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{plan.billing} billing</p>
                </div>
              </div>
              <div className="space-y-2 pb-4 border-b border-slate-100">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs text-slate-500">
                    <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                {plan.billing === "yearly" ? (
                  <>
                    <div className="flex justify-between text-slate-500">
                      <span>${plan.annualPrice}/mo × 12</span>
                      <span>${(plan.annualPrice * 12).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span>Annual discount</span>
                      <span>−${((plan.price - plan.annualPrice) * 12).toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-slate-500">
                    <span>Monthly plan</span>
                    <span>${plan.price.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-[#2E3538] pt-2 border-t border-slate-100">
                  <span>Total charged today</span>
                  <span>${totalCharged}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400"><Lock className="w-3 h-3 flex-shrink-0" /><span>256-bit TLS encryption</span></div>
              <div className="flex items-center gap-2 text-xs text-slate-400"><Shield className="w-3 h-3 flex-shrink-0" /><span>Cancel anytime. No hidden fees.</span></div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                <p className="text-[11px] text-amber-700 font-medium">🎭 Demo mode — no real charge will be made</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="md:col-span-3">
            <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-9 h-9 rounded-xl bg-[#478EDB]/10 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-[#478EDB]" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#2E3538]">Payment Details</h2>
                  <p className="text-xs text-slate-400">All fields required</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#2E3538] mb-1.5">Full Name</label>
                    <input type="text" placeholder="Jane Smith" value={name} onChange={(e) => setName(e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl bg-[#F9F9FA] border text-sm outline-none transition-all placeholder:text-slate-300 ${errors.name ? "border-red-300 bg-red-50" : "border-slate-200 focus:border-[#478EDB] focus:bg-white"}`} />
                    {errors.name && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#2E3538] mb-1.5">Email</label>
                    <input type="email" placeholder="jane@co.com" value={email} onChange={(e) => setEmail(e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl bg-[#F9F9FA] border text-sm outline-none transition-all placeholder:text-slate-300 ${errors.email ? "border-red-300 bg-red-50" : "border-slate-200 focus:border-[#478EDB] focus:bg-white"}`} />
                    {errors.email && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.email}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#2E3538] mb-1.5">Card Number</label>
                  <div className="relative">
                    <input type="text" placeholder="4242 4242 4242 4242" value={cardNumber} onChange={(e) => setCardNumber(formatCard(e.target.value))}
                      className={`w-full px-4 py-3 pr-20 rounded-xl bg-[#F9F9FA] border text-sm font-mono outline-none transition-all placeholder:text-slate-300 placeholder:font-sans ${errors.card ? "border-red-300 bg-red-50" : "border-slate-200 focus:border-[#478EDB] focus:bg-white"}`} />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1.5">
                      <div className="w-8 h-5 rounded bg-blue-600 flex items-center justify-center"><span className="text-[6px] font-bold text-white">VISA</span></div>
                      <div className="w-8 h-5 rounded bg-slate-100 flex items-center justify-center"><div className="flex"><div className="w-3 h-3 rounded-full bg-red-500" /><div className="w-3 h-3 rounded-full bg-orange-400 -ml-1.5" /></div></div>
                    </div>
                  </div>
                  {errors.card && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.card}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#2E3538] mb-1.5">Expiry Date</label>
                    <input type="text" placeholder="MM/YY" value={expiry} onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      className={`w-full px-4 py-3 rounded-xl bg-[#F9F9FA] border text-sm font-mono outline-none transition-all placeholder:text-slate-300 placeholder:font-sans ${errors.expiry ? "border-red-300 bg-red-50" : "border-slate-200 focus:border-[#478EDB] focus:bg-white"}`} />
                    {errors.expiry && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.expiry}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#2E3538] mb-1.5">CVV</label>
                    <input type="text" placeholder="123" value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      className={`w-full px-4 py-3 rounded-xl bg-[#F9F9FA] border text-sm font-mono outline-none transition-all placeholder:text-slate-300 placeholder:font-sans ${errors.cvv ? "border-red-300 bg-red-50" : "border-slate-200 focus:border-[#478EDB] focus:bg-white"}`} />
                    {errors.cvv && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.cvv}</p>}
                  </div>
                </div>

                <button type="submit" className="w-full py-4 rounded-2xl bg-[#2E3538] text-white text-sm font-semibold hover:bg-[#478EDB] transition-all duration-200 shadow-lg shadow-[#2E3538]/10 hover:shadow-[#478EDB]/20 flex items-center justify-center gap-2 group mt-2">
                  <Lock className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity" />
                  Pay ${totalCharged}{plan.billing === "yearly" ? " / year" : " / month"}
                </button>

                <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                  By completing this purchase you agree to NavBot's{" "}
                  <span className="text-[#478EDB] cursor-pointer hover:underline">Terms of Service</span> and{" "}
                  <span className="text-[#478EDB] cursor-pointer hover:underline">Privacy Policy</span>.
                  You can cancel anytime.
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}