import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MdOutlineRefresh } from "react-icons/md";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  timestamp: string;
  isVoice?: boolean;
}

// ---------------------------------------------------------------------------
// Lightweight markdown renderer for bot messages.
// Handles: line breaks, **bold**, bullet/numbered lists, and source URLs.
// ---------------------------------------------------------------------------
function renderBotText(raw: string): React.ReactNode {
  const lines = raw.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (listItems.length === 0) return;
    if (listType === "ol") {
      elements.push(<ol key={`ol-${elements.length}`} style={{ margin: "6px 0", paddingLeft: "20px", listStyleType: "decimal" }}>{listItems}</ol>);
    } else {
      elements.push(<ul key={`ul-${elements.length}`} style={{ margin: "6px 0", paddingLeft: "20px", listStyleType: "disc" }}>{listItems}</ul>);
    }
    listItems = [];
    listType = null;
  };

  const formatInline = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let idx = 0;
    const boldRe = /\*\*(.+?)\*\*/g;
    let match: RegExpExecArray | null;
    let lastEnd = 0;
    while ((match = boldRe.exec(remaining)) !== null) {
      if (match.index > lastEnd) {
        parts.push(remaining.slice(lastEnd, match.index));
      }
      parts.push(<strong key={`b-${idx++}`}>{match[1]}</strong>);
      lastEnd = match.index + match[0].length;
    }
    if (lastEnd < remaining.length) {
      parts.push(remaining.slice(lastEnd));
    }
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed === "") {
      flushList();
      continue;
    }

    const bulletMatch = trimmed.match(/^[-•*]\s+(.+)/);
    const numberMatch = trimmed.match(/^\d+[.)]\s+(.+)/);

    if (bulletMatch) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(<li key={`li-${i}`} style={{ marginBottom: "2px" }}>{formatInline(bulletMatch[1]!)}</li>);
    } else if (numberMatch) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(<li key={`li-${i}`} style={{ marginBottom: "2px" }}>{formatInline(numberMatch[1]!)}</li>);
    } else {
      flushList();
      elements.push(<p key={`p-${i}`} style={{ margin: "4px 0" }}>{formatInline(trimmed)}</p>);
    }
  }

  flushList();
  return <>{elements}</>;
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

  // -------------------------------------------------------------------------
  // Voice recording
  // -------------------------------------------------------------------------
  const startRecording = () => {
    setError(null);
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        // Prefer audio/webm; fall back to whatever the browser supports
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

        const mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        mediaRecorderRef.current = mediaRecorder;

        const audioChunks: Blob[] = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const resolvedMime =
            mediaRecorder.mimeType || mimeType || "audio/webm";
          const audioBlob = new Blob(audioChunks, { type: resolvedMime });

          // Show a placeholder while we wait for transcription
          const placeholderId = Date.now();
          const placeholder: Message = {
            id: placeholderId,
            text: `🎤 Voice message (${recordingTime}s) — transcribing…`,
            sender: "user",
            timestamp: new Date().toISOString(),
            isVoice: true,
          };
          setMessages((prev) => [...prev, placeholder]);
          setIsTyping(true);

          // Capture history BEFORE appending the placeholder (voice msgs are excluded anyway)
          const historySnapshot = buildApiHistory(messages);

          const formData = new FormData();
          // formData.append("audio", audioBlob, `voice.${resolvedMime.includes("ogg") ? "ogg" : resolvedMime.includes("wav") ? "wav" : "webm"}`);
          formData.append(
            "audio",
            audioBlob,
            `voice.${
              resolvedMime.indexOf("ogg") !== -1
                ? "ogg"
                : resolvedMime.indexOf("wav") !== -1
                ? "wav"
                : "webm"
            }`
          );
          formData.append("siteId", siteId);
          // Send history so the bot has context
          formData.append("history", JSON.stringify(historySnapshot));

          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${apiBase}/api/chat/voice`);
          xhr.onload = () => {
            try {
              if (xhr.status < 200 || xhr.status >= 300) {
                throw new Error(
                  `Voice request failed with status ${xhr.status}`
                );
              }
              const data = JSON.parse(xhr.responseText) as {
                answer: string;
                transcript?: string | null;
                error?: string;
              };

              // Replace the placeholder with the real transcript (if available)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId
                    ? {
                        ...m,
                        text: data.transcript
                          ? `🎤 "${data.transcript}"`
                          : `🎤 Voice message (${recordingTime}s)`,
                      }
                    : m
                )
              );

              const botMessage: Message = {
                id: Date.now() + 1,
                text: data.answer || "I received your voice message.",
                sender: "bot",
                timestamp: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, botMessage]);
            } catch (err) {
              console.error("Voice chat error:", err);
              setError(
                "Could not process voice message. Please try typing instead."
              );
              // Remove the placeholder on error
              setMessages((prev) =>
                prev.filter((m) => m.id !== placeholderId)
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
            setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
            setIsTyping(false);
          };
          xhr.send(formData);

          // Release mic
          stream.getTracks().forEach((track) => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
        setRecordingTime(0);

        recordingIntervalRef.current = window.setInterval(() => {
          setRecordingTime((prev) => prev + 1);
        }, 1000);
      })
      .catch((err) => {
        console.error("Error accessing microphone:", err);
        setError(
          "Could not access microphone. Please check your browser permissions."
        );
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

  // Inline reset styles to isolate the widget from host CSS
  const resetStyle: React.CSSProperties = {
    all: "initial",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: "14px",
    lineHeight: "1.5",
    color: "#334155",
    boxSizing: "border-box",
    WebkitFontSmoothing: "antialiased",
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: 9999,
  };

  return createPortal(
    <div style={resetStyle}>
      {/* Chat Panel */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "360px",
          height: isOpen ? "520px" : "0px",
          background: "rgba(255,255,255,0.45)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: "24px",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.12)",
          overflow: "hidden",
          transition: "all 0.4s cubic-bezier(0.34,1.56,0.64,1)",
          transformOrigin: "bottom right",
          marginBottom: "12px",
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "translateY(0) scale(1)" : "translateY(8px) scale(0.95)",
          pointerEvents: isOpen ? "auto" : "none",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", flexShrink: 0, borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
          <span style={{ fontWeight: 600, fontSize: "14px", fontStyle: "italic", color: "#2E3538", letterSpacing: "-0.02em", fontFamily: "Georgia, serif" }}>
            navbot
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <button
              onClick={handleClearChat}
              title="Refresh chat"
              style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", borderRadius: "50%", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#475569"; e.currentTarget.style.background = "rgba(0,0,0,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = "none"; }}
            >
              <MdOutlineRefresh style={{ width: "16px", height: "16px" }} />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", borderRadius: "50%", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#475569"; e.currentTarget.style.background = "rgba(0,0,0,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = "none"; }}
            >
              <svg style={{ width: "16px", height: "16px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {messages.map((message) => (
            <div
              key={message.id}
              style={{ display: "flex", flexDirection: "column", alignItems: message.sender === "user" ? "flex-end" : "flex-start" }}
            >
              <div
                style={{
                  maxWidth: "85%",
                  padding: "10px 14px",
                  fontSize: "13px",
                  lineHeight: "1.6",
                  borderRadius: message.sender === "bot" ? "2px 16px 16px 16px" : "16px 2px 16px 16px",
                  background: message.sender === "bot" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.06)",
                  color: message.sender === "bot" ? "#334155" : "#1e293b",
                  border: message.sender === "bot" ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(0,0,0,0.06)",
                  fontWeight: message.sender === "user" ? 500 : 400,
                  fontStyle: message.isVoice ? "italic" : "normal",
                  overflowWrap: "break-word",
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                }}
              >
                {message.sender === "bot" && !message.isVoice
                  ? renderBotText(message.text)
                  : message.text}
              </div>
              <span style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px", paddingLeft: "4px", opacity: 0.7 }}>
                {formatMessageTime(message.timestamp)}
              </span>
            </div>
          ))}

          {isTyping && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.2)", padding: "10px 14px", borderRadius: "2px 16px 16px 16px", display: "flex", gap: "5px", alignItems: "center" }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ width: "6px", height: "6px", background: "#94a3b8", borderRadius: "50%", animation: "bounce 1s infinite", animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Recording Indicator */}
        {isRecording && (
          <div style={{ padding: "0 16px 8px" }}>
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "12px", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "8px", height: "8px", background: "#ef4444", borderRadius: "50%", animation: "pulse 1.5s infinite" }} />
                <span style={{ fontSize: "13px", color: "#475569", fontWeight: 500 }}>Recording</span>
              </div>
              <span style={{ fontSize: "13px", color: "#64748b", fontFamily: "monospace" }}>{formatTime(recordingTime)}</span>
            </div>
          </div>
        )}

        {/* Input Area — flex-based layout for reliable cross-site rendering */}
        <div style={{ padding: "12px 16px 16px", flexShrink: 0 }}>
          {error && (
            <div style={{ marginBottom: "8px", fontSize: "12px", color: "#ef4444", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "6px 10px" }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "14px", padding: "4px 4px 4px 14px" }}>
            <input
              type="text"
              placeholder={isRecording ? "Recording… tap stop" : "Type a message…"}
              style={{
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: "13px",
                color: "#1e293b",
                padding: "8px 0",
                fontFamily: "inherit",
              }}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={isRecording}
            />

            {/* Voice Button */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              title={isRecording ? "Stop recording" : "Record voice message"}
              style={{
                flexShrink: 0,
                width: "34px",
                height: "34px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                background: isRecording ? "rgba(239,68,68,0.1)" : "transparent",
                color: isRecording ? "#ef4444" : "#64748b",
                transition: "all 0.2s",
              }}
            >
              {isRecording ? (
                <svg style={{ width: "18px", height: "18px" }} fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg style={{ width: "18px", height: "18px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isRecording}
              style={{
                flexShrink: 0,
                width: "34px",
                height: "34px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "10px",
                border: "none",
                cursor: !inputValue.trim() || isRecording ? "default" : "pointer",
                background: inputValue.trim() && !isRecording ? "#2E3538" : "transparent",
                color: inputValue.trim() && !isRecording ? "#fff" : "#94a3b8",
                opacity: !inputValue.trim() || isRecording ? 0.4 : 1,
                transition: "all 0.2s",
              }}
            >
              <svg style={{ width: "16px", height: "16px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Launcher Button */}
      <div style={{ display: "flex", justifyContent: "flex-end", transition: "all 0.4s ease-out", opacity: isOpen ? 0 : 1, transform: isOpen ? "translateY(8px)" : "translateY(0)", pointerEvents: isOpen ? "none" : "auto" }}>
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open chat"
          style={{
            position: "relative",
            background: "rgba(255,255,255,0.35)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            padding: "14px",
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.3)",
            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.3s",
          }}
        >
          <svg style={{ width: "20px", height: "20px", color: "#475569" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span style={{ position: "absolute", top: "-2px", right: "-2px", width: "10px", height: "10px", borderRadius: "50%", background: "#94a3b8", border: "2px solid white" }} />
        </button>
      </div>
    </div>,
    document.body
  );
};
