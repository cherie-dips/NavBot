import { ArrowRight, Mic, RefreshCw, Sparkles } from "lucide-react";
import { CodeSnippet } from "../components/Codesnippet";
import { MarketingWidgetPreview } from "../components/MarketingWidgetPreview";

export interface HomePageProps {
  onViewChange: (view: string) => void;
  onGetStarted: () => void;
}

const steps = [
  {
    step: "01",
    title: "Add one script",
    desc: "Install NavBot with a single embed snippet.",
    icon: Sparkles,
    visual: (
      <div className="relative flex h-full items-center justify-center bg-gradient-to-br from-[#f3dfcb] via-[#fbf7f1] to-[#dfe8f2] p-7">
        <div className="w-full max-w-[220px] rounded-[1.4rem] border border-[#bc6c25]/10 bg-white/90 p-4 shadow-[0_14px_35px_rgba(31,37,34,0.07)]">
          <div className="mb-3 flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-[#f5bf9b]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#d6e1ef]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ddd8cf]" />
          </div>
          <div className="font-mono text-[11px] leading-6">
            <span className="text-[#b27a4a]">&lt;script</span>
            <span className="text-[#456a92]"> src</span>
            <span className="text-[#8a938f]">=</span>
            <span className="text-[#bc6c25]">"cdn.navbot..."</span>
            <span className="text-[#b27a4a]">&gt;</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    step: "02",
    title: "Sync your content",
    desc: "We crawl pages, docs, FAQs, and fresh website updates.",
    icon: RefreshCw,
    visual: (
      <div className="relative flex h-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#edf2f7] to-[#f5eee4] p-8">
        <div className="absolute inset-x-10 top-10 h-2 rounded-full shimmer-line opacity-70" />
        <div className="relative w-44 rounded-[1.3rem] border border-[#456a92]/10 bg-white p-6 shadow-[0_14px_35px_rgba(31,37,34,0.07)]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute inset-0 rounded-[1.3rem] border border-[#456a92]/18 animate-ping"
              style={{ animationDelay: `${i * 0.35}s`, animationDuration: "2.2s" }}
            />
          ))}
          <div className="relative space-y-3">
            <div className="h-2 w-4/5 rounded bg-[#ebe6de]" />
            <div className="h-2 w-3/5 rounded bg-[#456a92]/35" />
            <div className="h-2 w-full rounded bg-[#ebe6de]" />
            <div className="h-2 w-2/3 rounded bg-[#bc6c25]/55" />
          </div>
        </div>
      </div>
    ),
  },
  {
    step: "03",
    title: "Answer in text or voice",
    desc: "Visitors get grounded responses instantly, including voice playback.",
    icon: Mic,
    visual: (
      <div className="relative flex h-full items-center justify-center bg-gradient-to-br from-[#e7eef6] via-[#fbf7f1] to-[#f5e2d0] p-7">
        <div className="w-full max-w-[230px] rounded-[1.3rem] border border-[#456a92]/10 bg-white/92 p-4 shadow-[0_14px_35px_rgba(31,37,34,0.07)] backdrop-blur">
          <div className="mb-3 flex items-start gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#bc6c25] text-[11px] font-bold text-white">
              N
            </div>
            <div className="flex-1 rounded-xl rounded-tl-sm bg-[#f8f4ee] px-3 py-2 text-[11px] text-[#1f2522]">
              I can answer pricing, support, or onboarding questions.
            </div>
          </div>
          <div className="ml-9 flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#7f8d88]" />
            <div className="delay-150 h-1.5 w-1.5 animate-bounce rounded-full bg-[#7f8d88]" />
            <div className="delay-300 h-1.5 w-1.5 animate-bounce rounded-full bg-[#7f8d88]" />
          </div>
        </div>
      </div>
    ),
  },
];

