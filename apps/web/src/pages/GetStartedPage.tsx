import { useState } from "react";
import { ArrowRight, Sparkles, Copy, Check } from "lucide-react";
import { CodeSnippet } from "../components/Codesnippet";

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:3001";
const WIDGET_SCRIPT_URL = (import.meta as any).env?.VITE_WIDGET_SCRIPT_URL ?? (typeof window !== "undefined" ? `${window.location.origin}/chat-widget.iife.js` : "/chat-widget.iife.js");

export const GetStartedPage = () => {
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [generatedId, setGeneratedId] = useState<string | null>(null);
    const [indexResult, setIndexResult] = useState<{ siteId: string; pageCount: number; stored: number; failed: number } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [codeType, setCodeType] = useState<"script" | "console">("script");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!websiteUrl.trim()) return;

        setIsLoading(true);
        setError(null);
        setGeneratedId(null);
        setIndexResult(null);

        try {
            const url = websiteUrl.trim();
            const res = await fetch(`${API_BASE}/api/sites`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error === "failed_to_index_site" ? "Failed to index site. Please check the URL and try again." : data.error || "Failed to index site.");
            }
            setGeneratedId(data.siteId);
            setIndexResult({
                siteId: data.siteId,
                pageCount: data.pageCount ?? 0,
                stored: data.stored ?? 0,
                failed: data.failed ?? 0,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to index site. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const getConsoleCode = () => {
        if (!generatedId) return "";
        return `(function(){if(document.getElementById("chat-widget-root")){console.log("NavBot already loaded.");return;}window.NAVBOT_CONFIG={apiBase:"${API_BASE}",siteId:"${generatedId}"};var s=document.createElement("script");s.src="${WIDGET_SCRIPT_URL}";s.crossOrigin="anonymous";document.body.appendChild(s);})();`;
    };

    const handleCopyCode = () => {
        navigator.clipboard.writeText(getConsoleCode());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="animate-fade-in-up min-h-screen pt-32 pb-20 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#8EBFF2] opacity-20 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] bg-[#8691CA] opacity-20 rounded-full blur-[100px] animate-pulse delay-700" />
                <div className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] bg-[#478EDB] opacity-10 rounded-full blur-[100px]" />
            </div>

            <div className="container mx-auto px-6 relative z-10">
                <div className="max-w-4xl mx-auto">
                    {/* Header */}
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#478EDB]/10 border border-[#478EDB]/20 text-[#478EDB] text-sm font-medium mb-6">
                            <Sparkles className="w-4 h-4" />
                            <span>Get started in minutes</span>
                        </div>
                        
                        <h1 className="font-serif text-5xl md:text-6xl font-light text-[#2E3538] mb-6">
                            Add NavBot to your <span className="italic text-[#478EDB]">website</span>
                        </h1>
                        <p className="text-xl text-slate-500 max-w-2xl mx-auto font-light">
                            Enter your website URL and get your unique integration code instantly.
                        </p>
                    </div>

                    {/* Form Section */}
                    {!generatedId ? (
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
                                        We'll crawl your website to understand your content
                                    </p>
                                </div>

                                {error && (
                                    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="group w-full py-4 bg-[#2E3538] text-white rounded-xl font-bold hover:bg-[#478EDB] transition-colors shadow-lg shadow-[#2E3538]/10 hover:shadow-[#478EDB]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isLoading ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            <span>Generating your code...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>Generate Integration Code</span>
                                            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                                        </>
                                    )}
                                </button>
                            </form>

                            <div className="mt-8 pt-8 border-t border-slate-100">
                                <h3 className="text-sm font-medium text-[#2E3538] mb-4">What happens next?</h3>
                                <div className="space-y-3 text-sm text-slate-600">
                                    <div className="flex items-start gap-3">
                                        <span className="w-6 h-6 rounded-full bg-[#478EDB]/10 text-[#478EDB] flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                                        <span>We'll generate a unique ID for your website</span>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <span className="w-6 h-6 rounded-full bg-[#478EDB]/10 text-[#478EDB] flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                                        <span>Copy the code snippet and add it to your website's HTML</span>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <span className="w-6 h-6 rounded-full bg-[#478EDB]/10 text-[#478EDB] flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                                        <span>NavBot will automatically crawl and index your content</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Success State - Show Code */
                        <div className="space-y-8">
                            <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-xl shadow-[#8691CA]/5 border border-slate-100">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-serif text-[#2E3538]">Your code is ready!</h2>
                                        <p className="text-slate-500">Website: {websiteUrl}</p>
                                        {indexResult && (
                                            <p className="text-sm text-slate-600 mt-1">
                                                Indexed {indexResult.pageCount} pages ({indexResult.stored} stored{indexResult.failed > 0 ? `, ${indexResult.failed} skipped` : ""})
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Toggle between Script Tag and Console */}
                                <div className="mb-6">
                                    <div className="flex items-center justify-center gap-2 p-1 bg-[#F9F9FA] rounded-xl w-fit mx-auto">
                                        <button
                                            onClick={() => {
                                                setCodeType("console");
                                                setCopied(false);
                                            }}
                                            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                                                codeType === "console"
                                                    ? "bg-white text-[#478EDB] shadow-sm"
                                                    : "text-slate-500 hover:text-[#2E3538]"
                                            }`}
                                        >
                                            Console Code
                                        </button>
                                        <button
                                            onClick={() => {
                                                setCodeType("script");
                                                setCopied(false);
                                            }}
                                            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                                                codeType === "script"
                                                    ? "bg-white text-[#478EDB] shadow-sm"
                                                    : "text-slate-500 hover:text-[#2E3538]"
                                            }`}
                                        >
                                            Script Tag
                                        </button>
                                    </div>
                                </div>

                                {/* Code Display */}
                                <div className="mb-6">
                                    {codeType === "console" ? (
                                        /* Console Code */
                                        <div className="relative group">
                                            <div className="absolute -inset-1 bg-gradient-to-r from-[#8EBFF2] via-[#8691CA] to-[#478EDB] rounded-3xl blur-lg opacity-30 group-hover:opacity-50 transition duration-700"></div>
                                            
                                            <div className="relative bg-[#2E3538] rounded-3xl p-8 shadow-2xl overflow-hidden text-left border border-white/10">
                                                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10">
                                                    <div className="flex gap-2">
                                                        <div className="w-3 h-3 rounded-full bg-[#FF5F56]"></div>
                                                        <div className="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
                                                        <div className="w-3 h-3 rounded-full bg-[#27C93F]"></div>
                                                    </div>
                                                    <span className="ml-4 text-xs text-slate-400 font-mono">Console</span>
                                                </div>

                                                <div className="relative bg-[#478EDB]/10 border border-[#478EDB]/30 rounded-xl p-4 group/code transition-all hover:bg-[#478EDB]/15">
                                                    <pre className="font-mono text-sm text-slate-300 whitespace-pre-wrap break-all">{getConsoleCode() || " "}</pre>
                                                    <button
                                                        onClick={handleCopyCode}
                                                        className="absolute right-3 top-3 opacity-0 group-hover/code:opacity-100 transition-opacity bg-white/10 hover:bg-white/20 p-1.5 rounded-lg text-white"
                                                    >
                                                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Script Tag */
                                        <CodeSnippet siteId={generatedId} apiBase={API_BASE} widgetScriptUrl={WIDGET_SCRIPT_URL} />
                                    )}
                                </div>

                                <p className="text-center text-sm text-slate-500 mb-4">
                                    {codeType === "console" 
                                        ? "Paste this code in your browser console to test NavBot instantly."
                                        : "Add this script tag to your website's HTML to integrate NavBot."
                                    }
                                </p>

                                <button
                                    onClick={() => {
                                        setGeneratedId(null);
                                        setIndexResult(null);
                                        setWebsiteUrl("");
                                        setError(null);
                                        setCopied(false);
                                    }}
                                    className="w-full py-3 bg-[#F9F9FA] text-[#2E3538] rounded-xl font-medium hover:bg-slate-200 transition-colors"
                                >
                                    Generate for Another Website
                                </button>
                            </div>

                            {/* Next Steps - Dynamic based on code type */}
                            <div className="bg-[#F9F9FA] rounded-[2.5rem] p-8 md:p-12 border border-slate-100">
                                <h3 className="text-xl font-serif text-[#2E3538] mb-6">
                                    {codeType === "console" ? "How to Test" : "Integration Steps"}
                                </h3>
                                <div className="space-y-4 text-slate-600">
                                    {codeType === "console" ? (
                                        /* Console Instructions */
                                        <>
                                            <div className="flex items-start gap-4">
                                                <div className="w-8 h-8 rounded-full bg-[#478EDB] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
                                                <div>
                                                    <h4 className="font-medium text-[#2E3538] mb-1">Open your website</h4>
                                                    <p className="text-sm">Navigate to {websiteUrl} in your browser</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-4">
                                                <div className="w-8 h-8 rounded-full bg-[#478EDB] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
                                                <div>
                                                    <h4 className="font-medium text-[#2E3538] mb-1">Open browser console</h4>
                                                    <p className="text-sm">Press <kbd className="px-2 py-1 bg-white rounded text-xs font-mono border">F12</kbd> or <kbd className="px-2 py-1 bg-white rounded text-xs font-mono border">Ctrl+Shift+J</kbd> (Windows/Linux) or <kbd className="px-2 py-1 bg-white rounded text-xs font-mono border">Cmd+Option+J</kbd> (Mac)</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-4">
                                                <div className="w-8 h-8 rounded-full bg-[#478EDB] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
                                                <div>
                                                    <h4 className="font-medium text-[#2E3538] mb-1">Paste and run the code</h4>
                                                    <p className="text-sm">Copy the code above, paste it into the console, and press Enter</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-4">
                                                <div className="w-8 h-8 rounded-full bg-[#478EDB] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">4</div>
                                                <div>
                                                    <h4 className="font-medium text-[#2E3538] mb-1">See NavBot in action!</h4>
                                                    <p className="text-sm">The chat widget will appear in the bottom-right corner of your page</p>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        /* Script Tag Instructions */
                                        <>
                                            <div className="flex items-start gap-4">
                                                <div className="w-8 h-8 rounded-full bg-[#478EDB] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
                                                <div>
                                                    <h4 className="font-medium text-[#2E3538] mb-1">Add the script to your website</h4>
                                                    <p className="text-sm">Place the code snippet in the <code className="px-2 py-0.5 bg-white rounded text-[#478EDB]">&lt;head&gt;</code> section of your HTML</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-4">
                                                <div className="w-8 h-8 rounded-full bg-[#478EDB] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
                                                <div>
                                                    <h4 className="font-medium text-[#2E3538] mb-1">Wait for indexing</h4>
                                                    <p className="text-sm">We'll crawl your website and build the knowledge base (usually takes 5-10 minutes)</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-4">
                                                <div className="w-8 h-8 rounded-full bg-[#478EDB] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
                                                <div>
                                                    <h4 className="font-medium text-[#2E3538] mb-1">Deploy your changes</h4>
                                                    <p className="text-sm">Push your code changes to production</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-4">
                                                <div className="w-8 h-8 rounded-full bg-[#478EDB] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">4</div>
                                                <div>
                                                    <h4 className="font-medium text-[#2E3538] mb-1">Start chatting!</h4>
                                                    <p className="text-sm">Your AI assistant will appear on your site and answer visitor questions</p>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};