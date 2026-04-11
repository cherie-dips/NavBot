import { BarChart3, Code, Globe, MessageSquare, Mic, RefreshCw } from "lucide-react";

const featureRows = [
  {
    eyebrow: "Brand fit",
    title: "Matches your website automatically",
    description: "NavBot adapts to your colors, type, and spacing so the widget feels native from day one.",
    bullets: ["Theme aware", "No redesign work", "Brand-consistent"],
    visual: (
      <div className="relative h-[340px] w-full overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#f3dfcb]/80 via-[#fbf7f1] to-[#dfe8f2]/95">
        <div className="absolute left-12 top-12 h-40 w-40 animate-pulse rounded-full bg-[#bc6c25]/20 blur-3xl" />

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-64 animate-float rounded-2xl border border-white/90 bg-white/95 p-7 shadow-xl">
            <Code className="mb-4 h-8 w-8 text-[#bc6c25]" />
            <p className="mb-3 text-sm font-semibold text-[#1f2522]">Theme detected</p>

            <div className="space-y-2">
              <div className="h-2 w-4/5 rounded bg-[#bc6c25]/35" />
              <div className="h-2 w-3/5 rounded bg-[#456a92]/30" />
              <div className="h-2 w-full rounded bg-[#ece7df]" />
            </div>
          </div>
        </div>

        <div className="animate-float absolute bottom-6 left-6 rounded-full bg-white/85 px-3 py-1 text-xs text-[#8d6c49] shadow">
          warm neutral
        </div>
        <div className="animate-float delay-300 absolute right-6 top-6 rounded-full bg-white/85 px-3 py-1 text-xs text-[#6a819a] shadow">
          brand aware
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Knowledge",
    title: "Indexes pages, docs, and FAQs fast",
    description: "Your site becomes searchable context for grounded answers, without extra authoring work.",
    bullets: ["Page crawling", "FAQ coverage", "Instant retrieval"],
    visual: (
      <div className="relative h-[340px] w-full overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#e8eef5]/90 via-[#fbf7f1] to-[#f4e2d0]/90">
        <div className="absolute inset-x-0 h-1 bg-[#456a92]/55 animate-scan" />

        {[...Array(7)].map((_, i) => (
          <div
            key={i}
            className="absolute h-2 w-2 animate-ping rounded-full bg-[#d6e1ef] opacity-80"
            style={{
              top: `${40 + i * 35}px`,
              left: `${40 + i * 30}px`,
              animationDelay: `${i * 0.4}s`,
            }}
          />
        ))}

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-64 rounded-2xl border border-white/90 bg-white/95 p-7 shadow-xl">
            <Globe className="mb-4 h-8 w-8 text-[#456a92]" />

            <div className="space-y-3">
              <div className="h-2 rounded bg-[#ece7df]" />
              <div className="h-2 w-4/5 rounded bg-[#456a92]/40" />
              <div className="h-2 w-3/5 rounded bg-[#ece7df]" />
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Analytics",
    title: "See what people ask most",
    description: "Track top questions, drop-offs, and content gaps from the dashboard.",
    bullets: ["Top questions", "Gap spotting", "Better content decisions"],
    visual: (
      <div className="relative h-[340px] w-full overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#f4dfcd]/90 via-[#eef3f7] to-[#dfe8f2]/95">
        <div className="absolute bottom-0 right-0 h-40 w-40 bg-[#456a92]/18 blur-3xl" />

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-64 rounded-2xl border border-white/90 bg-white/95 p-7 shadow-xl">
            <BarChart3 className="mb-4 h-8 w-8 text-[#bc6c25]" />

            <div className="flex h-24 items-end gap-2">
              {[40, 60, 30, 80, 55, 90].map((h, i) => (
                <div
                  key={i}
                  className="animate-grow w-4 rounded-t bg-[#bc6c25]/60"
                  style={{ height: `${h}%`, animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Voice + Gemini",
    title: "Speak in Hindi, Tamil, Telugu, and more",
    description: "Visitors can talk naturally, and NavBot can reply in voice inside the same flow.",
    bullets: ["Voice input", "Voice playback", "Multilingual via Google Gemini"],
    visual: (
      <div className="relative h-[340px] w-full overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#eef3f7]/90 via-[#fbf7f1] to-[#f4dfcd]/90">
        <div className="absolute inset-0 flex items-center justify-center gap-2">
          {[...Array(14)].map((_, i) => (
            <div
              key={i}
              className="animate-wave rounded-full bg-[#456a92]/65"
              style={{
                width: "8px",
                height: `${30 + (i % 5) * 16}px`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-72 rounded-2xl border border-white/90 bg-white/95 p-7 text-center shadow-xl">
            <Mic className="mx-auto mb-4 h-8 w-8 text-[#456a92]" />
            <div className="mb-3 flex justify-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#8a938f]">
              <span>Hindi</span>
              <span>Tamil</span>
              <span>Telugu</span>
            </div>
            <p className="text-sm font-medium text-[#1f2522]">Listening…</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Social sync",
    title: "Keep answers fresh with live updates",
    description: "Sync social content and website changes so the chatbot stays current.",
    bullets: ["Auto sync", "Social updates", "Fewer stale answers"],
    visual: (
      <div className="relative h-[340px] w-full overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#f4dfcd]/70 via-[#fbf7f1] to-[#dfe8f2]/90">
        <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-[#456a92]/12 blur-3xl" />

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-72 rounded-2xl border border-white/90 bg-white/95 p-6 shadow-xl">
            <div className="relative mb-4 h-32">
              <div className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-gradient-to-br from-[#bc6c25]/85 to-[#456a92]/75 shadow-lg">
                <MessageSquare className="h-6 w-6 text-white" />
              </div>

              <div className="animate-orbit-1 absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#1f2522]/8 bg-white text-[#7f8d88] shadow-sm">
                x
              </div>
              <div className="animate-orbit-2 absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#456a92]/10 bg-[#edf2f7] text-[#456a92] shadow-sm">
                in
              </div>
              <div className="animate-orbit-3 absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#bc6c25]/10 bg-[#f6eee3] text-[#bc6c25] shadow-sm">
                ig
              </div>
              <div className="animate-orbit-4 absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#456a92]/10 bg-[#edf2f7] text-[#456a92] shadow-sm">
                <RefreshCw className="h-4 w-4" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#65726d]">Syncing updates...</span>
                <span className="font-medium text-[#bc6c25]">Live</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-[#ece7df]">
                <div
                  className="animate-progress h-full rounded-full bg-gradient-to-r from-[#bc6c25]/70 to-[#456a92]/60"
                  style={{ width: "70%" }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="animate-float absolute right-8 top-8 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs shadow-lg">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
          New post
        </div>

        <div className="animate-float delay-300 absolute bottom-8 left-8 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs shadow-lg">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#456a92]" />
          Updated
        </div>
      </div>
    ),
  },
];

export const FeaturesPage = () => (
  <div className="animate-fade-in-up min-h-screen bg-[#f8f4ee] pb-24 pt-20 text-[#1f2522]">
    <section className="relative overflow-hidden py-24">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-5%] top-[-10%] h-[620px] w-[620px] rounded-full bg-[#f2d4b8] opacity-28 blur-[100px]" />
        <div className="absolute left-[-10%] top-[20%] h-[500px] w-[500px] rounded-full bg-[#dbe5f1] opacity-24 blur-[100px]" />
      </div>

      <div className="container relative z-10 mx-auto max-w-6xl px-6">
        <div className="mb-24 text-center">
          <h1 className="mx-auto max-w-4xl text-5xl font-light leading-[0.96] tracking-[-0.06em] text-[#1f2522] md:text-6xl lg:text-[4.75rem]">
            Built to sell, support, and stay current.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#65726d]">
            Minimal setup. Grounded answers. Better self-serve journeys.
          </p>
        </div>

        <div className="space-y-40">
          {featureRows.map((feature, index) => (
            <div key={feature.title} className="grid items-center gap-16 md:grid-cols-2 md:gap-20">
              <div className={index % 2 === 1 ? "order-2 md:order-1" : ""}>
                <div className="mx-auto w-full max-w-[520px]">
                  {feature.visual}
                </div>
              </div>

              <div className={index % 2 === 1 ? "order-1 md:order-2" : ""}>
                <span className={`mb-4 block text-sm font-semibold uppercase tracking-[0.18em] ${index % 2 === 0 ? "text-[#bc6c25]" : "text-[#456a92]"}`}>
                  {feature.eyebrow}
                </span>

                <h2 className="max-w-xl text-4xl font-light leading-tight tracking-[-0.045em] text-[#1f2522] md:text-[2.9rem]">
                  {feature.title}
                </h2>

                <p className="mt-5 max-w-xl text-lg leading-8 text-[#5f6b67]">
                  {feature.description}
                </p>

                <div className="mt-7 space-y-3">
                  {feature.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-center gap-3 text-sm text-[#6b7773]">
                      <span className="h-2 w-2 rounded-full bg-[#bc6c25]" />
                      <span>{bullet}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-32">
          <div className="section-shell overflow-hidden rounded-[2.5rem] px-8 py-12 md:px-12 md:py-16">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-[8%] top-[18%] h-40 w-40 rounded-full bg-[#f2d4b8]/55 blur-3xl" />
              <div className="absolute bottom-[8%] right-[10%] h-48 w-48 rounded-full bg-[#dbe5f1]/70 blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <span className="eyebrow-pill">Get started</span>
                <h2 className="mt-5 max-w-xl text-4xl font-light leading-tight tracking-[-0.05em] text-[#1f2522] md:text-[3.25rem]">
                  Put NavBot on your website in minutes.
                </h2>
                <p className="mt-4 max-w-lg text-lg leading-8 text-[#5f6b67]">
                  Add one script, sync your content, and launch a grounded chatbot that sells and supports.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button className="rounded-full bg-[#1f2522] px-6 py-3 text-sm font-medium text-white shadow-[0_18px_36px_rgba(31,37,34,0.12)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#bc6c25]">
                  Start free
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
);