export const HomePage = ({ onViewChange, onGetStarted }: HomePageProps) => {
  return (
    <div className="animate-fade-in-up bg-[#f8f4ee] text-[#1f2522]">
      <section className="relative overflow-hidden pt-36 pb-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="hero-mesh absolute inset-x-0 top-0 h-[760px]" />
          <div className="hero-grid absolute inset-0 opacity-35" />
          <div className="marketing-noise absolute inset-0 opacity-20" />
          <div className="hero-orb hero-orb-one" />
          <div className="hero-orb hero-orb-two" />
          <div className="hero-orb hero-orb-three" />
        </div>

        <div className="container relative z-10 mx-auto px-6">
          <div className="mx-auto max-w-6xl text-center">

            <div className="mx-auto mt-8 max-w-5xl text-[3.2rem] font-light leading-[0.92] tracking-[-0.065em] text-[#1f2522] md:text-[5.2rem] lg:text-[6.1rem]">
              <div>Turn any website</div>
              <div className="mt-1 text-[#bc6c25]">
                <span className="hero-typing-line">
                  <span className="hero-typing-full">into a conversation.</span>
                </span>
              </div>
            </div>


            {/* <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
              <button
                onClick={onGetStarted}
                className="inline-flex items-center justify-center gap-3 rounded-full bg-[#1f2522] px-7 py-4 text-sm font-semibold text-white shadow-[0_20px_45px_rgba(31,37,34,0.16)] hover:-translate-y-0.5 hover:bg-[#bc6c25]"
              >
                Get started
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => onViewChange("features")}
                className="inline-flex items-center justify-center gap-3 rounded-full border border-[#1f2522]/10 bg-white/80 px-7 py-4 text-sm font-semibold text-[#1f2522] shadow-[0_10px_30px_rgba(31,37,34,0.05)] backdrop-blur hover:border-[#bc6c25]/40 hover:text-[#bc6c25]"
              >
                Explore features
              </button>
            </div> */}

            <div className="mx-auto mt-16 grid max-w-6xl gap-5 lg:grid-cols-[1.08fr_0.92fr]">
              <MarketingWidgetPreview />
              <CodeSnippet />
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative py-24">
        <div className="container mx-auto px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-6 text-4xl font-light tracking-[-0.04em] text-[#1f2522] md:text-5xl">
              How it <span className="font-display italic text-[#bc6c25]">works</span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-[#65726d]">
              Install once, let NavBot index your website, and start answering visitors in grounded text and voice.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.step} className="group relative">
                <div className="h-full rounded-[2rem] border border-white/90 bg-[#fbf8f3]/80 p-2 shadow-[0_18px_40px_rgba(31,37,34,0.05)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(31,37,34,0.08)]">
                  <div className="relative mb-6 h-52 overflow-hidden rounded-[1.5rem]">
                    {item.visual}
                    <div className="absolute left-4 top-4 rounded-full bg-white/76 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#bc6c25] backdrop-blur">
                      {item.step}
                    </div>
                  </div>
                  <div className="px-6 pb-8 text-left">
                    <div className="mb-4 grid h-10 w-10 place-items-center rounded-2xl bg-[#f6eee3] text-[#bc6c25]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="mb-3 text-2xl font-semibold tracking-[-0.03em] text-[#1f2522]">
                      {item.title}
                    </h3>
                    <p className="leading-relaxed text-[#65726d]">{item.desc}</p>
                  </div>
                </div>
              </div>
            )})}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 bg-[#1f2522]" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute left-[12%] top-[18%] h-[340px] w-[340px] rounded-full bg-[#bc6c25] opacity-18 blur-[110px]" />
          <div className="absolute bottom-[10%] right-[12%] h-[320px] w-[320px] rounded-full bg-[#dbe5f1] opacity-16 blur-[110px]" />
        </div>

        <div className="container relative z-10 mx-auto px-6 text-center">
          <h2 className="mx-auto max-w-4xl text-4xl font-light leading-tight tracking-[-0.05em] text-white md:text-6xl">
            Ready to make your website
            <br />
            <span className="font-display italic text-[#f2d2b4]">feel more helpful?</span>
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#d0d8d4] md:text-xl">
            Launch NavBot with one script, keep answers grounded in your content, and give visitors a faster way to find what they need.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={onGetStarted}
              className="inline-flex items-center justify-center gap-3 rounded-full bg-[#f3e1cf] px-8 py-4 text-base font-semibold text-[#1f2522] shadow-[0_18px_40px_rgba(243,225,207,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-white"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => onViewChange("pricing")}
              className="inline-flex items-center justify-center gap-3 rounded-full border border-white/14 bg-white/8 px-8 py-4 text-base font-semibold text-white backdrop-blur hover:bg-white/12"
            >
              See pricing
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
