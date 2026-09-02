/**
 * The answer renderer.
 *
 * The server sends lightly-marked-up text (headings, bullets, bold, links and
 * `[POST:n]` citation chips) and this turns it into React nodes. It is deliberately a
 * hand-written parser rather than a markdown library: the widget ships as a single
 * bundle to customer pages, and a full markdown dependency costs more than the handful
 * of constructs the answers actually use.
 */
import React from "react";
import type { SocialLink } from "./types";
import { PLATFORM_COLORS, detectSocialPlatform, getSocialEmbedUrl } from "./social";

export function renderBotText(raw: string, onSocialClick?: (link: SocialLink) => void): React.ReactNode {
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

  /**
   * `[POST:<url>]` marks the social post that supports this line. It renders as a
   * compact preview chip right there, so a reel sits beside the point it illustrates
   * instead of in a list at the end of the answer.
   */
  const renderPostChip = (url: string, keyPrefix: string): React.ReactNode => {
    const platform = detectSocialPlatform(url) ?? "instagram";
    const color = PLATFORM_COLORS[platform] || "#2563eb";
    const canEmbed = getSocialEmbedUrl(url, platform) !== null;
    return (
      <button
        key={`${keyPrefix}-post`}
        type="button"
        title={canEmbed ? "Open preview" : "Open post"}
        onClick={(e) => {
          e.preventDefault();
          if (canEmbed && onSocialClick) onSocialClick({ platform, title: "", url });
          else window.open(url, "_blank", "noopener,noreferrer");
        }}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          verticalAlign: "middle",
          margin: "0 0 0 6px",
          padding: "1px 7px 1px 5px",
          borderRadius: "10px",
          border: `1px solid ${color}44`,
          background: `${color}14`,
          fontSize: "11px",
          lineHeight: 1.6,
          color,
          fontWeight: 600,
          fontFamily: "inherit",
          whiteSpace: "nowrap" as const,
        }}
      >
        <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: color, flexShrink: 0 }} />
        preview
      </button>
    );
  };

  const linkifyText = (text: string, keyPrefix: string): React.ReactNode[] => {
    const segments = text.split(/(\[POST:https?:\/\/[^\]]+\])/g);
    if (segments.length > 1) {
      return segments.flatMap((seg, i) => {
        const m = seg.match(/^\[POST:(https?:\/\/[^\]]+)\]$/);
        if (m) return [renderPostChip(m[1]!, `${keyPrefix}-${i}`)];
        return seg ? linkifyPlain(seg, `${keyPrefix}-${i}`) : [];
      });
    }
    return linkifyPlain(text, keyPrefix);
  };

  const linkifyPlain = (text: string, keyPrefix: string): React.ReactNode[] => {
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, idx) => {
      if (/^https?:\/\/[^\s]+$/i.test(part)) {
        const platform = detectSocialPlatform(part);
        if (platform && onSocialClick) {
          const color = PLATFORM_COLORS[platform] || "#2563eb";
          return (
            <button
              key={`${keyPrefix}-soc-${idx}`}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onSocialClick({ platform, title: part, url: part });
              }}
              style={{
                all: "unset",
                cursor: "pointer",
                color,
                textDecoration: "underline",
                textUnderlineOffset: "2px",
                fontFamily: "inherit",
                fontSize: "inherit",
                pointerEvents: "auto",
              }}
            >
              {part}
            </button>
          );
        }
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

export function renderPageLinks(links: Array<{ url: string; title: string }>) {
  if (!links || links.length === 0) return null;
  return (
    <div style={{
      marginTop: "8px",
      paddingTop: "6px",
      borderTop: "1px solid rgba(0,0,0,0.06)",
      fontSize: "12px",
      fontFamily: "inherit",
    }}>
      <span style={{ fontWeight: 600, color: "#475569", fontSize: "11px" }}>
        For More Info →
      </span>
      {links.map((link, i) => (
        <div key={`pl-${i}`} style={{ marginTop: "4px" }}>
          <a
            href={link.url}
            target="_self"
            rel="noopener noreferrer"
            style={{
              color: "#2563eb",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
              fontFamily: "inherit",
              cursor: "pointer",
              pointerEvents: "auto",
              fontSize: "12px",
            }}
          >
            {link.title || link.url}
          </a>
        </div>
      ))}
    </div>
  );
}

