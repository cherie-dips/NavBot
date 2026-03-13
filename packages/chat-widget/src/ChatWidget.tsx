import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  timestamp: string; // ISO string for safe serialization to localStorage
  isVoice?: boolean;
}

type ChatRole = "user" | "assistant";

type NavbotConfig = {
  apiBase?: string;
  siteId?: string;
};

declare global {
  interface Window {
    NAVBOT_CONFIG?: NavbotConfig;
  }
}

const getConfig = (): Required<NavbotConfig> => {
  const globalConfig =
    typeof window !== "undefined" ? window.NAVBOT_CONFIG || {} : {};
  const apiBase =
    globalConfig.apiBase ??
    (typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : "http://localhost:3001");
  const siteId =
    globalConfig.siteId ??
    (typeof window !== "undefined"
      ? window.location.hostname || "unknown-site"
      : "unknown-site");

  return { apiBase, siteId };
};

// ---------------------------------------------------------------------------
// localStorage helpers — keyed by siteId so different sites never share state
// ---------------------------------------------------------------------------
function getHistoryKey(siteId: string) {
  return `navbot_history_${siteId}`;
}

function loadHistory(siteId: string): Message[] {
  try {
    const raw = localStorage.getItem(getHistoryKey(siteId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Message[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(siteId: string, messages: Message[]) {
  try {
    // Keep last 50 messages to avoid storage quota issues
    const trimmed = messages.slice(-50);
    localStorage.setItem(getHistoryKey(siteId), JSON.stringify(trimmed));
  } catch {
    // Storage quota exceeded or unavailable — fail silently
  }
}

function clearHistory(siteId: string) {
  try {
    localStorage.removeItem(getHistoryKey(siteId));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Default welcome message
// ---------------------------------------------------------------------------
const WELCOME_MESSAGE: Message = {
  id: 1,
  text: "Hi there! 👋 How can I help you today?",
  sender: "bot",
  timestamp: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const ChatWidget: React.FC = () => {
  const { apiBase, siteId } = getConfig();

  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Restore history from localStorage on first mount — this is what keeps
  // chat intact across page navigations and refreshes.
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [WELCOME_MESSAGE];
    const saved = loadHistory(siteId);
    return saved.length > 0 ? saved : [WELCOME_MESSAGE];
  });

  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // ---------------------------------------------------------------------------
  // Add a message and immediately persist to localStorage
  // ---------------------------------------------------------------------------
  const addMessage = (msg: Message) => {
    setMessages((prev) => {
      const updated = [...prev, msg];
      saveHistory(siteId, updated);
      return updated;
    });
  };

  // ---------------------------------------------------------------------------
  // Build the history payload for the API — only role + content, last 10 turns
  // ---------------------------------------------------------------------------
  const buildApiHistory = (
    currentMessages: Message[]
  ): Array<{ role: ChatRole; content: string }> =>
    currentMessages
      .filter((m) => !m.isVoice)
      .slice(-10)
      .map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text,
      }));

  // ---------------------------------------------------------------------------
  // Clear chat and reset to welcome message
  // ---------------------------------------------------------------------------
  const handleClearChat = () => {
    clearHistory(siteId);
    setMessages([{ ...WELCOME_MESSAGE, timestamp: new Date().toISOString() }]);
    setError(null);
  };

  // ---------------------------------------------------------------------------
  // Send text message
  // ---------------------------------------------------------------------------
  const handleSend = () => {
    if (!inputValue.trim()) return;

    setError(null);

    const userMessage: Message = {
      id: Date.now(),
      text: inputValue,
      sender: "user",
      timestamp: new Date().toISOString(),
    };

    // Capture current messages + new user message to build history
    const messagesWithUser = [...messages, userMessage];
    addMessage(userMessage);
    setInputValue("");
    setIsTyping(true);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBase}/api/chat`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = () => {
      try {
        if (xhr.status < 200 || xhr.status >= 300) {
          throw new Error(`Chat request failed with status ${xhr.status}`);
        }
        const data = JSON.parse(xhr.responseText) as { answer: string };
        const botMessage: Message = {
          id: Date.now() + 1,
          text: data.answer || "Sorry, I couldn't generate a response.",
          sender: "bot",
          timestamp: new Date().toISOString(),
        };
        addMessage(botMessage);
      } catch (e) {
        console.error("Chat error:", e);
        setError(
          "Something went wrong talking to the assistant. Please try again."
        );
        addMessage({
          id: Date.now() + 2,
          text: "I'm having trouble connecting right now. Please try again in a moment.",
          sender: "bot",
          timestamp: new Date().toISOString(),
        });
      } finally {
        setIsTyping(false);
      }
    };
    xhr.onerror = () => {
      console.error("Chat network error");
      setError(
        "Something went wrong talking to the assistant. Please try again."
      );
      setIsTyping(false);
    };
    xhr.send(
      JSON.stringify({
        siteId,
        message: userMessage.text,
        // Send history built from the snapshot that includes the user message
        history: buildApiHistory(messagesWithUser),
      })
    );
  };

  // ---------------------------------------------------------------------------
  // Voice recording
  // ---------------------------------------------------------------------------
  const startRecording = () => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        const audioChunks: Blob[] = [];

        mediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

          const userMessage: Message = {
            id: Date.now(),
            text: `🎤 Voice message (${recordingTime}s)`,
            sender: "user",
            timestamp: new Date().toISOString(),
            isVoice: true,
          };

          addMessage(userMessage);
          setIsTyping(true);

          const formData = new FormData();
          formData.append("audio", audioBlob, "voice.webm");
          formData.append("siteId", siteId);

          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${apiBase}/api/chat/voice`);
          xhr.onload = () => {
            try {
              if (xhr.status < 200 || xhr.status >= 300) {
                throw new Error(
                  `Voice chat request failed with status ${xhr.status}`
                );
              }
              const data = JSON.parse(xhr.responseText) as {
                answer: string;
                transcript?: string;
              };
              const botMessage: Message = {
                id: Date.now() + 1,
                text: data.answer || "I received your voice message.",
                sender: "bot",
                timestamp: new Date().toISOString(),
              };
              addMessage(botMessage);
            } catch (error) {
              console.error("Voice chat error:", error);
              setError(
                "Could not process voice message. Please try typing instead."
              );
            } finally {
              setIsTyping(false);
            }
          };
          xhr.onerror = () => {
            console.error("Voice chat network error");
            setError(
              "Could not process voice message. Please try typing instead."
            );
            setIsTyping(false);
          };
          xhr.send(formData);

          stream.getTracks().forEach((track) => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
        setRecordingTime(0);

        recordingIntervalRef.current = window.setInterval(() => {
          setRecordingTime((prev) => prev + 1);
        }, 1000);
      })
      .catch((error) => {
        console.error("Error accessing microphone:", error);
        alert("Could not access microphone. Please check your permissions.");
      });
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" + secs : secs}`;
  };

  // Parse ISO timestamp safely for display
  const formatMessageTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
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
          ${
            isOpen
              ? "translate-y-0 opacity-100 scale-100 pointer-events-auto"
              : "translate-y-8 opacity-0 scale-95 pointer-events-none h-0"
          }
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-medium text-sm italic text-[#2E3538] tracking-tight font-serif">
              navbot
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Clear chat button */}
            <button
              onClick={handleClearChat}
              className="text-slate-400 hover:text-slate-700 transition-colors p-2 rounded-full hover:bg-white/20"
              title="Clear chat history"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-500 hover:text-slate-800 transition-colors p-2 rounded-full hover:bg-white/20"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col ${
                message.sender === "user" ? "items-end" : "items-start"
              } animate-fade-in-up`}
            >
              <div
                className={`
                  max-w-[85%] px-4 py-3 text-sm leading-relaxed rounded-2xl backdrop-blur-md
                  ${
                    message.sender === "bot"
                      ? "bg-white/40 text-slate-700 rounded-tl-sm border border-white/20"
                      : "bg-black/5 text-slate-800 rounded-tr-sm border border-black/5 font-medium"
                  }
                  ${message.isVoice ? "flex items-center gap-2" : ""}
                `}
              >
                {message.text}
              </div>
              <span className="text-[10px] text-slate-400 mt-1.5 px-1 opacity-70">
                {formatMessageTime(message.timestamp)}
              </span>
            </div>
          ))}

          {isTyping && (
            <div className="flex flex-col items-start animate-pulse">
              <div className="bg-white/40 backdrop-blur-md border border-white/20 px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1.5 items-center">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                <span
                  className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                ></span>
                <span
                  className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Recording Indicator */}
        {isRecording && (
          <div className="px-4 pb-2">
            <div className="bg-red-500/20 backdrop-blur-md border border-red-500/30 rounded-xl px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                <span className="text-sm text-slate-700 font-medium">
                  Recording
                </span>
              </div>
              <span className="text-sm text-slate-600 font-mono">
                {formatTime(recordingTime)}
              </span>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4">
          {error && (
            <div className="mb-2 text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div className="relative group">
            <input
              type="text"
              placeholder={isRecording ? "Recording..." : "Type a message..."}
              className="
                w-full
                bg-white/20 hover:bg-white/30 focus:bg-white/40
                backdrop-blur-xl
                border border-white/20 focus:border-white/40
                rounded-xl
                py-3 pl-4 pr-24
                text-sm text-slate-800 placeholder:text-slate-500
                outline-none
                transition-all duration-300
              "
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isRecording}
            />

            {/* Voice Button */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`
                absolute right-12 top-1/2 -translate-y-1/2
                p-1.5 rounded-lg
                transition-all duration-300
                ${
                  isRecording
                    ? "text-red-500 hover:text-red-600 bg-red-500/10"
                    : "text-slate-500 hover:text-slate-800"
                }
              `}
              title={isRecording ? "Stop recording" : "Record voice message"}
            >
              {isRecording ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              )}
            </button>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isRecording}
              className="
                absolute right-2 top-1/2 -translate-y-1/2
                p-1.5 rounded-lg
                text-slate-500 hover:text-slate-800
                disabled:opacity-30
                transition-all duration-300
              "
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14M12 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Minimalist Launcher Button */}
      <div
        className={`flex justify-end transition-all duration-500 ease-out ${
          isOpen
            ? "opacity-0 translate-y-4 pointer-events-none"
            : "opacity-100 translate-y-0"
        }`}
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
          <div className="absolute inset-0 bg-gradient-to-tr from-slate-900/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <svg
            className="w-5 h-5 text-slate-700 relative z-10 transition-transform group-hover:scale-110"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-slate-400 border-2 border-white shadow-sm"></span>
        </button>
      </div>
    </div>,
    document.body
  );
};