import { useState, useEffect } from "react";
import { Globe, Cpu, Database, CheckCircle2 } from "lucide-react";

interface ScrapingPageProps {
    websiteUrl: string;
    onComplete: () => void;
}

const STEPS = [
    { icon: Globe,        label: "Fetching pages",    detail: "Crawling your website structure..." },
    { icon: Cpu,          label: "Analyzing content", detail: "Extracting text and semantic context..." },
    { icon: Database,     label: "Building index",    detail: "Storing vectors in knowledge base..." },
    { icon: CheckCircle2, label: "Ready!",             detail: "Your chatbot is configured." },
];

export const ScrapingPage = ({ websiteUrl, onComplete }: ScrapingPageProps) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [progress, setProgress] = useState(0);
    const [done, setDone] = useState(false);

    const hostname = (() => {
        try { return new URL(websiteUrl).hostname; } catch { return websiteUrl; }
    })();

    // Drive progress over ~5 seconds
    useEffect(() => {
        const totalMs = 5000;
        const tickMs = 60;
        const increment = 100 / (totalMs / tickMs);
        let cur = 0;
        let step = 0;

        const interval = setInterval(() => {
            cur = Math.min(cur + increment + Math.random() * 0.5, 100);
            setProgress(cur);

            if (cur >= 25 && step < 1) { step = 1; setCurrentStep(1); }
            if (cur >= 55 && step < 2) { step = 2; setCurrentStep(2); }
            if (cur >= 85 && step < 3) { step = 3; setCurrentStep(3); }

            if (cur >= 100) {
                clearInterval(interval);
                setTimeout(() => setDone(true), 400);
                setTimeout(() => onComplete(), 1200);
            }
        }, tickMs);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="animate-fade-in-up min-h-screen pt-24 pb-20 relative overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#8EBFF2] opacity-20 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute bottom-[-10%] left-[10%] w-[500px] h-[500px] bg-[#8691CA] opacity-20 rounded-full blur-[100px] animate-pulse delay-700" />
            </div>

            <div className="relative z-10 w-full max-w-lg mx-auto px-6 text-center">
                {/* Animated icon */}
                <div className="relative w-28 h-28 mx-auto mb-10">
                    <div className={`absolute inset-0 rounded-full border-2 border-[#478EDB]/30 transition-all duration-700 ${done ? "scale-150 opacity-0" : "scale-100 opacity-100"}`} />
                    <div className={`absolute inset-2 rounded-full border-2 border-t-[#478EDB] border-r-[#8691CA] border-b-transparent border-l-transparent ${done ? "border-green-400" : "animate-spin"}`} style={{ animationDuration: "1.2s" }} />
                    <div className={`absolute inset-4 rounded-full transition-all duration-500 ${done ? "bg-green-100" : "bg-[#478EDB]/10"}`} />
                    <div className="absolute inset-0 flex items-center justify-center">
                        {done
                            ? <CheckCircle2 className="w-10 h-10 text-green-500" />
                            : <Globe className="w-10 h-10 text-[#478EDB]" />
                        }
                    </div>
                </div>

                <h2 className="font-serif text-3xl font-light text-[#2E3538] mb-2">
                    {done ? "All set!" : "Analyzing your website"}
                </h2>
                <p className="text-slate-500 text-sm mb-2">
                    {done
                        ? "Your NavBot is ready to deploy."
                        : <span>Scanning <span className="text-[#478EDB] font-medium">{hostname}</span>…</span>
                    }
                </p>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-1.5 mb-10 overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-300 ease-out"
                        style={{
                            width: `${progress}%`,
                            background: done
                                ? "linear-gradient(90deg, #27C93F, #4ade80)"
                                : "linear-gradient(90deg, #478EDB, #8691CA)",
                        }}
                    />
                </div>

                {/* Steps */}
                <div className="space-y-3 text-left">
                    {STEPS.map((step, idx) => {
                        const Icon = step.icon;
                        const isActive = idx === currentStep && !done;
                        const isDone = idx < currentStep || done;

                        return (
                            <div
                                key={idx}
                                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-500 ${
                                    isDone
                                        ? "bg-green-50 border-green-100 opacity-80"
                                        : isActive
                                        ? "bg-white border-[#8EBFF2]/40 shadow-md shadow-[#8EBFF2]/10"
                                        : "bg-[#F9F9FA] border-slate-100 opacity-40"
                                }`}
                            >
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                                    isDone ? "bg-green-100" : isActive ? "bg-[#478EDB]/10" : "bg-slate-100"
                                }`}>
                                    <Icon className={`w-4 h-4 ${isDone ? "text-green-600" : isActive ? "text-[#478EDB]" : "text-slate-400"}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium ${isDone ? "text-green-700" : isActive ? "text-[#2E3538]" : "text-slate-400"}`}>
                                        {step.label}
                                    </p>
                                    {isActive && (
                                        <p className="text-xs text-slate-500 mt-0.5">{step.detail}</p>
                                    )}
                                </div>
                                {isDone && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
                                {isActive && <div className="w-4 h-4 border-2 border-[#478EDB]/30 border-t-[#478EDB] rounded-full animate-spin flex-shrink-0" />}
                            </div>
                        );
                    })}
                </div>

                <p className="mt-8 text-xs text-slate-400">Usually completes in about 5 seconds.</p>
            </div>
        </div>
    );
};