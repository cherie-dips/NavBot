import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { CodeSnippet } from "../components/Codesnippet";

export const GetStartedPage = () => {
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [generatedId, setGeneratedId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!websiteUrl.trim()) return;

        setIsLoading(true);
        
        // Simulate API call - hardcoded ID for now
        setTimeout(() => {
            const mockId = "nb_" + Math.random().toString(36).substring(2, 15);
            setGeneratedId(mockId);
            setIsLoading(false);
        }, 1000);
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
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <CodeSnippet scriptId={generatedId} />
                                </div>

                                <p className="text-center text-sm text-slate-500 mb-4">
                                    One line of code. Infinite possibilities.
                                </p>

                                <button
                                    onClick={() => {
                                        setGeneratedId(null);
                                        setWebsiteUrl("");
                                    }}
                                    className="w-full py-3 bg-[#F9F9FA] text-[#2E3538] rounded-xl font-medium hover:bg-slate-200 transition-colors"
                                >
                                    Generate for Another Website
                                </button>
                            </div>

                            {/* Next Steps */}
                            <div className="bg-[#F9F9FA] rounded-[2.5rem] p-8 md:p-12 border border-slate-100">
                                <h3 className="text-xl font-serif text-[#2E3538] mb-6">Next Steps</h3>
                                <div className="space-y-4 text-slate-600">
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
                                            <h4 className="font-medium text-[#2E3538] mb-1">Start chatting!</h4>
                                            <p className="text-sm">Your AI assistant will appear on your site and answer visitor questions</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};