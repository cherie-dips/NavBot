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
                            <span className="text-[#F2994A]">"{scriptId}"</span>
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
    );
};