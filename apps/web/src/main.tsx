import { createRoot } from "react-dom/client";
import "./style.css";

const App = () => (
  <div className="min-h-screen bg-[#0a0a0f] text-slate-200 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 overflow-x-hidden relative">
    {/* Abstract Background Orbs */}
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-purple-600/20 blur-[120px] mix-blend-screen opacity-50 animate-pulse"></div>
      <div className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-600/20 blur-[130px] mix-blend-screen opacity-40"></div>
      <div className="absolute bottom-[-10%] left-[20%] w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[100px] mix-blend-screen opacity-50"></div>
    </div>

    {/* Navigation */}
    <nav className="relative z-50 flex items-center justify-between px-6 md:px-12 py-6 border-b border-white/5 bg-[#0a0a0f]/50 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <svg className="text-white w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
          NavBot
        </span>
      </div>
      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
        <a href="#" className="hover:text-white transition-colors">Features</a>
        <a href="#" className="hover:text-white transition-colors">Documentation</a>
        <a href="#" className="hover:text-white transition-colors">Pricing</a>
      </div>
      <button className="hidden md:flex px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95">
        Get Started
      </button>
    </nav>

    {/* Hero Section */}
    <main className="relative z-10 container mx-auto px-6 pt-32 pb-20 flex flex-col items-center text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-8 animate-fade-in-up">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
        </span>
        New Level of Assistance
      </div>

      <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6 max-w-4xl leading-tight">
        Intelligent Support for <br />
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
          Your Modern Web App
        </span>
      </h1>

      <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl leading-relaxed">
        Experience the future of customer interaction with our AI-powered glassmorphic chat widget. Integrated, responsive, and beautiful.
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <button className="px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-1 transition-all duration-300">
          Try the Demo
        </button>
        <button className="px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition-all duration-300 hover:-translate-y-1 backdrop-blur-sm">
          View Documentation
        </button>
      </div>

      {/* Feature Cards Preview */}
      <div className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl text-left">
        {[
          { title: "Glassmorphism", desc: "Trendy frosted glass aesthetics that blend seamlessly with your brand." },
          { title: "AI-Powered", desc: "Smart contextual responses powered by the latest language models." },
          { title: "Instant Integration", desc: "Drop-in web component that works with any tech stack immediately." }
        ].map((feature, i) => (
          <div key={i} className="p-8 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all hover:bg-white/[0.07] backdrop-blur-sm group">
            <div className="w-12 h-12 rounded-lg bg-indigo-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <div className="w-6 h-6 bg-indigo-500 rounded-md"></div>
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
            <p className="text-slate-400 leading-relaxed">{feature.desc}</p>
          </div>
        ))}
      </div>
    </main>
  </div>
);

createRoot(document.getElementById("app")!).render(<App />);
