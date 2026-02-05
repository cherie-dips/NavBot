import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
}

const mockResponses = [
  "I'm here to help! What would you like to know? anjjjjjj",
  "That's a great question! Let me think about that... anjjjj",
  "I can assist you with navigation and general queries. anjjjj",
  "Feel free to ask me anything! anjjj",
  "I'm NavBot, your virtual assistant. How can I help you today? anjjjjjj",
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

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[9999] font-sans antialiased text-slate-800">
      {/* Glassmorphic Chat Panel */}
      <div
        className={`
          flex flex-col
          w-[360px] h-[500px]
          bg-white/30 backdrop-blur-3xl
          border border-white/20
          rounded-3xl
          shadow-2xl shadow-black/5
          overflow-hidden
          transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          origin-bottom-right
          mb-4
          ${isOpen
            ? "translate-y-0 opacity-100 scale-100 pointer-events-auto"
            : "translate-y-8 opacity-0 scale-95 pointer-events-none h-0"}
        `}
      >
        {/* Minimal Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {/* Minimalist Geometric Logo */}
            <div>
              <span className="font-medium text-sm font-italic text-slate-700 tracking-tight">navbot</span>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-slate-500 hover:text-slate-800 transition-colors p-2 rounded-full hover:bg-white/20"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col ${message.sender === "user" ? "items-end" : "items-start"} animate-fade-in-up`}
            >
              <div
                className={`
                  max-w-[85%] px-4 py-3 text-sm leading-relaxed rounded-2xl backdrop-blur-md
                  ${message.sender === "bot"
                    ? "bg-white/40 text-slate-700 rounded-tl-sm border border-white/20"
                    : "bg-black/5 text-slate-800 rounded-tr-sm border border-black/5 font-medium"}
                `}
              >
                {message.text}
              </div>
              <span className="text-[10px] text-slate-400 mt-1.5 px-1 opacity-70">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}

          {isTyping && (
            <div className="flex flex-col items-start animate-pulse">
              <div className="bg-white/40 backdrop-blur-md border border-white/20 px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1.5 items-center">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4">
          <div className="relative group">
            <input
              type="text"
              placeholder="Type a message..."
              className="
                w-full
                bg-white/20 hover:bg-white/30 focus:bg-white/40
                backdrop-blur-xl
                border border-white/20 focus:border-white/40
                rounded-xl
                py-3 pl-4 pr-12
                text-sm text-slate-800 placeholder:text-slate-500
                outline-none
                transition-all duration-300
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
                text-slate-500 hover:text-slate-800
                disabled:opacity-30
                transition-all duration-300
              "
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Minimalist Launcher Button */}
      <div
        className={`flex justify-end transition-all duration-500 ease-out ${isOpen ? "opacity-0 translate-y-4 pointer-events-none" : "opacity-100 translate-y-0"}`}
      >
        <button
          onClick={() => setIsOpen(true)}
          className="
            group
            relative
            bg-white/40 backdrop-blur-xl
            hover:bg-white/50
            p-3.5
            rounded-full
            shadow-lg shadow-black/5
            transition-all duration-300 hover:scale-105 active:scale-95
            border border-white/30
            overflow-hidden
          "
          aria-label="Open chat"
        >
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-slate-900/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          {/* Chat Icon */}
          <svg 
            className="w-5 h-5 text-slate-700 relative z-10 transition-transform group-hover:scale-110" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          
          {/* Active indicator dot */}
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-slate-400 border-2 border-white shadow-sm"></span>
        </button>
      </div>
    </div>,
    document.body
  );
};