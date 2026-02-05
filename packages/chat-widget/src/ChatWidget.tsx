import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
}

const mockResponses = [
  "I'm here to help! What would you like to know?",
  "That's a great question! Let me think about that...",
  "I can assist you with navigation and general queries.",
  "Feel free to ask me anything!",
  "I'm NavBot, your virtual assistant. How can I help you today?",
];

export const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Hi there! 👋 How can I help you today?",
      sender: "bot",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now(),
      text: inputValue,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    // Simulate bot response
    setTimeout(() => {
      const botMessage: Message = {
        id: Date.now() + 1,
        text: mockResponses[Math.floor(Math.random() * mockResponses.length)],
        sender: "bot",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMessage]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!mounted) return null;

  // Cluely-style minimalist design
  return createPortal(
    <div className="fixed bottom-6 right-6 z-[9999] font-sans antialiased text-slate-200">
      {/* Privacy-first Glass Panel */}
      <div
        className={`
          flex flex-col
          w-[380px] h-[500px]
          bg-gray-900 bg-clip-padding backdrop-filter backdrop-blur-xl bg-opacity-30 border border-white/20
          rounded-2xl
          shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]
          overflow-hidden
          transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]
          origin-bottom-right
          mb-4
          ${isOpen
            ? "translate-y-0 opacity-100 scale-100 pointer-events-auto"
            : "translate-y-4 opacity-0 scale-95 pointer-events-none h-0"}
        `}
      >
        {/* Minimal Header (No icons, just purpose) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
          <span className="font-medium text-sm text-slate-400 tracking-wide">NavBot Assistant</span>
          <button
            onClick={() => setIsOpen(false)}
            className="text-slate-500 hover:text-white transition-colors text-xs uppercase tracking-wider font-semibold"
          >
            Close
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col ${message.sender === "user" ? "items-end" : "items-start"} animate-slide-up`}
            >
              <div
                className={`
                  max-w-[85%] px-4 py-2.5 text-[14px] leading-6 rounded-2xl
                  ${message.sender === "bot"
                    ? "bg-white/5 text-slate-300 rounded-tl-sm border border-white/5"
                    : "bg-blue-600/80 text-white rounded-tr-sm shadow-lg shadow-blue-900/20 backdrop-blur-sm"}
                `}
              >
                {message.text}
              </div>
              <span className="text-[10px] text-slate-600 mt-1.5 px-1">
                {message.sender === "user" ? "You" : "NavBot"}
              </span>
            </div>
          ))}

          {isTyping && (
            <div className="flex flex-col items-start animate-pulse">
              <div className="bg-white/5 border border-white/5 px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1 items-center h-[36px]">
                <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce"></span>
                <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce delay-75"></span>
                <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce delay-150"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Floating Input Area */}
        <div className="p-4 bg-gradient-to-t from-slate-900/80 to-transparent">
          <div className="relative group">
            <input
              type="text"
              placeholder="Ask for assistance..."
              className="
                w-full
                bg-black/20 hover:bg-black/30 focus:bg-black/40
                border border-white/10 focus:border-blue-500/50
                backdrop-blur-md
                rounded-xl
                py-3.5 pl-4 pr-12
                text-sm text-slate-200 placeholder:text-slate-600
                outline-none
                transition-all duration-300
                shadow-inner
              "
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="
                absolute right-2 top-1/2 -translate-y-1/2
                p-1.5 rounded-lg
                text-slate-500 hover:text-blue-400
                disabled:opacity-30 disabled:hover:text-slate-500
                transition-colors
              "
            >
              {/* Minimal arrow icon */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Modern Pill Launcher */}
      <div
        className={`flex justify-end transition-all duration-500 ease-out ${isOpen ? "opacity-0 translate-y-4 pointer-events-none" : "opacity-100 translate-y-0"}`}
      >
        <button
          onClick={() => setIsOpen(true)}
          className="
            flex items-center gap-3
            bg-slate-800/80 backdrop-blur-xl
            hover:bg-slate-700/80
            border border-white/10 hover:border-white/20
            py-3 px-5
            rounded-full
            shadow-2xl shadow-black/50
            transition-all duration-300 hover:scale-[1.02] active:scale-95
            group
          "
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          <span className="font-medium text-sm text-slate-200">Start NavBot</span>
          <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="rotate-90">
              <path d="M5 1V9M5 1L1 5M5 1L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </button>
      </div>
    </div>,
    document.body
  );
};