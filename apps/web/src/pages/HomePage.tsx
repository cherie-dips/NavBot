import { useState } from "react";
import { Copy, Check, Code, ArrowRight } from "lucide-react";

interface HomePageProps {
    onViewChange: (view: string) => void;
}

export const HomePage = ({ onViewChange }: HomePageProps) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="animate-fade-in-up">
            {/* Hero Section */}
            <section className="relative pt-40 pb-24 overflow-hidden">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#8EBFF2] opacity-20 rounded-full blur-[100px] animate-pulse" />
                    <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] bg-[#8691CA] opacity-20 rounded-full blur-[100px] animate-pulse delay-700" />
                    <div className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] bg-[#478EDB] opacity-10 rounded-full blur-[100px]" />
                </div>

                <div className="container mx-auto px-6 relative z-10 text-center">
                    <h1 className="font-serif text-6xl md:text-7xl lg:text-8xl font-light text-[#2E3538] mb-8 leading-[1.1] tracking-tight">
                        UI is rebuilt,
                        <br />
                        <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-[#478EDB] to-[#8691CA]">
                            Intelligence is reused
                        </span>
                    </h1>

                    <p className="text-xl md:text-2xl text-slate-500 mb-12 max-w-2xl mx-auto leading-relaxed font-light">
                        A conversational assistant that crawls your website, understands your content, and answers visitor questions—automatically matching your brand aesthetic.
                    </p>

                    <div className="max-w-3xl mx-auto mb-16">
                        <div className="relative group perspective-1000">
                            <div className="absolute -inset-1 bg-gradient-to-r from-[#8EBFF2] via-[#8691CA] to-[#478EDB] rounded-3xl blur-lg opacity-30 group-hover:opacity-50 transition duration-700"></div>

                            <div className="relative bg-[#2E3538] rounded-3xl p-8 shadow-2xl overflow-hidden text-left border border-white/10">
                                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10">
                                    <div className="flex gap-2">
                                        <div className="w-3 h-3 rounded-full bg-[#FF5F56]"></div>
                                        <div className="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
                                        <div className="w-3 h-3 rounded-full bg-[#27C93F]"></div>
                                    </div>
                                    <span className="ml-4 text-xs text-slate-400 font-mono">index.html</span>
                                </div>

                                <div className="font-mono text-sm space-y-3 font-medium">
                                    <div className="text-slate-500">
                                        <span className="text-[#8691CA]">&lt;!DOCTYPE</span>
                                        <span className="text-slate-400"> html</span>
                                        <span className="text-[#8691CA]">&gt;</span>
                                    </div>
                                    <div className="text-slate-500">
                                        <span className="text-[#8691CA]">&lt;html</span>
                                        <span className="text-[#8691CA]">&gt;</span>
                                    </div>
                                    <div className="text-slate-500 ml-4">
                                        <span className="text-[#8691CA]">&lt;head</span>
                                        <span className="text-[#8691CA]">&gt;</span>
                                    </div>
                                    <div className="text-slate-500 ml-8">
                                        <span className="text-[#8691CA]">&lt;title&gt;</span>
                                        <span className="text-white">Your Website</span>
                                        <span className="text-[#8691CA]">&lt;/title&gt;</span>
                                    </div>

                                    <div className="ml-8 bg-[#478EDB]/10 border border-[#478EDB]/30 rounded-xl p-4 my-4 relative group/code transition-all hover:bg-[#478EDB]/15">
                                        <div className="text-slate-300 break-all">
                                            <span className="text-[#8691CA]">&lt;script </span>
                                            <span className="text-[#8EBFF2]">src</span>
                                            <span className="text-slate-500">=</span>
                                            <span className="text-[#F2994A]">"https://cdn.navbot.ai/widget.js"</span>
                                            <span className="text-[#8EBFF2] ml-2">data-id</span>
                                            <span className="text-slate-500">=</span>
                                            <span className="text-[#F2994A]">"YOUR_ID"</span>
                                            <span className="text-[#8691CA]">&gt;&lt;/script&gt;</span>
                                        </div>
                                        <button
                                            onClick={handleCopy}
                                            className="absolute right-3 top-3 opacity-0 group-hover/code:opacity-100 transition-opacity bg-white/10 hover:bg-white/20 p-1.5 rounded-lg text-white"
                                        >
                                            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>

                                    <div className="text-slate-500 ml-4">
                                        <span className="text-[#8691CA]">&lt;/head&gt;</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <p className="mt-8 text-sm text-slate-500 font-medium">
                            One line of code. Infinite possibilities.
                        </p>
                    </div>
                </div>
            </section>

            {/* How it Works Section */}
            <section id="how-it-works" className="py-24 bg-white relative">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-20">
                        <h2 className="font-serif text-4xl md:text-5xl font-light text-[#2E3538] mb-6">
                            How it <span className="italic text-[#478EDB]">works</span>
                        </h2>
                        <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light">
                            Vector search meets retrieval-augmented generation. Your website becomes the source of truth.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            {
                                step: "01",
                                title: "Drop in the code",
                                desc: "Add one script tag to your HTML. The widget automatically inherits your website's colors, fonts, and design language.",
                                visual: (
                                    <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-br from-[#8EBFF2]/20 to-[#478EDB]/20 p-6">
                                        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#478EDB]/20 font-mono text-[10px] w-full max-w-[180px] transform rotate-[-2deg] transition-transform group-hover:rotate-0">
                                            <div className="flex gap-1 mb-2">
                                                <div className="w-2 h-2 rounded-full bg-[#FF5F56]"></div>
                                                <div className="w-2 h-2 rounded-full bg-[#FFBD2E]"></div>
                                                <div className="w-2 h-2 rounded-full bg-[#27C93F]"></div>
                                            </div>
                                            <div className="text-[#8691CA]">&lt;script&gt;</div>
                                            <div className="ml-2 text-[#478EDB] truncate">src="cdn.navbot..."</div>
                                            <div className="text-[#8691CA]">&lt;/script&gt;</div>
                                        </div>
                                        <div className="absolute bottom-6 right-8 text-[#478EDB] animate-bounce bg-white/50 p-2 rounded-full shadow-sm backdrop-blur-sm">
                                            <Code className="w-4 h-4 transform rotate-90 md:rotate-0" />
                                        </div>
                                    </div>
                                )
                            },
                            {
                                step: "02",
                                title: "We crawl & index",
                                desc: "NavBot crawls your pages once, chunks the content intelligently, and stores it in a vector database for instant retrieval.",
                                visual: (
                                    <div className="relative w-full h-full p-8 flex items-center justify-center bg-gradient-to-br from-[#8691CA]/10 to-[#478EDB]/10 overflow-hidden">
                                        <div className="relative">
                                            {[0, 1, 2].map((i) => (
                                                <div
                                                    key={i}
                                                    className="absolute inset-0 border-2 border-[#478EDB]/40 rounded-xl animate-ping"
                                                    style={{
                                                        animationDelay: `${i * 0.3}s`,
                                                        animationDuration: '2s'
                                                    }}
                                                ></div>
                                            ))}
                                            <div className="relative bg-white rounded-xl p-6 shadow-sm border border-[#8691CA]/20 w-40">
                                                <div className="space-y-3">
                                                    <div className="h-2 bg-slate-100 rounded w-3/4"></div>
                                                    <div className="h-2 bg-slate-100 rounded w-1/2"></div>
                                                    <div className="h-2 bg-[#478EDB] rounded w-2/3 animate-pulse"></div>
                                                    <div className="h-2 bg-slate-100 rounded w-full"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            },
                            {
                                step: "03",
                                title: "RAG-powered answers",
                                desc: "When visitors ask questions, we retrieve relevant context from your site and generate accurate, grounded responses.",
                                visual: (
                                    <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-br from-[#478EDB]/20 to-[#8EBFF2]/20 p-6">
                                        <div className="bg-white/90 backdrop-blur-md rounded-xl p-3 shadow-sm border border-[#478EDB]/20 w-full max-w-[200px]">
                                            <div className="flex items-start gap-2 mb-2">
                                                <div className="w-6 h-6 rounded-full bg-[#478EDB] flex items-center justify-center text-white text-[10px] font-bold">N</div>
                                                <div className="bg-[#F9F9FA] rounded-lg rounded-tl-none p-2 text-[10px] text-[#2E3538] flex-1">
                                                    Helping you today?
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 ml-8">
                                                <div className="w-1.5 h-1.5 bg-[#8691CA] rounded-full animate-bounce"></div>
                                                <div className="w-1.5 h-1.5 bg-[#8691CA] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                                <div className="w-1.5 h-1.5 bg-[#8691CA] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            }
                        ].map((item, i) => (
                            <div key={i} className="group relative">
                                <div className="bg-[#F9F9FA] rounded-[2rem] p-2 border border-slate-100 hover:border-[#8EBFF2]/30 transition-all duration-300 hover:shadow-xl hover:shadow-[#8EBFF2]/10 h-full flex flex-col">
                                    <div className="relative h-48 rounded-[1.5rem] overflow-hidden mb-6 flex items-center justify-center">
                                        {item.visual}
                                        <div className="absolute top-4 left-4 font-mono font-bold text-xl text-[#478EDB] bg-white/50 backdrop-blur-sm px-2 rounded-lg">{item.step}</div>
                                    </div>
                                    <div className="px-6 pb-8 text-center flex-grow">
                                        <h3 className="font-serif text-2xl font-bold text-[#2E3538] mb-3">{item.title}</h3>
                                        <p className="text-slate-500 leading-relaxed">{item.desc}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features snippet (redirects to Features page) */}
            <section className="py-20 bg-[#F9F9FA]">
                <div className="container mx-auto px-6 text-center">
                    <h2 className="font-serif text-3xl font-light text-[#2E3538] mb-8">
                        Want to see more?
                    </h2>
                    <button
                        onClick={() => onViewChange("features")}
                        className="group inline-flex items-center gap-2 text-[#478EDB] font-medium hover:gap-4 transition-all duration-300"
                    >
                        Explore all features <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-32 bg-[#2E3538] relative overflow-hidden">
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#478EDB] opacity-20 rounded-full blur-[120px] animate-pulse" />
                    <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[#8691CA] opacity-20 rounded-full blur-[120px]" />
                </div>

                <div className="container mx-auto px-6 relative z-10 text-center">
                    <h2 className="font-serif text-5xl md:text-6xl lg:text-7xl font-light text-white mb-8 leading-tight">
                        Let's build something
                        <br />
                        <span className="italic text-[#8EBFF2]">together</span>
                    </h2>

                    <p className="text-xl md:text-2xl text-slate-300 mb-12 max-w-2xl mx-auto leading-relaxed font-light">
                        NavBot is in active development. Get in touch to learn more.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-6 justify-center">
                        <button
                            onClick={() => onViewChange("contact")}
                            className="group inline-flex items-center justify-center px-10 py-5 bg-[#478EDB] text-white rounded-full font-bold text-lg hover:bg-[#3b7ac2] transition-all duration-300 shadow-xl shadow-[#478EDB]/20 hover:shadow-[#478EDB]/40 hover:-translate-y-1"
                        >
                            Get in Touch
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
};
