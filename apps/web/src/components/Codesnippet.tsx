import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CodeSnippetProps {
    scriptId?: string;
}

export const CodeSnippet = ({ scriptId = "YOUR_ID" }: CodeSnippetProps) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        const code = `<script src="https://cdn.navbot.ai/widget.js" data-id="${scriptId}"></script>`;
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group perspective-1000">
            <div className="absolute -inset-2 bg-gradient-to-r from-[#f1ceb0] via-[#dbe4ef] to-[#f3e1cf] rounded-[2rem] blur-xl opacity-80 group-hover:opacity-100 transition duration-700"></div>

            <div className="relative bg-[#1f2522] rounded-[2rem] p-8 shadow-[0_30px_80px_rgba(31,37,34,0.18)] overflow-hidden text-left border border-white/10">
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10">
                    <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#FF5F56]"></div>
                        <div className="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
                        <div className="w-3 h-3 rounded-full bg-[#27C93F]"></div>
                    </div>
                    <span className="ml-4 text-xs text-slate-400 font-mono">index.html</span>
                    <span className="ml-auto rounded-full bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-[#f3d4ba]">
                        install
                    </span>
                </div>

                <div className="font-mono text-sm space-y-3 font-medium">
                    <div className="text-slate-500">
                        <span className="text-[#d9c0a8]">&lt;!DOCTYPE</span>
                        <span className="text-slate-400"> html</span>
                        <span className="text-[#d9c0a8]">&gt;</span>
                    </div>
                    <div className="text-slate-500">
                        <span className="text-[#d9c0a8]">&lt;html</span>
                        <span className="text-[#d9c0a8]">&gt;</span>
                    </div>
                    <div className="text-slate-500 ml-4">
                        <span className="text-[#d9c0a8]">&lt;head</span>
                        <span className="text-[#d9c0a8]">&gt;</span>
                    </div>
                    <div className="text-slate-500 ml-8">
                        <span className="text-[#d9c0a8]">&lt;title&gt;</span>
                        <span className="text-white">Your Website</span>
                        <span className="text-[#d9c0a8]">&lt;/title&gt;</span>
                    </div>

                    <div className="ml-8 bg-white/5 border border-[#f3e1cf]/20 rounded-2xl p-4 my-4 relative group/code transition-all hover:bg-white/10">
                        <div className="text-slate-300 break-all">
                        <span className="text-[#d9c0a8]">&lt;script </span>
                            <span className="text-[#c9d7ea]">src</span>
                            <span className="text-slate-500">=</span>
                            <span className="text-[#F2C18E]">"https://cdn.navbot.ai/widget.js"</span>
                            <span className="text-[#c9d7ea] ml-2">data-id</span>
                            <span className="text-slate-500">=</span>
                            <span className="text-[#F2C18E]">"{scriptId}"</span>
                        <span className="text-[#d9c0a8]">&gt;&lt;/script&gt;</span>
                        </div>
                        <button
                            onClick={handleCopy}
                            className="absolute right-3 top-3 opacity-0 group-hover/code:opacity-100 transition-opacity bg-white/10 hover:bg-white/20 p-1.5 rounded-lg text-white"
                        >
                            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                    </div>

                    <div className="text-slate-500 ml-4">
                        <span className="text-[#d9c0a8]">&lt;/head&gt;</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
