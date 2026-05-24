import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MdOutlineRefresh } from "react-icons/md";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  timestamp: string;
  isVoice?: boolean;
  voiceReply?: boolean;
}

function renderBotText(raw: string): React.ReactNode {
  const lines = raw.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;
  const isTableSeparator = (line: string): boolean =>
    /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
  const isTableLikeRow = (line: string): boolean =>
    line.trim().indexOf("|") !== -1 && line.trim().replace(/\|/g, "").trim().length > 0;
  const splitTableCells = (line: string): string[] =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  let subListItems: React.ReactNode[] | null = null;

  const flushSubList = () => {
    if (!subListItems || subListItems.length === 0) return;
    const subUl = (
      <ul
        key={`sub-ul-${elements.length}-${listItems.length}`}
        style={{ margin: "2px 0 2px 0", paddingLeft: "18px", listStyleType: "circle", fontFamily: "inherit" }}
      >
        {subListItems}
      </ul>
    );
    if (listItems.length > 0) {
      const lastLi = listItems[listItems.length - 1] as React.ReactElement<{ children: React.ReactNode }>;
      listItems[listItems.length - 1] = (
        <li key={lastLi.key} style={{ marginBottom: "2px", fontFamily: "inherit" }}>
          {lastLi.props.children}
          {subUl}
        </li>
      );
    } else {
      listItems.push(subUl);
    }
    subListItems = null;
  };

  const flushList = () => {
    flushSubList();
    if (listItems.length === 0) return;
    if (listType === "ol") {
      elements.push(
        <ol
          key={`ol-${elements.length}`}
          style={{ margin: "6px 0", paddingLeft: "20px", listStyleType: "decimal", fontFamily: "inherit" }}
        >
          {listItems}
        </ol>
      );
    } else {
      elements.push(
        <ul
          key={`ul-${elements.length}`}
          style={{ margin: "6px 0", paddingLeft: "20px", listStyleType: "disc", fontFamily: "inherit" }}
        >
          {listItems}
        </ul>
      );
    }
    listItems = [];
    listType = null;
  };

  const linkifyText = (text: string, keyPrefix: string): React.ReactNode[] => {
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, idx) => {
      if (/^https?:\/\/[^\s]+$/i.test(part)) {
        return (
          <a
            key={`${keyPrefix}-lnk-${idx}`}
            href={part}
            target="_self"
            rel="noopener noreferrer"
            style={{
              color: "#2563eb",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
              fontFamily: "inherit",
              cursor: "pointer",
              pointerEvents: "auto",
            }}
          >
            {part}
          </a>
        );
      }
      return <React.Fragment key={`${keyPrefix}-txt-${idx}`}>{part}</React.Fragment>;
    });
  };

  const formatInline = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    const boldRe = /\*\*(.+?)\*\*/g;
    let match: RegExpExecArray | null;
    let lastEnd = 0;
    let idx = 0;
    while ((match = boldRe.exec(text)) !== null) {
      if (match.index > lastEnd) {
        parts.push(...linkifyText(text.slice(lastEnd, match.index), `seg-${idx}-pre`));
      }
      parts.push(<strong key={`b-${idx++}`}>{match[1]}</strong>);
      lastEnd = match.index + match[0].length;
    }
    if (lastEnd < text.length) {
      parts.push(...linkifyText(text.slice(lastEnd), `seg-${idx}-post`));
    }
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  const renderSourcesLine = (line: string, key: number): React.ReactNode | null => {
    const sourceMatch = line.match(/^source\s*:\s*(.+)$/i);
    if (!sourceMatch) return null;
    const rawItems = sourceMatch[1]
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 2);
    if (rawItems.length === 0) return null;
    return (
      <p
        key={`src-${key}`}
        style={{
          margin: "4px 0",
          fontFamily: "inherit",
          fontSize: "inherit",
          fontWeight: "inherit",
          lineHeight: "inherit",
          color: "inherit",
        }}
      >
        <span>Source: </span>
        <br />
        {rawItems.map((item, i) => {
          const urlMatch = item.match(/https?:\/\/[^\s]+/i);
          const url = urlMatch ? urlMatch[0] : item;
          return (
            <React.Fragment key={`src-item-${i}`}>
              <span
                style={{
                  display: "block",
                  fontSize: "inherit",
                  lineHeight: 1.4,
                  fontFamily: "inherit",
                  fontWeight: "inherit",
                }}
              >
                {`${i + 1}. `}
                <a
                  href={url}
                  target="_self"
                  rel="noopener noreferrer"
                  style={{
                    color: "#2563eb",
                    textDecoration: "underline",
                    textUnderlineOffset: "2px",
                    fontFamily: "inherit",
                    cursor: "pointer",
                    pointerEvents: "auto",
                    fontSize: "inherit",
                  }}
                >
                  {url}
                </a>
              </span>
            </React.Fragment>
          );
        })}
      </p>
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (trimmed === "") { flushList(); continue; }
    if (isTableLikeRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
      flushList();
      const headers = splitTableCells(trimmed);
      const rowLines: string[] = [];
      i += 2;
      while (i < lines.length) {
        const candidate = lines[i]!.trim();
        if (!isTableLikeRow(candidate) || isTableSeparator(candidate)) break;
        rowLines.push(candidate);
        i++;
      }
      i--;
      const rows = rowLines.map(splitTableCells).filter((cells) => cells.length > 0);
      elements.push(
        <div key={`tbl-wrap-${elements.length}`} style={{ width: "100%", overflowX: "auto", margin: "6px 0", fontFamily: "inherit" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
              fontFamily: "inherit",
              fontSize: "inherit",
              lineHeight: "inherit",
            }}
          >
            <thead>
              <tr>
                {headers.map((h, idx) => (
                  <th
                    key={`th-${idx}`}
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid rgba(15,23,42,0.2)",
                      padding: "4px 6px",
                      fontWeight: 600,
                      fontFamily: "inherit",
                      wordBreak: "break-word",
                    }}
                  >
                    {formatInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((cells, rIdx) => (
                <tr key={`tr-${rIdx}`}>
                  {headers.map((_, cIdx) => (
                    <td
                      key={`td-${rIdx}-${cIdx}`}
                      style={{
                        borderBottom: "1px solid rgba(15,23,42,0.08)",
                        padding: "4px 6px",
                        verticalAlign: "top",
                        fontFamily: "inherit",
                        wordBreak: "break-word",
                      }}
                    >
                      {formatInline(cells[cIdx] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    const indent = line.search(/\S/);
    const bulletMatch = trimmed.match(/^[-•*]\s+(.+)/);
    const numberMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (bulletMatch) {
      const isNested = indent >= 2;
      if (isNested && listType === "ul" && listItems.length > 0) {
        if (!subListItems) subListItems = [];
        subListItems.push(
          <li key={`sli-${i}`} style={{ marginBottom: "2px", fontFamily: "inherit" }}>
            {formatInline(bulletMatch[1]!)}
          </li>
        );
      } else {
        flushSubList();
        if (listType !== "ul") flushList();
        listType = "ul";
        listItems.push(
          <li key={`li-${i}`} style={{ marginBottom: "2px", fontFamily: "inherit" }}>
            {formatInline(bulletMatch[1]!)}
          </li>
        );
      }
    } else if (numberMatch) {
      flushSubList();
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(
        <li key={`li-${i}`} style={{ marginBottom: "2px", fontFamily: "inherit" }}>
          {formatInline(numberMatch[1]!)}
        </li>
      );
    } else {
      flushSubList();
      flushList();
      const sourceNode = renderSourcesLine(trimmed, i);
      if (sourceNode) {
        elements.push(sourceNode);
        continue;
      }
      elements.push(
        <p key={`p-${i}`} style={{ margin: "4px 0", fontFamily: "inherit" }}>
          {formatInline(trimmed)}
        </p>
      );
    }
  }
  flushSubList();
  flushList();
  return <>{elements}</>;
}

type WidgetTheme = {
  primary?: string;
  launcherBg?: string;
  botBubbleBg?: string;
  userBubbleBg?: string;
  headerTextColor?: string;
  timestampColor?: string;
  iconColor?: string;
  sendBtnBg?: string;
  sendBtnColor?: string;
  /** Backward compatibility for older embeds using `font` key */
  font?: string;
  fontFamily?: string;
  widgetOpacity?: number;
};

type ResolvedWidgetTheme = {
  primary: string;
  launcherBg: string;
  botBubbleBg: string;
  userBubbleBg: string;
  headerTextColor: string;
  timestampColor: string;
  iconColor: string;
  sendBtnBg: string;
  sendBtnColor: string;
  fontFamily: string;
  widgetOpacity: number;
};

type NavbotConfig = {
  apiBase?: string;
  siteId?: string;
  theme?: WidgetTheme;
};

declare global {
  interface Window {
    NAVBOT_CONFIG?: NavbotConfig;
  }
}

const DEFAULT_THEME: ResolvedWidgetTheme = {
  primary: "#2E3538",
  launcherBg: "#2E3538",
  botBubbleBg: "rgba(255,255,255,0.4)",
  userBubbleBg: "rgba(0,0,0,0.06)",
  headerTextColor: "#2E3538",
  timestampColor: "#94a3b8",
  iconColor: "#94a3b8",
  sendBtnBg: "#2E3538",
  sendBtnColor: "#ffffff",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  widgetOpacity: 0.45,
};

const GOOGLE_FONT_MAP: Record<string, { family: string; stack: string }> = {
  inter:        { family: "Inter",        stack: 'Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' },
  poppins:      { family: "Poppins",      stack: 'Poppins, "Segoe UI", Roboto, Arial, sans-serif' },
  roboto:       { family: "Roboto",       stack: 'Roboto, "Segoe UI", Arial, sans-serif' },
  "open sans":  { family: "Open Sans",    stack: '"Open Sans", "Segoe UI", Roboto, Arial, sans-serif' },
  lato:         { family: "Lato",         stack: 'Lato, "Segoe UI", Roboto, Arial, sans-serif' },
  montserrat:   { family: "Montserrat",   stack: 'Montserrat, "Segoe UI", Roboto, Arial, sans-serif' },
  merriweather: { family: "Merriweather", stack: "Merriweather, Georgia, serif" },
};

function normalizeFontFamily(raw?: string): string {
  const v = (raw || "").trim();
  if (!v) return DEFAULT_THEME.fontFamily;
  const key = v.toLowerCase();
  if (key === "system" || key === "system sans" || key === "default") {
    return DEFAULT_THEME.fontFamily;
  }
  if (GOOGLE_FONT_MAP[key]) return GOOGLE_FONT_MAP[key].stack;
  var keys = Object.keys(GOOGLE_FONT_MAP);
  for (var i = 0; i < keys.length; i++) {
    var entry = GOOGLE_FONT_MAP[keys[i]];
    if (v.indexOf(entry.family) === 0) return entry.stack;
  }
  return v;
}

var _loadedFonts: Record<string, boolean> = {};
function ensureGoogleFont(fontStack: string): void {
  if (typeof document === "undefined") return;
  var keys = Object.keys(GOOGLE_FONT_MAP);
  for (var i = 0; i < keys.length; i++) {
    var entry = GOOGLE_FONT_MAP[keys[i]];
    if (fontStack.indexOf(entry.family) !== -1 && !_loadedFonts[entry.family]) {
      _loadedFonts[entry.family] = true;
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(entry.family) + ":wght@300;400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
  }
}

const getConfig = (): { apiBase: string; siteId: string; theme: ResolvedWidgetTheme } => {
  const globalConfig =
    typeof window !== "undefined" ? window.NAVBOT_CONFIG || {} : {};
  const apiBase =
    globalConfig.apiBase ??
    (typeof window !== "undefined"
      ? window.location.protocol === "https:"
        ? window.location.origin
        : `${window.location.protocol}//${window.location.hostname}:3001`
      : "http://localhost:3001");
  const siteId =
    globalConfig.siteId ??
    (typeof window !== "undefined"
      ? window.location.hostname || "unknown-site"
      : "unknown-site");
  const incoming = (globalConfig.theme ?? {}) as WidgetTheme;
  const resolvedFont = normalizeFontFamily(incoming.fontFamily ?? incoming.font);
  ensureGoogleFont(resolvedFont);
  const theme: ResolvedWidgetTheme = { ...DEFAULT_THEME, ...incoming, fontFamily: resolvedFont };
  return { apiBase, siteId, theme };
};

// Determine readable text color on top of a background hex
function textOnBg(hex: string): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return "#ffffff";
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.55 ? "#1e293b" : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

function getHistoryKey(siteId: string) { return `navbot_history_${siteId}`; }

function loadHistory(siteId: string): Message[] {
  try {
    const raw = localStorage.getItem(getHistoryKey(siteId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Message[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveHistory(siteId: string, messages: Message[]) {
  try { localStorage.setItem(getHistoryKey(siteId), JSON.stringify(messages.slice(-50))); }
  catch { /* quota exceeded */ }
}

function clearHistory(siteId: string) {
  try { localStorage.removeItem(getHistoryKey(siteId)); } catch { /* ignore */ }
}

function getUiStateKey(siteId: string) { return `navbot_ui_${siteId}`; }

function loadUiState(siteId: string): { open: boolean; faqDismissed: boolean; width: number } {
  try {
    var raw = sessionStorage.getItem(getUiStateKey(siteId));
    if (!raw) return { open: false, faqDismissed: false, width: 360 };
    var parsed = JSON.parse(raw);
    return { open: !!parsed.open, faqDismissed: !!parsed.faqDismissed, width: typeof parsed.width === "number" ? parsed.width : 360 };
  } catch { return { open: false, faqDismissed: false, width: 360 }; }
}

function saveUiState(siteId: string, state: { open: boolean; faqDismissed: boolean; width: number }) {
  try { sessionStorage.setItem(getUiStateKey(siteId), JSON.stringify(state)); }
  catch { /* quota exceeded */ }
}

const WELCOME_MESSAGE: Message = {
  id: 1,
  text: "Hi there! 👋 How can I help you today?",
  sender: "bot",
  timestamp: new Date().toISOString(),
};


export const ChatWidget: React.FC = () => {
  const { apiBase, siteId, theme: initialTheme } = getConfig();
  const [theme, setTheme] = useState<ResolvedWidgetTheme>(initialTheme);

  const savedUi = typeof window !== "undefined" ? loadUiState(siteId) : { open: false, faqDismissed: false, width: 360 };
  const [isOpen, _setIsOpen] = useState(savedUi.open);
  const [widgetWidth, _setWidgetWidth] = useState(savedUi.width);
  const [mounted, setMounted] = useState(false);
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
  const [faqs, setFaqs] = useState<Array<{ label: string; question: string }>>([]);
  const [faqsLoading, setFaqsLoading] = useState(false);
  const [faqDismissed, _setFaqDismissed] = useState(savedUi.faqDismissed);

  const faqDismissedRef = useRef(savedUi.faqDismissed);
  const isOpenRef = useRef(savedUi.open);
  const widgetWidthRef = useRef(savedUi.width);
  const isResizingRef = useRef(false);

  const setIsOpen = (v: boolean) => {
    _setIsOpen(v);
    isOpenRef.current = v;
    saveUiState(siteId, { open: v, faqDismissed: faqDismissedRef.current, width: widgetWidthRef.current });
  };

  const setFaqDismissed = (v: boolean) => {
    _setFaqDismissed(v);
    faqDismissedRef.current = v;
    saveUiState(siteId, { open: isOpenRef.current, faqDismissed: v, width: widgetWidthRef.current });
  };

  const setWidgetWidth = (w: number) => {
    const clamped = Math.min(600, Math.max(300, w));
    _setWidgetWidth(clamped);
    widgetWidthRef.current = clamped;
    saveUiState(siteId, { open: isOpenRef.current, faqDismissed: faqDismissedRef.current, width: clamped });
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);

  type ChatRole = "user" | "assistant";

  useEffect(() => {
    setMounted(true);
    // Ping the API to trigger a background sitemap sync so knowledge is fresh
    fetch(`${apiBase}/api/sites/${encodeURIComponent(siteId)}/ping`).catch(() => {});
  }, []);
  useEffect(() => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `${apiBase}/api/sites/${encodeURIComponent(siteId)}/widget-config`);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as { theme?: WidgetTheme };
        if (data?.theme) {
          const resolvedFont = normalizeFontFamily(data.theme.fontFamily ?? data.theme.font);
          ensureGoogleFont(resolvedFont);
          setTheme((prev) => ({ ...prev, ...data.theme, fontFamily: resolvedFont }));
        }
      } catch {
        /* ignore malformed response */
      }
    };
    xhr.onerror = () => { /* ignore */ };
    xhr.send();
  }, [apiBase, siteId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { return () => { if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current); }; }, []);

  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(360);

  const onResizeMove = useRef((e: MouseEvent | TouchEvent) => {
    const clientX = "touches" in e ? e.touches[0]!.clientX : e.clientX;
    const delta = resizeStartX.current - clientX;
    setWidgetWidth(resizeStartWidth.current + delta);
  }).current;

  const onResizeEnd = useRef(() => {
    isResizingRef.current = false;
    document.removeEventListener("mousemove", onResizeMove);
    document.removeEventListener("mouseup", onResizeEnd);
    document.removeEventListener("touchmove", onResizeMove);
    document.removeEventListener("touchend", onResizeEnd);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }).current;

  const onResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const clientX = "touches" in e ? e.touches[0]!.clientX : e.clientX;
    resizeStartX.current = clientX;
    resizeStartWidth.current = widgetWidthRef.current;
    document.addEventListener("mousemove", onResizeMove);
    document.addEventListener("mouseup", onResizeEnd);
    document.addEventListener("touchmove", onResizeMove);
    document.addEventListener("touchend", onResizeEnd);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  // Fetch FAQs from the API on mount
  useEffect(() => {
    setFaqsLoading(true);
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `${apiBase}/api/sites/${encodeURIComponent(siteId)}/faqs`);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (Array.isArray(data?.faqs)) setFaqs(data.faqs);
      } catch { /* ignore */ }
      setFaqsLoading(false);
    };
    xhr.onerror = () => { setFaqsLoading(false); };
    xhr.send();
  }, [apiBase, siteId]);

  const addMessage = (msg: Message) => {
    setMessages((prev) => {
      const updated = [...prev, msg];
      saveHistory(siteId, updated);
      return updated;
    });
  };

  const buildApiHistory = (currentMessages: Message[]): Array<{ role: ChatRole; content: string }> =>
    currentMessages.filter((m) => !m.isVoice).slice(-10).map((m) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text,
    }));

  const handleClearChat = () => {
    clearHistory(siteId);
    setMessages([{ ...WELCOME_MESSAGE, timestamp: new Date().toISOString() }]);
    setError(null);
    setFaqDismissed(false);
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingMsgId, setPlayingMsgId] = useState<number | null>(null);
  const [loadingTtsId, setLoadingTtsId] = useState<number | null>(null);

  const playMessageAudio = (msgId: number, text: string) => {
    if (playingMsgId === msgId) {
      audioRef.current?.pause();
      setPlayingMsgId(null);
      return;
    }
    setLoadingTtsId(msgId);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBase}/api/chat/tts`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = () => {
      setLoadingTtsId(null);
      try {
        const data = JSON.parse(xhr.responseText) as { audio?: string };
        if (!data.audio) return;
        const audioSrc = `data:audio/wav;base64,${data.audio}`;
        if (audioRef.current) { audioRef.current.pause(); }
        const audio = new Audio(audioSrc);
        audioRef.current = audio;
        setPlayingMsgId(msgId);
        audio.onended = () => { setPlayingMsgId(null); };
        audio.onerror = () => { setPlayingMsgId(null); };
        audio.play().catch(() => setPlayingMsgId(null));
      } catch { /* ignore */ }
    };
    xhr.onerror = () => { setLoadingTtsId(null); };
    xhr.send(JSON.stringify({ text }));
  };

  const sendText = (text: string) => {
    if (!text.trim()) return;
    setError(null);
    setFaqDismissed(true);
    const userMessage: Message = { id: Date.now(), text: text.trim(), sender: "user", timestamp: new Date().toISOString() };
    const messagesWithUser = [...messages, userMessage];
    addMessage(userMessage);
    setInputValue("");
    setIsTyping(true);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBase}/api/chat`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = () => {
      try {
        if (xhr.status < 200 || xhr.status >= 300) throw new Error(`Chat request failed with status ${xhr.status}`);
        const data = JSON.parse(xhr.responseText) as { answer: string };
        addMessage({ id: Date.now() + 1, text: data.answer || "Sorry, I couldn't generate a response.", sender: "bot", timestamp: new Date().toISOString() });
      } catch (e) {
        console.error("Chat error:", e);
        setError("Something went wrong talking to the assistant. Please try again.");
        addMessage({ id: Date.now() + 2, text: "I'm having trouble connecting right now. Please try again in a moment.", sender: "bot", timestamp: new Date().toISOString() });
      } finally { setIsTyping(false); }
    };
    xhr.onerror = () => { console.error("Chat network error"); setError("Something went wrong talking to the assistant."); setIsTyping(false); };
    xhr.send(JSON.stringify({ siteId, message: userMessage.text, history: buildApiHistory(messagesWithUser) }));
  };

  const handleSend = () => sendText(inputValue);

  const startRecording = () => {
    setError(null);
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const audioChunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.push(event.data); };
      mediaRecorder.onstop = () => {
        const resolvedMime = mediaRecorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunks, { type: resolvedMime });
        const placeholderId = Date.now();
        const placeholder: Message = { id: placeholderId, text: `🎤 Voice message (${recordingTime}s) — transcribing…`, sender: "user", timestamp: new Date().toISOString(), isVoice: true };
        setMessages((prev) => [...prev, placeholder]);
        setIsTyping(true);
        const historySnapshot = buildApiHistory(messages);
        const formData = new FormData();
        formData.append("audio", audioBlob, `voice.${resolvedMime.indexOf("ogg") !== -1 ? "ogg" : resolvedMime.indexOf("wav") !== -1 ? "wav" : "webm"}`);
        formData.append("siteId", siteId);
        formData.append("history", JSON.stringify(historySnapshot));
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${apiBase}/api/chat/voice`);
        xhr.onload = () => {
          try {
            if (xhr.status < 200 || xhr.status >= 300) throw new Error(`Voice request failed with status ${xhr.status}`);
            const data = JSON.parse(xhr.responseText) as { answer: string; transcript?: string | null; error?: string };
            setMessages((prev) => prev.map((m) => m.id === placeholderId ? { ...m, text: data.transcript ? `🎤 "${data.transcript}"` : `🎤 Voice message (${recordingTime}s)` } : m));
            addMessage({ id: Date.now() + 1, text: data.answer || "I received your voice message.", sender: "bot", timestamp: new Date().toISOString(), voiceReply: true });
          } catch (err) {
            console.error("Voice chat error:", err);
            setError("Could not process voice message. Please try typing instead.");
            setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
          } finally { setIsTyping(false); }
        };
        xhr.onerror = () => { console.error("Voice chat network error"); setError("Could not process voice message."); setMessages((prev) => prev.filter((m) => m.id !== placeholderId)); setIsTyping(false); };
        xhr.send(formData);
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = window.setInterval(() => { setRecordingTime((prev) => prev + 1); }, 1000);
    }).catch((err) => { console.error("Mic error:", err); setError("Could not access microphone. Please check your browser permissions."); });
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const formatTime = (seconds: number) => { const mins = Math.floor(seconds / 60); const secs = seconds % 60; return `${mins}:${secs < 10 ? "0" + secs : secs}`; };

  const formatMessageTime = (timestamp: string) => {
    try { return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };

  if (!mounted) return null;

  const resetStyle: React.CSSProperties = {
    all: "initial",
    fontFamily: theme.fontFamily,
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

  const textOnLauncher = textOnBg(theme.launcherBg);
  const panelOpacity = Math.min(1, Math.max(0.2, theme.widgetOpacity ?? DEFAULT_THEME.widgetOpacity));
  const panelBg = `rgba(255,255,255,${panelOpacity.toFixed(2)})`;
  const glassBg = `rgba(255,255,255,${Math.max(0.15, panelOpacity - 0.2).toFixed(2)})`;

  return createPortal(
    <div style={resetStyle}>
      {/* Chat Panel */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: `${widgetWidth}px`,
          height: isOpen ? "520px" : "0px",
          background: panelBg,
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: "24px",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.12)",
          overflow: "hidden",
          transition: isResizingRef.current ? "none" : "all 0.4s cubic-bezier(0.34,1.56,0.64,1)",
          transformOrigin: "bottom right",
          marginBottom: "12px",
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "translateY(0) scale(1)" : "translateY(8px) scale(0.95)",
          pointerEvents: isOpen ? "auto" : "none",
          position: "relative",
        }}
      >
        {/* Resize Handle (left edge) */}
        {isOpen && (
          <div
            onMouseDown={onResizeStart}
            onTouchStart={onResizeStart}
            style={{
              position: "absolute",
              top: "0",
              left: "0",
              width: "6px",
              height: "100%",
              cursor: "ew-resize",
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{
              width: "3px",
              height: "40px",
              borderRadius: "2px",
              background: "rgba(0,0,0,0.12)",
              transition: "background 0.2s",
            }} />
          </div>
        )}
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", flexShrink: 0, borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
          <span style={{ fontWeight: 600, fontSize: "14px", fontStyle: "italic", color: theme.headerTextColor, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
            navbot
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <button onClick={handleClearChat} title="Refresh chat" style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", borderRadius: "50%", color: theme.iconColor, display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = theme.headerTextColor; e.currentTarget.style.background = "rgba(0,0,0,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = theme.iconColor; e.currentTarget.style.background = "none"; }}>
              <MdOutlineRefresh style={{ width: "16px", height: "16px" }} />
            </button>
            <button onClick={() => setIsOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", borderRadius: "50%", color: theme.iconColor, display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = theme.headerTextColor; e.currentTarget.style.background = "rgba(0,0,0,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = theme.iconColor; e.currentTarget.style.background = "none"; }}>
              <svg style={{ width: "16px", height: "16px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {messages.map((message) => (
            <div key={message.id} style={{ display: "flex", flexDirection: "column", alignItems: message.sender === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "85%",
                padding: "10px 14px",
                fontSize: "13px",
                lineHeight: "1.6",
                borderRadius: message.sender === "bot" ? "2px 16px 16px 16px" : "16px 2px 16px 16px",
                background: message.sender === "bot" ? theme.botBubbleBg : theme.userBubbleBg,
                color: message.sender === "bot" ? "#334155" : "#1e293b",
                border: message.sender === "bot" ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(0,0,0,0.06)",
                fontWeight: 500,
                fontStyle: message.isVoice ? "italic" : "normal",
                overflowWrap: "break-word",
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
              }}>
                {message.sender === "bot" && !message.isVoice ? renderBotText(message.text) : message.text}
              </div>
              {/* Play audio button for voice-triggered bot replies */}
              {message.voiceReply && message.sender === "bot" && (
                <button
                  type="button"
                  onClick={() => playMessageAudio(message.id, message.text)}
                  title={playingMsgId === message.id ? "Stop audio" : "Play audio response"}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    marginTop: "4px",
                    padding: "3px 8px",
                    borderRadius: "8px",
                    background: playingMsgId === message.id ? "rgba(71,142,219,0.12)" : "rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.06)",
                    color: playingMsgId === message.id ? "#478EDB" : "#64748b",
                    fontSize: "11px",
                    fontWeight: 500,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { if (playingMsgId !== message.id) e.currentTarget.style.background = "rgba(0,0,0,0.07)"; }}
                  onMouseLeave={(e) => { if (playingMsgId !== message.id) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                >
                  {loadingTtsId === message.id ? (
                    <svg style={{ width: "12px", height: "12px", animation: "pulse 1.5s infinite" }} fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" opacity="0.3"/><circle cx="12" cy="12" r="6"/></svg>
                  ) : playingMsgId === message.id ? (
                    <svg style={{ width: "12px", height: "12px" }} fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                  ) : (
                    <svg style={{ width: "12px", height: "12px" }} fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a6.51 6.51 0 010 13.42v2.06A8.51 8.51 0 0014 3.23z"/></svg>
                  )}
                  {loadingTtsId === message.id ? "Loading…" : playingMsgId === message.id ? "Playing" : "Listen"}
                </button>
              )}
              <span style={{ fontSize: "10px", color: theme.timestampColor, marginTop: "4px", paddingLeft: "4px", opacity: 0.7 }}>
                {formatMessageTime(message.timestamp)}
              </span>
            </div>
          ))}

          {/* FAQ Menu Card */}
          {!faqDismissed && !messages.some((m) => m.sender === "user") && faqs.length > 0 && !isTyping && (
            <div style={{
              alignSelf: "flex-start",
              width: "100%",
              background: glassBg,
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: "16px",
              padding: "14px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: "10px" }}>
                Frequently Asked
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {faqs.map((f, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => sendText(f.question)}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                      padding: "10px 12px",
                      borderRadius: "12px",
                      background: "rgba(0,0,0,0.03)",
                      border: "1px solid rgba(0,0,0,0.06)",
                      color: "#1e293b",
                      fontSize: "12px",
                      fontWeight: 500,
                      lineHeight: "1.3",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.06)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.03)"; }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</span>
                    <span style={{ opacity: 0.4, fontSize: "14px", flexShrink: 0 }}>›</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isTyping && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ background: theme.botBubbleBg, border: "1px solid rgba(255,255,255,0.2)", padding: "10px 14px", borderRadius: "2px 16px 16px 16px", display: "flex", gap: "5px", alignItems: "center" }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ width: "6px", height: "6px", background: theme.iconColor, borderRadius: "50%", animation: "bounce 1s infinite", animationDelay: `${i * 0.15}s` }} />
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

        {/* Input Area */}
        <div style={{ padding: "12px 16px 16px", flexShrink: 0 }}>
          {error && (
            <div style={{ marginBottom: "8px", fontSize: "12px", color: "#ef4444", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "6px 10px" }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: glassBg, border: "1px solid rgba(255,255,255,0.2)", borderRadius: "14px", padding: "4px 4px 4px 14px" }}>
            <input
              type="text"
              placeholder={isRecording ? "Recording… tap stop" : "Type a message…"}
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: "13px", color: "#1e293b", padding: "8px 0", fontFamily: "inherit" }}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={isRecording}
            />
            {/* Voice Button */}
            <button onClick={isRecording ? stopRecording : startRecording} title={isRecording ? "Stop recording" : "Record voice message"}
              style={{ flexShrink: 0, width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", border: "none", cursor: "pointer", background: isRecording ? "rgba(239,68,68,0.1)" : "transparent", color: isRecording ? "#ef4444" : theme.iconColor, transition: "all 0.2s" }}>
              {isRecording
                ? <svg style={{ width: "18px", height: "18px" }} fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                : <svg style={{ width: "18px", height: "18px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              }
            </button>
            {/* Send Button — themed */}
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isRecording}
              style={{
                flexShrink: 0, width: "34px", height: "34px",
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "10px", border: "none",
                cursor: !inputValue.trim() || isRecording ? "default" : "pointer",
                background: inputValue.trim() && !isRecording ? theme.sendBtnBg : "transparent",
                color: inputValue.trim() && !isRecording ? theme.sendBtnColor : theme.iconColor,
                opacity: !inputValue.trim() || isRecording ? 0.4 : 1,
                transition: "all 0.2s",
              }}>
              <svg style={{ width: "16px", height: "16px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Launcher Button — themed */}
      <div style={{ display: "flex", justifyContent: "flex-end", transition: "all 0.4s ease-out", opacity: isOpen ? 0 : 1, transform: isOpen ? "translateY(8px)" : "translateY(0)", pointerEvents: isOpen ? "none" : "auto" }}>
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open chat"
          style={{
            position: "relative",
            background: theme.launcherBg,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            padding: "14px",
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.3)",
            boxShadow: `0 10px 25px -5px ${theme.launcherBg}40, 0 4px 8px -2px rgba(0,0,0,0.08)`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.3s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          <svg style={{ width: "20px", height: "20px", color: textOnLauncher }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span style={{ position: "absolute", top: "-2px", right: "-2px", width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e", border: "2px solid white" }} />
        </button>
      </div>
    </div>,
    document.body
  );
};