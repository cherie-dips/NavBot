/**
 * Lightbox for a cited social post, rendered into document.body via a portal so the
 * host page's stacking context cannot clip it.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { getSocialEmbedUrl } from "./social";

export function SocialEmbedModal({ url, platform, title, onClose, fontFamily }: {
  url: string;
  platform: string;
  title: string;
  onClose: () => void;
  fontFamily: string;
}) {
  const embedUrl = getSocialEmbedUrl(url, platform);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handler);
    };
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: 10001,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "min(380px, 90vw)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid #e2e8f0",
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#334155",
            textTransform: "capitalize" as const,
          }}>
            {platform}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "4px", borderRadius: "50%", color: "#64748b",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {embedUrl ? (
          <iframe
            src={embedUrl}
            style={{ width: "100%", height: "min(520px, 70vh)", border: "none", flexGrow: 1 }}
            allow="encrypted-media"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        ) : (
          <div style={{
            padding: "32px 24px",
            textAlign: "center" as const,
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
            gap: "12px",
          }}>
            <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>{title}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "10px 20px",
                borderRadius: "10px",
                background: "#2563eb",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              Open on {platform}
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

