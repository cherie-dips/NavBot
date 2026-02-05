import { createRoot } from "react-dom/client";
import { useState, useEffect, useRef } from "react";
import "./style.css";

const App = () => {
  const [scrolled, setScrolled] = useState(false);
  const [activeFeature, setActiveFeature] = useState<number | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-[#f8f9fc] via-[#fdfeff] to-[#f0f4ff] font-sans antialiased">
        {/* Navigation */}
        <nav className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
          scrolled ? 'bg-white/60 backdrop-blur-xl border-b border-gray-200/50 shadow-sm' : 'bg-transparent'
        }`}>
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-all">
                <span className="text-white text-sm font-bold">N</span>
              </div>
              <span className="text-xl font-semibold text-gray-900">NavBot</span>
            </div>

            <div className="hidden md:flex items-center gap-10">
              {["Features", "How it works", "Pricing", "Docs"].map((item) => (
                <a key={item} href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  {item}
                </a>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <a href="#" className="hidden md:block text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Sign in
              </a>
              <button className="px-5 py-2 rounded-full bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-all">
                Start Free
              </button>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section ref={heroRef} className="relative pt-32 pb-24 px-6 overflow-hidden">
          {/* Subtle gradient orbs */}
          <div className="absolute top-20 left-[5%] w-96 h-96 bg-blue-200/30 rounded-full blur-3xl opacity-60"></div>
          <div className="absolute top-40 right-[10%] w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl opacity-60"></div>

          <div className="max-w-5xl mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200/60 shadow-sm mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
              </span>
              <span className="text-xs font-medium text-gray-700">Powered by GPT-4</span>
            </div>

            <h1 className="text-6xl md:text-8xl font-bold text-gray-900 mb-6 leading-[0.95] tracking-tight">
              Embed Intelligence
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                In One Line
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed">
              Stop building chatbots from scratch. Drop in one script tag and let AI handle the rest.
              <br />
              <span className="text-gray-900 font-medium">No training. No configuration. Just works.</span>
            </p>

            {/* Code snippet showcase */}
            <div className="max-w-3xl mx-auto mb-12">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl blur-lg opacity-20 group-hover:opacity-30 transition duration-500"></div>
                
                <div className="relative bg-gray-900/95 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 shadow-2xl overflow-hidden">
                  {/* Browser chrome */}
                  <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-700/50">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                      <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                    </div>
                    <span className="ml-4 text-xs text-gray-500 font-mono">index.html</span>
                  </div>

                  {/* Code */}
                  <div className="font-mono text-sm text-left space-y-2">
                    <div className="text-gray-500">
                      <span className="text-purple-400">&lt;!DOCTYPE</span> 
                      <span className="text-blue-400"> html</span>
                      <span className="text-purple-400">&gt;</span>
                    </div>
                    <div className="text-gray-500">
                      <span className="text-purple-400">&lt;html</span>
                      <span className="text-purple-400">&gt;</span>
                    </div>
                    <div className="text-gray-500 ml-4">
                      <span className="text-purple-400">&lt;head</span>
                      <span className="text-purple-400">&gt;</span>
                    </div>
                    <div className="text-gray-500 ml-8">
                      <span className="text-purple-400">&lt;title</span>
                      <span className="text-purple-400">&gt;</span>
                      <span className="text-gray-300">Your Website</span>
                      <span className="text-purple-400">&lt;/title&gt;</span>
                    </div>
                    
                    {/* Highlighted script tag */}
                    <div className="ml-8 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 my-3 relative group/code">
                      <div className="absolute -right-2 -top-2">
                        <span className="flex h-6 w-6">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex items-center justify-center rounded-full h-6 w-6 bg-blue-500 text-white text-xs font-bold">✨</span>
                        </span>
                      </div>
                      <div className="text-blue-400">
                        <span className="text-purple-400">&lt;script </span>
                        <span className="text-green-400">src</span>
                        <span className="text-white">=</span>
                        <span className="text-orange-400">"https://cdn.navbot.ai/widget.js"</span>
                      </div>
                      <div className="text-blue-400 ml-16">
                        <span className="text-green-400">data-bot-id</span>
                        <span className="text-white">=</span>
                        <span className="text-orange-400">"your-bot-id"</span>
                        <span className="text-purple-400">&gt;&lt;/script&gt;</span>
                      </div>
                      <div className="absolute right-3 top-3 opacity-0 group-hover/code:opacity-100 transition-opacity">
                        <button className="text-xs text-blue-400 hover:text-blue-300 bg-blue-500/20 px-2 py-1 rounded">
                          Copy
                        </button>
                      </div>
                    </div>

                    <div className="text-gray-500 ml-4">
                      <span className="text-purple-400">&lt;/head&gt;</span>
                    </div>
                    <div className="text-gray-500 ml-4">
                      <span className="text-purple-400">&lt;body</span>
                      <span className="text-purple-400">&gt;</span>
                    </div>
                    <div className="text-gray-500 ml-8 text-gray-600">
                      {/* Your content here */}
                    </div>
                    <div className="text-gray-500 ml-4">
                      <span className="text-purple-400">&lt;/body&gt;</span>
                    </div>
                    <div className="text-gray-500">
                      <span className="text-purple-400">&lt;/html&gt;</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <p className="mt-6 text-sm text-gray-500">
                That's it. Really. Your AI assistant is live in under 60 seconds.
              </p>
            </div>

            {/* Stats */}
            <div className="flex items-center justify-center gap-12 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>12,500+ websites</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>1M+ conversations</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>99.9% uptime SLA</span>
              </div>
            </div>
          </div>
        </section>

        {/* How it works - Step by step */}
        <section className="py-24 px-6 bg-white/50 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-6xl font-bold text-gray-900 mb-4">
                Intelligence in 3 steps
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                The easiest way to add a smart chatbot to your website
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-12">
              {[
                {
                  step: "1",
                  title: "Paste the script",
                  description: "Copy one line of code into your website's HTML. Works with any platform—WordPress, Shopify, custom sites, you name it.",
                  visual: (
                    <div className="relative">
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 font-mono text-xs">
                          <div className="text-purple-600">&lt;script</div>
                          <div className="ml-4 text-green-600">src="..."</div>
                          <div className="text-purple-600">&gt;&lt;/script&gt;</div>
                        </div>
                        <div className="mt-4 flex items-center justify-center">
                          <div className="text-blue-600 animate-bounce">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                },
                {
                  step: "2",
                  title: "We crawl your site",
                  description: "Our AI automatically reads your website, learns your products, and understands your brand voice. Zero manual input required.",
                  visual: (
                    <div className="relative">
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-100">
                        <div className="relative">
                          {[0, 1, 2].map((i) => (
                            <div
                              key={i}
                              className="absolute inset-0 border-2 border-purple-400 rounded-xl animate-ping"
                              style={{
                                animationDelay: `${i * 0.3}s`,
                                animationDuration: '2s'
                              }}
                            ></div>
                          ))}
                          <div className="relative bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                            <div className="space-y-2">
                              <div className="h-2 bg-gray-200 rounded w-3/4"></div>
                              <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                              <div className="h-2 bg-purple-400 rounded w-2/3 animate-pulse"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                },
                {
                  step: "3",
                  title: "Start chatting",
                  description: "Your visitors get instant, accurate answers. The bot appears automatically and handles customer questions 24/7.",
                  visual: (
                    <div className="relative">
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-100">
                        <div className="relative bg-white/80 backdrop-blur-xl rounded-xl p-4 shadow-lg border border-gray-200/50">
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                              N
                            </div>
                            <div className="flex-1 bg-gray-100 rounded-2xl rounded-tl-sm p-3 text-xs text-gray-700">
                              Hi! How can I help?
                            </div>
                          </div>
                          <div className="flex items-start gap-3 justify-end">
                            <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm p-3 text-xs">
                              What's your return policy?
                            </div>
                          </div>
                          <div className="mt-2 flex gap-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                }
              ].map((item, i) => (
                <div key={i} className="group">
                  <div className="mb-6">
                    {item.visual}
                  </div>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-lg shadow-lg">
                      {item.step}
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900">{item.title}</h3>
                  </div>
                  <p className="text-gray-600 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-6xl font-bold text-gray-900 mb-4">
                Built for modern websites
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Everything you need to turn visitors into conversations
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {[
                {
                  icon: "🧠",
                  title: "Learns from your content",
                  description: "Automatically understands your products, pricing, policies, and brand voice by reading your website. No manual training required."
                },
                {
                  icon: "⚡",
                  title: "Instant responses",
                  description: "Sub-second reply times powered by GPT-4. Your customers get answers faster than they can finish typing their question."
                },
                {
                  icon: "🎨",
                  title: "Matches your brand",
                  description: "Customize colors, position, and tone to blend seamlessly with your design. Or use our beautiful defaults—they just work."
                },
                {
                  icon: "📊",
                  title: "Analytics that matter",
                  description: "See what questions people ask most, track conversation quality, and identify content gaps on your site."
                },
                {
                  icon: "🔒",
                  title: "Privacy-first",
                  description: "Your data stays yours. We don't train on your conversations. Full GDPR compliance built in from day one."
                },
                {
                  icon: "🌍",
                  title: "Works everywhere",
                  description: "One script works on WordPress, Shopify, Webflow, custom builds—anything with HTML. No frameworks required."
                }
              ].map((feature, i) => (
                <div
                  key={i}
                  onMouseEnter={() => setActiveFeature(i)}
                  onMouseLeave={() => setActiveFeature(null)}
                  className={`relative p-8 rounded-3xl bg-white/60 backdrop-blur-sm border transition-all duration-500 cursor-pointer ${
                    activeFeature === i 
                      ? 'border-blue-200 shadow-2xl shadow-blue-100/50 scale-[1.02]' 
                      : 'border-gray-200 shadow-lg hover:shadow-xl'
                  }`}
                >
                  <div className="text-5xl mb-4">{feature.icon}</div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 px-6 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-white rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-white rounded-full blur-3xl"></div>
          </div>
          
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <h2 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Ready to stop losing customers to unanswered questions?
            </h2>
            <p className="text-2xl text-white/90 mb-12 max-w-2xl mx-auto">
              Join 12,500+ websites already using NavBot to automate customer support
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button className="px-10 py-4 bg-white text-blue-600 rounded-full font-semibold text-lg hover:bg-gray-50 transition-all hover:scale-105 shadow-2xl">
                Start Free Trial
              </button>
              <button className="px-10 py-4 bg-transparent text-white rounded-full font-semibold text-lg border-2 border-white hover:bg-white/10 transition-all">
                View Live Demo
              </button>
            </div>
            
            <p className="mt-8 text-white/70 text-sm">
              No credit card required • Free forever plan • 2 minute setup
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 px-6 bg-gray-50 border-t border-gray-200">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">N</span>
                </div>
                <span className="text-gray-900 font-semibold">NavBot</span>
              </div>
              
              <div className="flex gap-8 text-sm text-gray-600">
                <a href="#" className="hover:text-gray-900 transition-colors">Privacy</a>
                <a href="#" className="hover:text-gray-900 transition-colors">Terms</a>
                <a href="#" className="hover:text-gray-900 transition-colors">Docs</a>
                <a href="#" className="hover:text-gray-900 transition-colors">Twitter</a>
              </div>
              
              <span className="text-sm text-gray-500">
                © 2026 NavBot. All rights reserved.
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* Glassmorphic Chat Widget
      <ChatWidget /> */}
    </>
  );
};

createRoot(document.getElementById("app")!).render(<App />);