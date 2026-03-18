import { useState, useEffect } from "react";
import { ArrowRight, Sparkles, Globe, CheckCircle2, AlertCircle } from "lucide-react";
import { ScrapingPage } from "./ScrapingPage";
import { IntegrationPanel } from "../components/IntegrationPanel";
import { authClient } from "../lib/auth-client";

const API_BASE =
  (import.meta as any).env?.VITE_API_URL ?? "http://localhost:3001";
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
      <div className="animate-fade-in-up min-h-screen pt-32 pb-20 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#8EBFF2] opacity-20 rounded-full blur-[100px] animate-pulse" />
          <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] bg-[#8691CA] opacity-20 rounded-full blur-[100px] animate-pulse delay-700" />
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-xl shadow-[#8691CA]/5 border border-slate-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif text-[#2E3538]">Your NavBot is ready!</h2>
                  <p className="text-slate-500 text-sm">{result.url}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mt-4 mb-6 text-sm text-slate-500">
                <span className="flex items-center gap-1.5 bg-[#F9F9FA] px-3 py-1.5 rounded-lg">
                  <Globe className="w-3.5 h-3.5 text-[#478EDB]" />
                  {result.pageCount} pages crawled
                </span>
                <span className="flex items-center gap-1.5 bg-[#F9F9FA] px-3 py-1.5 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  {result.stored} chunks indexed
                </span>
              </div>
            </div>

            <IntegrationPanel info={info} />

            <div className="text-center">
              <button
                onClick={handleReset}
                className="px-6 py-3 bg-[#F9F9FA] text-[#2E3538] rounded-xl font-medium hover:bg-slate-200 transition-colors"
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
    <div className="animate-fade-in-up min-h-screen pt-32 pb-20 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#8EBFF2] opacity-20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] bg-[#8691CA] opacity-20 rounded-full blur-[100px] animate-pulse delay-700" />
        <div className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] bg-[#478EDB] opacity-10 rounded-full blur-[100px]" />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#478EDB]/10 border border-[#478EDB]/20 text-[#478EDB] text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              <span>Get started in minutes</span>
            </div>

            <h1 className="font-serif text-5xl md:text-6xl font-light text-[#2E3538] mb-6">
              Add NavBot to your <span className="italic text-[#478EDB]">website</span>
            </h1>
            <p className="text-xl text-slate-500 max-w-2xl mx-auto font-light">
              Enter your website URL. We'll crawl it, build a knowledge base, and give you integration code.
            </p>
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-xl shadow-[#8691CA]/5 border border-slate-100">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-[#2E3538] block">
                  Website URL
                </label>
                <input
                  type="url"
                  placeholder="https://yourwebsite.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="w-full px-6 py-4 rounded-xl bg-[#F9F9FA] border border-slate-200 focus:border-[#478EDB] focus:bg-white outline-none transition-all duration-300 text-[#2E3538] placeholder:text-slate-400"
                  required
                />
                <p className="text-sm text-slate-400">
                  We'll crawl your website to understand your content and build a knowledge base.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="group w-full py-4 bg-[#2E3538] text-white rounded-xl font-bold hover:bg-[#478EDB] transition-colors shadow-lg shadow-[#2E3538]/10 hover:shadow-[#478EDB]/20 flex items-center justify-center gap-2"
              >
                <span>Crawl & Generate Code</span>
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-100">
              <h3 className="text-sm font-medium text-[#2E3538] mb-4">What happens next?</h3>
              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#478EDB]/10 text-[#478EDB] flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                  <span>We crawl your website and extract all content</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#478EDB]/10 text-[#478EDB] flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                  <span>Content is indexed into a vector knowledge base</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#478EDB]/10 text-[#478EDB] flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                  <span>You get integration scripts to add the chatbot to your site</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
