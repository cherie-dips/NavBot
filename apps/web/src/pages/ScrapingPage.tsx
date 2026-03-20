import { useState, useEffect, useRef } from "react";
import { Globe, Cpu, Database, CheckCircle2 } from "lucide-react";

interface ScrapingPageProps {
  websiteUrl: string;
  userId?: string;
  apiBase: string;
  onComplete: (result: {
    [x: string]: null; siteId: string; pageCount: number; stored: number 
}) => void;
  onError: (message: string) => void;
}

const STEPS = [
  { icon: Globe,        label: "Fetching pages",    detail: "Crawling your website structure and following links…", threshold: 0  },
  { icon: Cpu,          label: "Analyzing content", detail: "Extracting text, headings, and tables…",               threshold: 30 },
  { icon: Database,     label: "Building index",    detail: "Chunking content and storing vectors in knowledge base…", threshold: 65 },
  { icon: CheckCircle2, label: "Ready!",             detail: "Your chatbot is configured and ready to deploy.",      threshold: 95 },
];

export const ScrapingPage = ({
  websiteUrl,
  userId,
  apiBase,
  onComplete,
  onError,
}: ScrapingPageProps) => {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [done, setDone] = useState(false);
  const [pagesFound, setPagesFound] = useState<number | null>(null);

  const progressRef = useRef(0);
  const doneRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const ceilingRef = useRef(25);
  const fetchedRef = useRef(false);

  const hostname = (() => {
    try { return new URL(websiteUrl).hostname; } catch { return websiteUrl; }
  })();

  // Animate progress bar toward the current ceiling using rAF
  useEffect(() => {
    const animate = () => {
      if (doneRef.current) return;

      const ceiling = ceilingRef.current;
      const current = progressRef.current;

      if (current < ceiling) {
        const gap = ceiling - current;
        const speed = Math.max(0.03, gap * 0.01);
        const next = Math.min(current + speed, ceiling);
        progressRef.current = next;
        setProgress(next);

        // Advance step based on progress
        for (let i = STEPS.length - 1; i >= 0; i--) {
          if (next >= STEPS[i]!.threshold) {
            setCurrentStep(i);
            break;
          }
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // Run the real fetch, advance ceiling over time so bar never looks frozen
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // Timed ceiling milestones — bar keeps moving even on slow crawls
    const milestones = [
      { delay: 4000,  ceiling: 32 },
      { delay: 10000, ceiling: 48 },
      { delay: 20000, ceiling: 60 },
      { delay: 35000, ceiling: 70 },
      { delay: 55000, ceiling: 78 },
      { delay: 80000, ceiling: 85 },
      { delay: 120000, ceiling: 90 },
    ];

    const timers = milestones.map(({ delay, ceiling }) =>
      setTimeout(() => {
        if (!doneRef.current) {
          ceilingRef.current = Math.max(ceilingRef.current, ceiling);
        }
      }, delay)
    );

    const run = async () => {
      try {
        const res = await fetch(`${apiBase}/api/sites`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: websiteUrl, userId }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data?.error === "failed_to_index_site"
              ? "Failed to index site. Please check the URL and try again."
              : data?.error || "Failed to index site."
          );
        }

        const stored: number = typeof data.stored === "number" ? data.stored : 0;
        const pageCount: number = typeof data.pageCount === "number" ? data.pageCount : stored;

        setPagesFound(pageCount);

        // Release the ceiling — let the bar fill to 100
        ceilingRef.current = 100;

        // Wait for bar to visually reach ~98 before calling onComplete
        const waitForFill = () => {
          if (progressRef.current >= 98) {
            doneRef.current = true;
            setProgress(100);
            setDone(true);
            setCurrentStep(STEPS.length - 1);
            setTimeout(() => {
              onComplete({
                siteId: data.siteId || new URL(websiteUrl).hostname,
                pageCount,
                stored,
              });
            }, 900);
          } else {
            setTimeout(waitForFill, 80);
          }
        };
        waitForFill();
      } catch (err: any) {
        timers.forEach(clearTimeout);
        onError(err?.message || "Something went wrong while indexing.");
      }
    };

    run();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="animate-fade-in-up relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8f4ee] pb-20 pt-24">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute right-[-5%] top-[-10%] h-[600px] w-[600px] rounded-full bg-[#f2d4b8] opacity-26 blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[10%] h-[500px] w-[500px] rounded-full bg-[#dbe5f1] opacity-22 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg mx-auto px-6 text-center">
        <div className="relative w-28 h-28 mx-auto mb-10">
          <div className={`absolute inset-0 rounded-full border-2 border-[#bc6c25]/20 transition-all duration-700 ${done ? "scale-150 opacity-0" : "scale-100 opacity-100"}`} />
          <div
            className={`absolute inset-2 rounded-full border-2 border-b-transparent border-l-transparent border-r-[#456a92] border-t-[#bc6c25] ${done ? "border-green-400" : "animate-spin"}`}
            style={{ animationDuration: "1.2s" }}
          />
          <div className={`absolute inset-4 rounded-full transition-all duration-500 ${done ? "bg-green-100" : "bg-[#f6eee3]"}`} />
          <div className="absolute inset-0 flex items-center justify-center">
            {done
              ? <CheckCircle2 className="w-10 h-10 text-green-500" />
              : <Globe className="w-10 h-10 text-[#bc6c25]" />
            }
          </div>
        </div>

        <h2 className="mb-2 font-display text-3xl font-light text-[#1f2522]">
          {done ? "All set!" : "Analyzing your website"}
        </h2>
        <p className="mb-4 text-sm text-[#65726d]">
          {done ? (
            pagesFound !== null ? (
              <>Indexed <span className="font-medium text-[#bc6c25]">{pagesFound} pages</span> from <span className="font-medium text-[#bc6c25]">{hostname}</span>. Your NavBot is ready.</>
            ) : "Your NavBot is ready to deploy."
          ) : (
            <>
              Scanning <span className="font-medium text-[#bc6c25]">{hostname}</span>
              {pagesFound !== null && <> · <span className="font-medium text-[#bc6c25]">{pagesFound} pages</span> found so far</>}
              …
            </>
          )}
        </p>

        <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-[#ece7df]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress}%`,
              background: done
                ? "linear-gradient(90deg, #27C93F, #4ade80)"
                : "linear-gradient(90deg, #bc6c25, #456a92)",
              transition: "background 0.5s ease",
            }}
          />
        </div>
        <p className="mb-8 text-right text-xs text-[#8a938f]">{Math.round(progress)}%</p>

        <div className="space-y-3 text-left">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === currentStep && !done;
            const isStepDone = idx < currentStep || done;

            return (
              <div
                key={idx}
                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-500 ${
                  isStepDone
                    ? "bg-green-50 border-green-100 opacity-80"
                    : isActive
                    ? "bg-white border-[#bc6c25]/18 shadow-[0_16px_34px_rgba(31,37,34,0.05)]"
                    : "bg-[#fbf8f3] border-white/80 opacity-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                  isStepDone ? "bg-green-100" : isActive ? "bg-[#f6eee3]" : "bg-[#f1ece4]"
                }`}>
                  <Icon className={`w-4 h-4 ${isStepDone ? "text-green-600" : isActive ? "text-[#bc6c25]" : "text-[#9aa39f]"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isStepDone ? "text-green-700" : isActive ? "text-[#1f2522]" : "text-[#8a938f]"}`}>
                    {step.label}
                  </p>
                  {isActive && <p className="mt-0.5 text-xs text-[#65726d]">{step.detail}</p>}
                </div>
                {isStepDone && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
                {isActive && <div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-[#bc6c25]/25 border-t-[#bc6c25]" />}
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-xs text-[#8a938f]">
          {done ? "Crawl complete!" : "This may take a minute for larger sites — hang tight."}
        </p>
      </div>
    </div>
  );
};
