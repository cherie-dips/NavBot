import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MdOutlineRefresh } from "react-icons/md";
import { DEFAULT_THEME } from "@repo/widget-theme";
import type { Message, ResolvedWidgetTheme, SocialLink, WidgetTheme } from "./types";

import { renderBotText, renderPageLinks } from "./markdown";
import { SocialEmbedModal } from "./SocialEmbedModal";
import { ensureGoogleFont, getConfig, normalizeFontFamily, textOnBg } from "./theme";
import {
  loadHistory,
  saveHistory,
  clearHistory,
  loadSessionToken,
  saveSessionToken,
  loadUiState,
  saveUiState,
} from "./storage";
import { CADENCE, SOFT_BLOCK_CHARS, nextBlockEnd, prefersReducedMotion } from "./stream-cadence";

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
  /** What the bot is doing right now ("Reading 4 pages"), shown instead of bare dots. */
  const [statusStage, setStatusStage] = useState<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<Array<{ label: string; question: string }>>([]);
  const [faqDismissed, _setFaqDismissed] = useState(savedUi.faqDismissed);
  const [socialEmbed, setSocialEmbed] = useState<SocialLink | null>(null);
  /** Null until the handshake replies, or when the site has no limit configured. */
  const [questionsLeft, setQuestionsLeft] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [limitMessage, setLimitMessage] = useState<string>("");
  const sessionTokenRef = useRef<string | null>(null);

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
  /** The scrolling viewport, so anchoring can measure and position without guessing. */
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Wrapper around the newest exchange — this is what gets pinned near the top. */
  const anchorRef = useRef<HTMLDivElement>(null);

  // --- streaming display queue ---
  const pendingRef = useRef("");            // arrived, not yet shown
  const shownRef = useRef("");              // painted so far
  const streamDoneRef = useRef(true);       // has the SSE stream closed
  const tickerRef = useRef<number | null>(null);
  const firstDeltaAtRef = useRef(0);
  const streamingIdRef = useRef<number | null>(null);

  /**
   * Space reserved under the newest answer so it can grow downward without the
   * viewport moving. Set when a question is sent, released when the answer is done.
   */
  const [reservedSpace, setReservedSpace] = useState(0);
  /** False as soon as the visitor scrolls up — their position is theirs from then on. */
  const stickToBottomRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);

  type ChatRole = "user" | "assistant";

  useEffect(() => {
    setMounted(true);
    // Ping the API to trigger a background sitemap sync so knowledge is fresh
    fetch(`${apiBase}/api/sites/${encodeURIComponent(siteId)}/ping`).catch(() => {});
  }, []);

  // Session handshake. Reuses the stored token so today's count carries across visits;
  // the server mints a new one if it is missing or no longer valid.
  useEffect(() => {
    const stored = loadSessionToken(siteId);
    sessionTokenRef.current = stored;

    fetch(`${apiBase}/api/chat/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, sessionToken: stored ?? undefined }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.token) return;
        sessionTokenRef.current = data.token;
        saveSessionToken(siteId, data.token);
        setQuestionsLeft(typeof data.remaining === "number" ? data.remaining : null);
        if (data.limitMessage) setLimitMessage(data.limitMessage);
        if (data.limitReached) setLimitReached(true);
      })
      // A failed handshake must not disable chat — the server enforces the cap anyway.
      .catch(() => {});
  }, [apiBase, siteId]);
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
  /**
   * Follow the conversation without chasing it.
   *
   * This used to smooth-scroll to the bottom on every `messages` change, which during
   * streaming meant restarting a smooth-scroll animation on every token — each one
   * interrupting the last. That was the stutter, and it also made scrolling up
   * impossible because the next token yanked the view straight back down.
   *
   * Now the newest answer is pinned near the top of the viewport when the question is
   * sent, and the text grows downward into reserved space. Nothing scrolls while the
   * answer streams unless it outgrows that space AND the visitor never scrolled away.
   */
  useEffect(() => {
    if (streamingIdRef.current !== null) return; // anchored; leave the viewport alone
    if (!stickToBottomRef.current) return;       // the visitor is reading further up
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Track whether the visitor has taken over scrolling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 48;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * Put the newest exchange at the top of the viewport and reserve room beneath it, so
   * the answer fills empty space rather than pushing the page around as it arrives.
   *
   * This is two steps on purpose. Scrolling the question to the top is only possible
   * once the spacer exists — without it the container has nothing to scroll into — so
   * the reservation is made here and the scroll happens in the layout effect below,
   * after React has committed the new height.
   */
  const pendingAnchorRef = useRef(false);

  const anchorNewestExchange = () => {
    const view = scrollRef.current;
    const anchor = anchorRef.current;
    if (!view || !anchor) return;
    // Leave the question visible above the answer, then hand the rest to the answer.
    setReservedSpace(Math.max(0, view.clientHeight - anchor.offsetHeight - 24));
    pendingAnchorRef.current = true;
  };

  useLayoutEffect(() => {
    if (!pendingAnchorRef.current) return;
    pendingAnchorRef.current = false;
    const view = scrollRef.current;
    const anchor = anchorRef.current;
    if (!view || !anchor) return;
    view.scrollTop = Math.max(0, anchor.offsetTop - view.offsetTop - 12);
    stickToBottomRef.current = true;
  }, [reservedSpace]);
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
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `${apiBase}/api/sites/${encodeURIComponent(siteId)}/faqs`);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (Array.isArray(data?.faqs)) setFaqs(data.faqs);
      } catch { /* ignore */ }
    };
    xhr.onerror = () => {};
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

  /**
   * Streams the answer over SSE so text appears while it is still being written.
   * Falls back to the non-streaming endpoint if streaming is unavailable, so an
   * older server or a proxy that buffers events still produces an answer.
   */
  /**
   * Releases one block per tick into the visible message.
   *
   * The interval adapts: it holds a readable rhythm while text is still arriving, and
   * shortens when the buffer has run ahead — so a cached or very fast answer is revealed
   * briskly rather than being artificially throttled, while still arriving as lines.
   */
  const startTicker = (botId: number) => {
    if (tickerRef.current !== null) return;

    const tick = () => {
      const done = streamDoneRef.current;
      const end = nextBlockEnd(pendingRef.current, done);

      // Nothing releasable yet. Show something anyway if the first block is overdue,
      // so waiting for a boundary can never delay first paint by more than firstBlockMs.
      if (end === -1) {
        const overdue =
          shownRef.current.length === 0 &&
          firstDeltaAtRef.current > 0 &&
          Date.now() - firstDeltaAtRef.current > CADENCE.firstBlockMs &&
          pendingRef.current.length > 0;
        if (!overdue) {
          if (done && pendingRef.current.length === 0) return stopTicker();
          tickerRef.current = window.setTimeout(tick, CADENCE.base);
          return;
        }
      }

      const cut = end === -1 ? pendingRef.current.length : end;
      shownRef.current += pendingRef.current.slice(0, cut);
      pendingRef.current = pendingRef.current.slice(cut);

      const text = shownRef.current;
      setMessages((prev) =>
        prev.some((m) => m.id === botId)
          ? prev.map((m) => (m.id === botId ? { ...m, text } : m))
          : [...prev, { id: botId, text, sender: "bot" as const, timestamp: new Date().toISOString(), streaming: true }]
      );

      if (done && pendingRef.current.length === 0) return stopTicker();

      // A release that shows nothing (a stray newline at a chunk boundary) should not
      // cost a visible beat — go straight on to the next block.
      if (!text.slice(shownRef.current.length - cut).trim()) {
        tickerRef.current = window.setTimeout(tick, 0);
        return;
      }

      // Blocks still queued after the stream closed are drained inside drainMs.
      const remaining = Math.max(1, Math.ceil(pendingRef.current.length / SOFT_BLOCK_CHARS));
      const interval = done
        ? Math.max(CADENCE.fast, Math.floor(CADENCE.drainMs / remaining))
        : pendingRef.current.length > SOFT_BLOCK_CHARS * 3
          ? CADENCE.fast
          : CADENCE.base;

      tickerRef.current = window.setTimeout(tick, interval);
    };

    tickerRef.current = window.setTimeout(tick, CADENCE.base);
  };

  const stopTicker = () => {
    if (tickerRef.current !== null) {
      clearTimeout(tickerRef.current);
      tickerRef.current = null;
    }
  };

  /** Flush everything at once — used on completion, abort, and reduced-motion. */
  const flushQueue = (botId: number) => {
    stopTicker();
    if (!pendingRef.current) return;
    shownRef.current += pendingRef.current;
    pendingRef.current = "";
    const text = shownRef.current;
    setMessages((prev) =>
      prev.some((m) => m.id === botId)
        ? prev.map((m) => (m.id === botId ? { ...m, text } : m))
        : [...prev, { id: botId, text, sender: "bot" as const, timestamp: new Date().toISOString(), streaming: true }]
    );
  };

  useEffect(() => () => stopTicker(), []);

  /** Reads the token from the response so a server-minted one is picked up straight away. */
  const captureSessionToken = (headers: Headers) => {
    const t = headers.get("X-Navbot-Session");
    if (t && t !== sessionTokenRef.current) {
      sessionTokenRef.current = t;
      saveSessionToken(siteId, t);
    }
  };

  const chatHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (sessionTokenRef.current) h["X-Navbot-Session"] = sessionTokenRef.current;
    return h;
  };

  /** Renders the site's own cut-off message and closes the composer for the day. */
  const showLimitReached = (message: string | undefined, id: number) => {
    const text =
      message?.trim() ||
      "You've reached the daily question limit. Please contact our team by email for further questions.";
    setLimitReached(true);
    setLimitMessage(text);
    setQuestionsLeft(0);
    addMessage({ id, text, sender: "bot", timestamp: new Date().toISOString() });
  };

  const sendText = async (text: string) => {
    if (!text.trim()) return;
    if (limitReached) return;
    setError(null);
    setFaqDismissed(true);

    const userMessage: Message = { id: Date.now(), text: text.trim(), sender: "user", timestamp: new Date().toISOString() };
    const messagesWithUser = [...messages, userMessage];
    addMessage(userMessage);
    setInputValue("");
    setIsTyping(true);
    setStatusStage("Searching pages");

    const botId = Date.now() + 1;

    // Fresh queue for this answer, and pin the question near the top so the reply has
    // somewhere to grow. Measured after paint, once the new message is in the DOM.
    const reducedMotion = prefersReducedMotion();
    pendingRef.current = "";
    shownRef.current = "";
    streamDoneRef.current = false;
    firstDeltaAtRef.current = 0;
    streamingIdRef.current = botId;
    stopTicker();
    // Two frames: the first lets React commit the new user message, the second measures
    // it. Measuring in the same frame reads a layout that does not exist yet.
    requestAnimationFrame(() => requestAnimationFrame(anchorNewestExchange));
    // Tells the server this bundle can render [POST:<url>] as an inline preview chip.
    // Without it the server strips the tags and returns a trailing list instead, so a
    // cached older bundle degrades cleanly rather than printing raw markers.
    const payload = JSON.stringify({
      siteId,
      message: userMessage.text,
      history: buildApiHistory(messagesWithUser),
      features: ["post-chips"],
    });

    const controller = new AbortController();
    streamAbortRef.current = controller;

    try {
      const res = await fetch(`${apiBase}/api/chat/stream`, {
        method: "POST",
        headers: chatHeaders(),
        body: payload,
        signal: controller.signal,
      });
      captureSessionToken(res.headers);

      // Out of questions: the server answers with JSON instead of opening a stream, so
      // the visitor sees the site's own message rather than a failure.
      const contentType = res.headers.get("Content-Type") ?? "";
      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json();
        if (data?.limitReached) {
          showLimitReached(data.answer, botId);
          return;
        }
      }

      if (!res.ok || !res.body) throw new Error(`stream unavailable (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let started = false;

      const handleEvent = (name: string, dataRaw: string) => {
        let data: Record<string, unknown>;
        try { data = JSON.parse(dataRaw); } catch { return; }

        if (name === "status") {
          const stage = String(data.stage ?? "");
          const detail = data.detail ? ` ${String(data.detail)}` : "";
          setStatusStage(
            stage === "planning" ? "Understanding your question"
              : stage === "searching" ? "Searching pages"
              : stage === "researching" ? "Checking the latest on the site"
              : stage === "reading" ? `Reading${detail}`
              : stage === "reasoning" ? "Working through the details"
              : "Writing"
          );
        } else if (name === "delta") {
          const chunk = String(data.text ?? "");
          acc += chunk;
          if (!started) {
            started = true;
            firstDeltaAtRef.current = Date.now();
            setIsTyping(false);
            setStatusStage(null);
          }
          if (reducedMotion) {
            // No pacing for visitors who asked for less movement — paint on arrival.
            shownRef.current = acc;
            setMessages((prev) =>
              prev.some((m) => m.id === botId)
                ? prev.map((m) => (m.id === botId ? { ...m, text: acc } : m))
                : [...prev, { id: botId, text: acc, sender: "bot" as const, timestamp: new Date().toISOString(), streaming: true }]
            );
          } else {
            pendingRef.current += chunk;
            startTicker(botId);
          }
        } else if (name === "done") {
          const usage = (data as { usage?: { remaining?: number } }).usage;
          if (typeof usage?.remaining === "number") setQuestionsLeft(usage.remaining);
          const finalText = String(data.answer ?? acc);

          // `done` carries the authoritative answer, which differs slightly from the
          // streamed text (glossary applied, markers stripped). Replacing the whole
          // string flashes; when the visible prefix already matches, queue only the
          // remainder so the tail simply continues arriving.
          streamDoneRef.current = true;
          if (!reducedMotion) {
            const alreadyQueued = shownRef.current + pendingRef.current;
            if (finalText.startsWith(alreadyQueued)) {
              pendingRef.current += finalText.slice(alreadyQueued.length);
              startTicker(botId);
            } else {
              // Diverged — fall back to showing the authoritative text outright.
              flushQueue(botId);
              shownRef.current = finalText;
            }
          }
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === botId);
            const finished: Message = {
              id: botId,
              text: finalText,
              sender: "bot",
              timestamp: new Date().toISOString(),
              pageLinks: data.pageLinks as Message["pageLinks"],
              socialLinks: data.socialLinks as SocialLink[] | undefined,
              followUps: data.followUps as string[] | undefined,
              streaming: false,
            };
            const next = exists ? prev.map((m) => (m.id === botId ? finished : m)) : [...prev, finished];
            saveHistory(siteId, next);
            return next;
          });
        } else if (name === "error") {
          if (!started) throw new Error(String(data.message ?? "stream error"));
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let name = "message";
          const dataLines: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) name = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length) handleEvent(name, dataLines.join("\n"));
        }
      }

      if (!started) throw new Error("stream produced no text");
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn("Streaming failed, falling back:", err);
      try {
        const res = await fetch(`${apiBase}/api/chat`, {
          method: "POST",
          headers: chatHeaders(),
          body: payload,
        });
        captureSessionToken(res.headers);
        // The fallback returns one complete answer, so the queue has no part to play.
        stopTicker();
        pendingRef.current = "";
        streamDoneRef.current = true;
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (data?.limitReached) {
          showLimitReached(data.answer, botId);
          return;
        }
        if (typeof data?.usage?.remaining === "number") setQuestionsLeft(data.usage.remaining);
        addMessage({
          id: botId,
          text: data.answer || "I couldn't put together an answer for that. Please try rephrasing.",
          sender: "bot",
          timestamp: new Date().toISOString(),
          pageLinks: data.pageLinks,
          socialLinks: data.socialLinks,
          followUps: data.followUps,
        });
      } catch (e2) {
        console.error("Chat error:", e2);
        setError("I'm having trouble reaching the assistant. Please try again in a moment.");
        addMessage({
          id: botId + 1,
          text: "I'm having trouble connecting right now. Please try again in a moment — or reach the team directly at info@plaksha.edu.in.",
          sender: "bot",
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      streamAbortRef.current = null;
      setIsTyping(false);
      setStatusStage(null);

      // Whatever happened — finished, aborted, fell back — nothing more will arrive, so
      // release the queue and hand scrolling back to the visitor.
      streamDoneRef.current = true;
      streamingIdRef.current = null;
      if (pendingRef.current) flushQueue(botId);
      else stopTicker();
      // Collapse the reserved space only once the answer is settled, so the page does
      // not jump while the last lines are still being painted.
      window.setTimeout(() => setReservedSpace(0), CADENCE.drainMs);
    }
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
      if (sessionTokenRef.current) xhr.setRequestHeader("X-Navbot-Session", sessionTokenRef.current);
        xhr.onload = () => {
          try {
            if (xhr.status < 200 || xhr.status >= 300) throw new Error(`Voice request failed with status ${xhr.status}`);
            const data = JSON.parse(xhr.responseText) as { answer: string; transcript?: string | null; error?: string; limitReached?: boolean; pageLinks?: Array<{ url: string; title: string }>; socialLinks?: SocialLink[] };
            if (data.limitReached) { showLimitReached(data.answer, Date.now() + 1); return; }
            setMessages((prev) => prev.map((m) => m.id === placeholderId ? { ...m, text: data.transcript ? `🎤 "${data.transcript}"` : `🎤 Voice message (${recordingTime}s)` } : m));
            addMessage({ id: Date.now() + 1, text: data.answer || "I received your voice message.", sender: "bot", timestamp: new Date().toISOString(), voiceReply: true, pageLinks: data.pageLinks, socialLinks: data.socialLinks });
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
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px", overflowAnchor: "none" }}>
          {messages.map((message, messageIndex) => (
            <div
              key={message.id}
              // The last user message is the anchor: it is pinned near the top and the
              // answer grows into the space reserved beneath it.
              ref={
                message.sender === "user" && messageIndex === messages.length - 1
                  ? anchorRef
                  : undefined
              }
              style={{ display: "flex", flexDirection: "column", alignItems: message.sender === "user" ? "flex-end" : "flex-start" }}
            >
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
                {message.sender === "bot" && !message.isVoice
                  ? renderBotText(message.text, setSocialEmbed)
                  : message.text}
                {message.sender === "bot" && message.pageLinks && renderPageLinks(message.pageLinks)}
              </div>
              {/* Suggested next questions — the model emits these with the answer, so they cost no extra latency. */}
              {message.sender === "bot" && !message.streaming && message.followUps && message.followUps.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px", maxWidth: "100%" }}>
                  {message.followUps.map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, followUps: [] } : m)));
                        void sendText(q);
                      }}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        fontSize: "12.5px",
                        lineHeight: 1.35,
                        padding: "6px 11px",
                        borderRadius: "14px",
                        background: "rgba(255,255,255,0.55)",
                        border: `1px solid ${theme.iconColor}33`,
                        color: "#334155",
                        fontWeight: 500,
                        maxWidth: "100%",
                        overflowWrap: "break-word",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.9)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.55)"; }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
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
              <div style={{ background: theme.botBubbleBg, border: "1px solid rgba(255,255,255,0.2)", padding: "10px 14px", borderRadius: "2px 16px 16px 16px", display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: "6px", height: "6px", background: theme.iconColor, borderRadius: "50%", animation: "bounce 1s infinite", animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
                {statusStage && (
                  <span aria-live="polite" style={{ fontSize: "12px", color: theme.iconColor, opacity: 0.75 }}>
                    {statusStage}…
                  </span>
                )}
              </div>
            </div>
          )}
          {/* Room for the answer to grow downward without moving the viewport. */}
          {reservedSpace > 0 && (
            <div aria-hidden="true" style={{ flexShrink: 0, height: `${reservedSpace}px` }} />
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
          {limitReached ? (
            <div style={{ marginBottom: "8px", fontSize: "12px", lineHeight: 1.5, color: "#7c5312", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: "8px", padding: "8px 10px" }}>
              {limitMessage || "You've reached today's question limit."}
            </div>
          ) : questionsLeft !== null && questionsLeft <= 3 ? (
            // Only warn near the end. A counter on every message would nag.
            <div style={{ marginBottom: "8px", fontSize: "11px", color: theme.timestampColor, textAlign: "center" }}>
              {questionsLeft === 0
                ? "That was your last question for today."
                : `${questionsLeft} question${questionsLeft === 1 ? "" : "s"} left today`}
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: glassBg, border: "1px solid rgba(255,255,255,0.2)", borderRadius: "14px", padding: "4px 4px 4px 14px" }}>
            <input
              type="text"
              placeholder={limitReached ? "Daily limit reached" : isRecording ? "Recording… tap stop" : "Type a message…"}
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: "13px", color: "#1e293b", padding: "8px 0", fontFamily: "inherit" }}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={isRecording || limitReached}
            />
            {/* Voice Button */}
            <button onClick={isRecording ? stopRecording : startRecording} disabled={limitReached} title={isRecording ? "Stop recording" : "Record voice message"}
              style={{ flexShrink: 0, width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", border: "none", cursor: limitReached ? "default" : "pointer", opacity: limitReached ? 0.4 : 1, background: isRecording ? "rgba(239,68,68,0.1)" : "transparent", color: isRecording ? "#ef4444" : theme.iconColor, transition: "all 0.2s" }}>
              {isRecording
                ? <svg style={{ width: "18px", height: "18px" }} fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                : <svg style={{ width: "18px", height: "18px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              }
            </button>
            {/* Send Button — themed */}
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isRecording || limitReached}
              style={{
                flexShrink: 0, width: "34px", height: "34px",
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "10px", border: "none",
                cursor: !inputValue.trim() || isRecording || limitReached ? "default" : "pointer",
                background: inputValue.trim() && !isRecording && !limitReached ? theme.sendBtnBg : "transparent",
                color: inputValue.trim() && !isRecording && !limitReached ? theme.sendBtnColor : theme.iconColor,
                opacity: !inputValue.trim() || isRecording || limitReached ? 0.4 : 1,
                transition: "all 0.2s",
              }}>
              <svg style={{ width: "16px", height: "16px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          {theme.privacyPolicyUrl && (
            <div style={{ marginTop: "6px", fontSize: "10px", color: theme.timestampColor, textAlign: "center" }}>
              Messages are processed by AI.{" "}
              <a
                href={theme.privacyPolicyUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                Privacy policy
              </a>
            </div>
          )}
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
      {socialEmbed && (
        <SocialEmbedModal
          url={socialEmbed.url}
          platform={socialEmbed.platform}
          title={socialEmbed.title}
          onClose={() => setSocialEmbed(null)}
          fontFamily={theme.fontFamily}
        />
      )}
    </div>,
    document.body
  );
};

