import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { Sparkles, MessageSquare, Zap, Shield, BarChart3, Globe, ArrowRight, Check, Copy } from "lucide-react";
import "./style.css";

// Color Palette References:
// Light Blue: #8EBFF2
// Periwinkle: #8691CA
// Medium Blue: #478EDB
// Background: #F9F9FA
// Text Dark: #2E3538
// White: #FFFFFF

const App = () => {
  const [scrolled, setScrolled] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F9F9FA] text-[#2E3538] selection:bg-[#8EBFF2] selection:text-[#FFFFFF] overflow-x-hidden font-sans">

      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled
          ? "bg-white/80 backdrop-blur-xl border-b border-[#8691CA]/10 py-4 shadow-sm"
          : "bg-transparent py-6"
        }`}>
        <div className="container mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 group cursor-pointer">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#478EDB] to-[#8691CA] flex items-center justify-center shadow-lg shadow-[#478EDB]/20 transition-transform group-hover:scale-110 duration-300">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="text-xl font-medium italic text-[#2E3538] tracking-tight font-serif">navbot</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {["Features", "How it works", "Pricing", "Docs"].map((item) => (
              <a key={item} href="#" className="text-sm font-medium text-slate-500 hover:text-[#478EDB] transition-colors relative group">
                {item}
                <span className="absolute -bottom-1 left-0 w-full h-0.5 bg-[#478EDB] scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></span>
              </a>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <a href="#" className="hidden md:block text-sm font-medium text-slate-500 hover:text-[#478EDB] transition-colors">Sign in</a>
            <button className="px-6 py-2.5 rounded-full bg-[#2E3538] text-white text-sm font-medium hover:bg-[#478EDB] transition-colors shadow-lg shadow-[#2E3538]/10 hover:shadow-[#478EDB]/30 duration-300">
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-24 overflow-hidden">
        {/* Animated Background Blobs (Events Style) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#8EBFF2] opacity-20 rounded-full blur-[100px] animate-pulse" />
          <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] bg-[#8691CA] opacity-20 rounded-full blur-[100px] animate-pulse delay-700" />
          <div className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] bg-[#478EDB] opacity-10 rounded-full blur-[100px]" />
        </div>

        <div className="container mx-auto px-6 relative z-10 text-center">
          {/* Pill Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/60 backdrop-blur-md rounded-full mb-8 border border-[#8691CA]/20 shadow-sm animate-fade-in-up mx-auto">
            <Sparkles className="w-4 h-4 text-[#478EDB]" />
            <span className="text-sm font-medium text-[#478EDB]">
              Powered by GPT-4
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-serif text-6xl md:text-7xl lg:text-8xl font-light text-[#2E3538] mb-8 leading-[1.1] animate-fade-in-up delay-150 tracking-tight">
            Embed Intelligence
            <br />
            <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-[#478EDB] to-[#8691CA]">
              In One Line
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-slate-500 mb-12 max-w-2xl mx-auto leading-relaxed animate-fade-in-up delay-300 font-light">
            Stop building chatbots from scratch. Drop in one script tag and let AI handle the rest.
            <span className="block mt-2 font-medium text-[#478EDB]">No training. No configuration. Just works.</span>
          </p>

          {/* Code Block Visual */}
          <div className="max-w-3xl mx-auto mb-16 animate-fade-in-up delay-500">
            <div className="relative group perspective-1000">
              <div className="absolute -inset-1 bg-gradient-to-r from-[#8EBFF2] via-[#8691CA] to-[#478EDB] rounded-3xl blur-lg opacity-30 group-hover:opacity-50 transition duration-700"></div>

              <div className="relative bg-[#2E3538] rounded-3xl p-8 shadow-2xl overflow-hidden text-left border border-white/10">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#FF5F56]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#27C93F]"></div>
                  </div>
                  <span className="ml-4 text-xs text-slate-400 font-mono">index.html</span>
                </div>

                {/* Code */}
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
                    <span className="text-white">Your Amazing Website</span>
                    <span className="text-[#8691CA]">&lt;/title&gt;</span>
                  </div>

                  {/* Highlighted script tag */}
                  <div className="ml-8 bg-[#478EDB]/10 border border-[#478EDB]/30 rounded-xl p-4 my-4 relative group/code transition-all hover:bg-[#478EDB]/15">
                    <div className="absolute -right-2 -top-2 scale-0 group-hover/code:scale-125 transition-transform duration-300">
                      <div className="bg-[#478EDB] rounded-full p-1 shadow-lg">
                        <Sparkles className="w-3 h-3 text-white" />
                      </div>
                    </div>
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
              Your AI assistant is live in under 60 seconds.
            </p>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 text-sm text-[#2E3538] font-medium animate-fade-in-up delay-700">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#478EDB]"></div>
              <span>12,500+ websites</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#8691CA]"></div>
              <span>1M+ conversations</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#8EBFF2]"></div>
              <span>99.9% uptime SLA</span>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-24 bg-white relative">
        <div className="container mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="font-serif text-4xl md:text-5xl font-light text-[#2E3538] mb-6">
              Intelligence in <span className="italic text-[#478EDB]">3 steps</span>
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light">
              No complex workflows. Just pure utility.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Paste the script",
                desc: "Add one line of code to your HTML. Compatible with any platform.",
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
                      <ArrowRight className="w-4 h-4 transform rotate-90 md:rotate-0" />
                    </div>
                  </div>
                )
              },
              {
                step: "02",
                title: "Auto-Training",
                desc: "Our engine crawls your site to learn your content.",
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
                title: "Go Live",
                desc: "Instant automated support for your visitors.",
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

      {/* Features Grid */}
      <section className="py-32 bg-[#F9F9FA]">
        <div className="container mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="font-serif text-4xl md:text-5xl font-light text-[#2E3538] mb-6">
              Built for <span className="italic text-[#8691CA]">modern</span> websites
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: "Context-Aware",
                desc: "Remembers conversation history for natural, human-like interactions.",
                icon: <MessageSquare className="w-6 h-6 text-[#478EDB]" />
              },
              {
                title: "Instant Setup",
                desc: "No flowcharts or decision trees. AI figures it out automatically.",
                icon: <Zap className="w-6 h-6 text-[#478EDB]" />
              },
              {
                title: "Brand Matching",
                desc: "Customize colors, avatars, and tone to fit your brand identity seamlessly.",
                icon: <Sparkles className="w-6 h-6 text-[#478EDB]" />
              },
              {
                title: "Deep Analytics",
                desc: "Track engagement, sentiment, and resolution rates in real-time.",
                icon: <BarChart3 className="w-6 h-6 text-[#478EDB]" />
              },
              {
                title: "Privacy Focused",
                desc: "Enterprise-grade security. Your data is encrypted and isolated.",
                icon: <Shield className="w-6 h-6 text-[#478EDB]" />
              },
              {
                title: "Multi-Language",
                desc: "Speak your customers' language with auto-translation support.",
                icon: <Globe className="w-6 h-6 text-[#478EDB]" />
              }
            ].map((feature, i) => (
              <div key={i} className="group p-8 bg-white rounded-[2rem] border border-slate-100/50 shadow-sm hover:shadow-xl hover:shadow-[#478EDB]/5 transition-all duration-300 hover:-translate-y-1">
                <div className="w-12 h-12 bg-[#8EBFF2]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#478EDB] group-hover:text-white transition-colors duration-300">
                  <div className="group-hover:text-white transition-colors duration-300">
                    {feature.icon}
                  </div>
                </div>
                <h3 className="font-serif text-xl font-bold text-[#2E3538] mb-3">{feature.title}</h3>
                <p className="text-slate-500 leading-relaxed text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
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
            Ready to automate
            <br />
            <span className="italic text-[#8EBFF2]">your support?</span>
          </h2>

          <p className="text-xl md:text-2xl text-slate-300 mb-12 max-w-2xl mx-auto leading-relaxed font-light">
            Join 12,500+ websites already using NavBot.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <button className="group inline-flex items-center justify-center px-10 py-5 bg-[#478EDB] text-white rounded-full font-bold text-lg hover:bg-[#3b7ac2] transition-all duration-300 shadow-xl shadow-[#478EDB]/20 hover:shadow-[#478EDB]/40 hover:-translate-y-1">
              Start Free Trial
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </button>

            <button className="group inline-flex items-center justify-center px-10 py-5 bg-transparent border border-white/20 text-white rounded-full font-bold text-lg hover:bg-white/10 transition-all duration-300">
              View Demo
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-white border-t border-slate-100">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="text-lg font-medium italic text-[#2E3538] font-serif">navbot</span>
          </div>
          <div className="flex gap-8 text-sm text-slate-500">
            <a href="#" className="hover:text-[#478EDB] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[#478EDB] transition-colors">Terms</a>
            <a href="#" className="hover:text-[#478EDB] transition-colors">Twitter</a>
          </div>
          <div className="text-sm text-slate-400">© 2026 NavBot Inc.</div>
        </div>
      </footer>
    </div>
  );
};

createRoot(document.getElementById("app")!).render(<App />);