import { useState, useEffect } from "react";
import { ArrowRight, Sparkles, Globe, CheckCircle2, AlertCircle } from "lucide-react";
import { ScrapingPage } from "./ScrapingPage";
import { IntegrationPanel } from "../components/IntegrationPanel";
import { authClient } from "../lib/auth-client";
import { normalizeApiBase } from "../lib/api-base";

const API_BASE = normalizeApiBase((import.meta as any).env?.VITE_API_URL);
const WIDGET_SCRIPT_URL =
  (import.meta as any).env?.VITE_WIDGET_SCRIPT_URL ??
  (typeof window !== "undefined"
    ? `${window.location.origin}/chat-widget.iife.js`
    : "/chat-widget.iife.js");

interface IndexResult {
  siteId: string;
  url: string;
  pageCount: number;
  stored: number;
}

export const GetStartedPage = () => {
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapingDone, setScrapingDone] = useState(false);
  const [result, setResult] = useState<IndexResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user?.id) setUserId(data.user.id);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!websiteUrl.trim()) return;
    setError(null);
    const { data } = await authClient.getSession();
    const uid = data?.user?.id;
    if (!uid) {
      setError("Please sign in to index your website.");
      return;
    }
    setUserId(uid);
    setIsScraping(true);
    setScrapingDone(false);
    setResult(null);
  };

  const buildIntegration = (siteId: string) => {
    const consoleCode = `(function(){if(document.getElementById("chat-widget-root")){console.log("NavBot already loaded.");return;}window.NAVBOT_CONFIG={apiBase:"${API_BASE}",siteId:"${siteId}"};var s=document.createElement("script");s.src="${WIDGET_SCRIPT_URL}";s.crossOrigin="anonymous";document.body.appendChild(s);})();`;
    const scriptTag = `<script>\n  window.NAVBOT_CONFIG = { apiBase: "${API_BASE}", siteId: "${siteId}" };\n</script>\n<script src="${WIDGET_SCRIPT_URL}" crossorigin="anonymous"></script>`;
    return { siteId, url: websiteUrl, consoleCode, scriptTag };
  };

  const handleReset = () => {
    setWebsiteUrl("");
    setIsScraping(false);
    setScrapingDone(false);
    setResult(null);
    setError(null);
  };

  if (isScraping && !scrapingDone) {
    return (
    <ScrapingPage
      websiteUrl={websiteUrl}
      userId={userId ?? undefined}
      apiBase={API_BASE}
      onComplete={(result) => {
        setResult({
          siteId: result.siteId,
          url: websiteUrl,
          pageCount: result.pageCount,
          stored: result.stored,
        });
        setScrapingDone(true);
        setIsScraping(false);
      }}
      onError={(msg) => {
        setError(msg);
        setIsScraping(false);
      }}
    />
  );
  }

  if (result) {
    const info = buildIntegration(result.siteId);
    return (
      <div className="animate-fade-in-up relative min-h-screen overflow-hidden bg-[#f8f4ee] pb-20 pt-32 text-[#1f2522]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute right-[-5%] top-[-10%] h-[620px] w-[620px] rounded-full bg-[#f2d4b8] opacity-28 blur-[100px]" />
          <div className="absolute left-[-10%] top-[20%] h-[500px] w-[500px] rounded-full bg-[#dbe5f1] opacity-24 blur-[100px]" />
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="section-shell overflow-hidden rounded-[2.5rem] p-8 md:p-12">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-[10%] top-[14%] h-36 w-36 rounded-full bg-[#f2d4b8]/45 blur-3xl" />
                <div className="absolute bottom-[10%] right-[12%] h-40 w-40 rounded-full bg-[#dbe5f1]/55 blur-3xl" />
              </div>

              <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef5ea] text-green-600">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-display text-[#1f2522]">Your NavBot is ready!</h2>
                  <p className="text-sm text-[#65726d]">{result.url}</p>
                </div>
              </div>

              <div className="mt-4 mb-6 flex flex-wrap gap-4 text-sm text-[#65726d]">
                <span className="flex items-center gap-1.5 rounded-lg bg-[#fbfaf7] px-3 py-1.5 text-[#65726d]">
                  <Globe className="w-3.5 h-3.5 text-[#bc6c25]" />
                  {result.pageCount} pages crawled
                </span>
                <span className="flex items-center gap-1.5 rounded-lg bg-[#fbfaf7] px-3 py-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  {result.stored} chunks indexed
                </span>
              </div>
            </div>
            </div>

            <IntegrationPanel info={info} />

            <div className="text-center">
              <button
                onClick={handleReset}
                className="rounded-full border border-[#1f2522]/10 bg-white/70 px-6 py-3 text-sm font-medium text-[#1f2522] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#bc6c25]/30 hover:text-[#bc6c25]"
              >
                Add Another Website
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up relative min-h-screen overflow-hidden bg-[#f8f4ee] pb-20 pt-32 text-[#1f2522]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-mesh absolute inset-0" />
        <div className="marketing-noise absolute inset-0 opacity-16" />
        <div className="absolute right-[-5%] top-[-10%] h-[620px] w-[620px] rounded-full bg-[#f2d4b8] opacity-28 blur-[100px]" />
        <div className="absolute left-[-10%] top-[20%] h-[500px] w-[500px] rounded-full bg-[#dbe5f1] opacity-24 blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[30%] h-[400px] w-[400px] rounded-full bg-white/70 opacity-60 blur-[100px]" />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#bc6c25]/10 border border-[#bc6c25]/20 text-[#bc6c25] text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              <span>Get started in minutes</span>
            </div>

            <h1 className="text-5xl md:text-6xl font-light text-[#1f2522] mb-6 tracking-[-0.05em]">
              Add NavBot to your <span className="font-display italic text-[#bc6c25]">website</span>
            </h1>
            <p className="text-xl text-[#65726d] max-w-2xl mx-auto font-light">
              Enter your website URL. We'll crawl it, build a knowledge base, and give you integration code.
            </p>
          </div>

          <div className="section-shell overflow-hidden rounded-[2.5rem] p-8 md:p-12">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-[8%] top-[14%] h-40 w-40 rounded-full bg-[#f2d4b8]/45 blur-3xl" />
              <div className="absolute bottom-[10%] right-[8%] h-48 w-48 rounded-full bg-[#dbe5f1]/60 blur-3xl" />
            </div>

            <div className="relative z-10">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-[#1f2522] block">
                  Website URL
                </label>
                <input
                  type="url"
                  placeholder="https://yourwebsite.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="w-full rounded-2xl border border-[#1f2522]/8 bg-[#fbfaf7] px-6 py-4 text-[#1f2522] outline-none transition-all duration-300 placeholder:text-[#9aa39f] focus:border-[#bc6c25]/35 focus:bg-white"
                  required
                />
                <p className="text-sm text-[#8a938f]">
                  We'll crawl your website to understand your content and build a knowledge base.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="group flex w-full items-center justify-center gap-2 rounded-full bg-[#1f2522] py-4 font-semibold text-white shadow-[0_20px_45px_rgba(31,37,34,0.12)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#bc6c25]"
              >
                <span>Crawl & Generate Code</span>
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </button>
            </form>

            <div className="mt-8 border-t border-[#1f2522]/8 pt-8">
              <h3 className="mb-4 text-sm font-medium text-[#1f2522]">What happens next?</h3>
              <div className="space-y-3 text-sm text-[#65726d]">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#bc6c25]/10 text-xs font-bold text-[#bc6c25]">1</span>
                  <span>We crawl your website and extract all content</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#bc6c25]/10 text-xs font-bold text-[#bc6c25]">2</span>
                  <span>Content is indexed into a vector knowledge base</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#bc6c25]/10 text-xs font-bold text-[#bc6c25]">3</span>
                  <span>You get integration scripts to add the chatbot to your site</span>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};
