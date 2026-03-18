/**
 * @repo/color-extractor
 *
 * Extracts a color palette from raw HTML by:
 *  1. Parsing inline <style> blocks and <link rel="stylesheet"> refs
 *  2. Scanning all element style attributes
 *  3. Reading CSS custom properties (--color-*, --primary, --brand, etc.)
 *  4. Collecting background-color, color, border-color values
 *  5. Ranking by frequency and contrast to pick a "primary" color
 *
 * No browser / Puppeteer needed — works with the same cheerio already used
 * by the NavBot crawler.
 */

import * as cheerio from "cheerio";
import fetch from "node-fetch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColorEntry {
  hex: string;
  /** "css-var" | "background" | "text" | "border" | "fill" | "stroke" */
  source: string;
  /** How many times this color appeared */
  frequency: number;
  /** Relative luminance 0–1 */
  luminance: number;
}

export interface SitePalette {
  /** The single best "primary" color for the launcher button */
  primary: string;
  /** Up to 8 ranked colors for the picker UI */
  palette: ColorEntry[];
  /** Raw CSS variables found, e.g. { "--primary": "#3b82f6" } */
  cssVars: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Regex helpers
// ---------------------------------------------------------------------------

const HEX_RE = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

const RGB_RE =
  /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)/g;

const HSL_RE =
  /hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*[\d.]+)?\s*\)/g;

// CSS props that are color-bearing
const COLOR_PROPS =
  /\b(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?-color|fill|stroke|outline-color|box-shadow|text-shadow)\s*:/i;

// CSS var names that hint at "primary" role
const PRIMARY_HINT_RE =
  /^--(?:primary|brand|accent|main|theme|key|highlight|action|cta|link)/i;

// Colors we always skip — too neutral / white-noise
const SKIP_COLORS = new Set([
  "#ffffff",
  "#fff",
  "#000000",
  "#000",
  "#transparent",
  "transparent",
  "#0000",
]);

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    const r = parseInt(clean[0]! + clean[0], 16);
    const g = parseInt(clean[1]! + clean[1], 16);
    const b = parseInt(clean[2]! + clean[2], 16);
    return [r, g, b];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** Expand #abc → #aabbcc */
function normalizeHex(hex: string): string {
  const clean = hex.toLowerCase().replace("#", "");
  if (clean.length === 3) {
    return "#" + clean[0]! + clean[0]! + clean[1]! + clean[1]! + clean[2]! + clean[2]!;
  }
  return "#" + clean;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// ---------------------------------------------------------------------------
// Colour extraction from a CSS text block
// ---------------------------------------------------------------------------

function extractColorsFromCss(
  css: string,
  bucket: Map<string, { frequency: number; source: string }>
): Record<string, string> {
  const cssVars: Record<string, string> = {};

  // ── 1. CSS custom properties ─────────────────────────────────────────────
  const varRe = /(--[\w-]+)\s*:\s*([^;}{]+)/g;
  let m: RegExpExecArray | null;
  while ((m = varRe.exec(css)) !== null) {
    const name = m[1]!.trim();
    const value = m[2]!.trim();
    // Only record if value looks like a color
    if (/#[0-9a-fA-F]{3,6}/.test(value) || /rgba?\(/.test(value) || /hsla?\(/.test(value)) {
      cssVars[name] = value;
      const hex = colorValueToHex(value);
      if (hex) {
        const src = PRIMARY_HINT_RE.test(name) ? "css-var-primary" : "css-var";
        addColor(bucket, hex, src);
      }
    }
  }

  // ── 2. Property-value pairs with color ───────────────────────────────────
  // Simple approach: find lines/declarations that mention color props
  const declRe = /([\w-]+)\s*:\s*([^;}{]+)/g;
  while ((m = declRe.exec(css)) !== null) {
    const prop = m[1]!.trim().toLowerCase();
    const value = m[2]!.trim();
    const isColorProp =
      prop === "color" ||
      prop === "background-color" ||
      prop === "background" ||
      prop.endsWith("-color") ||
      prop === "fill" ||
      prop === "stroke";
    if (!isColorProp) continue;
    const source = prop === "color" ? "text" : prop.includes("background") ? "background" : prop;
    const hex = colorValueToHex(value);
    if (hex) addColor(bucket, hex, source);
  }

  // ── 3. Raw hex / rgb / hsl values anywhere in CSS ────────────────────────
  for (const re of [HEX_RE, RGB_RE, HSL_RE]) {
    re.lastIndex = 0;
    while ((m = re.exec(css)) !== null) {
      const hex = colorValueToHex(m[0]);
      if (hex) addColor(bucket, hex, "raw");
    }
  }

  return cssVars;
}

function colorValueToHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (SKIP_COLORS.has(v)) return null;

  // hex
  const hexMatch = v.match(/#[0-9a-fA-F]{3,6}/);
  if (hexMatch) {
    const norm = normalizeHex(hexMatch[0]);
    if (SKIP_COLORS.has(norm) || norm === "#fefefe" || norm === "#fdfdfd" || norm === "#010101" || norm === "#fafafa") return null;
    return norm;
  }

  // rgb
  const rgbMatch = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]!);
    const g = parseInt(rgbMatch[2]!);
    const b = parseInt(rgbMatch[3]!);
    // Skip near-whites and near-blacks
    if (r > 245 && g > 245 && b > 245) return null;
    if (r < 10 && g < 10 && b < 10) return null;
    return rgbToHex(r, g, b);
  }

  // hsl
  const hslMatch = v.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
  if (hslMatch) {
    const [r, g, b] = hslToRgb(
      parseFloat(hslMatch[1]!),
      parseFloat(hslMatch[2]!),
      parseFloat(hslMatch[3]!)
    );
    if (r > 245 && g > 245 && b > 245) return null;
    if (r < 10 && g < 10 && b < 10) return null;
    return rgbToHex(r, g, b);
  }

  return null;
}

function addColor(
  bucket: Map<string, { frequency: number; source: string }>,
  hex: string,
  source: string
) {
  const existing = bucket.get(hex);
  if (existing) {
    existing.frequency += 1;
    // Upgrade source to more specific
    if (source === "css-var-primary") existing.source = source;
  } else {
    bucket.set(hex, { frequency: 1, source });
  }
}

// ---------------------------------------------------------------------------
// Main extraction function — works from HTML string
// ---------------------------------------------------------------------------

export function extractColorsFromHtml(html: string): SitePalette {
  const $ = cheerio.load(html);
  const bucket = new Map<string, { frequency: number; source: string }>();
  let allCssVars: Record<string, string> = {};

  // ── Inline <style> blocks ─────────────────────────────────────────────────
  $("style").each((_, el) => {
    const css = $(el).text();
    const vars = extractColorsFromCss(css, bucket);
    Object.assign(allCssVars, vars);
  });

  // ── Inline style attributes ───────────────────────────────────────────────
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    if (COLOR_PROPS.test(style)) {
      extractColorsFromCss(style, bucket);
    }
  });

  // ── SVG fill / stroke ─────────────────────────────────────────────────────
  $("[fill],[stroke]").each((_, el) => {
    for (const attr of ["fill", "stroke"]) {
      const val = $(el).attr(attr);
      if (val && val !== "none" && val !== "currentColor") {
        const hex = colorValueToHex(val);
        if (hex) addColor(bucket, hex, attr);
      }
    }
  });

  // ── Build ranked palette ──────────────────────────────────────────────────
  const entries: ColorEntry[] = [];
  for (const [hex, meta] of bucket.entries()) {
    const rgb = hexToRgb(hex);
    if (!rgb) continue;
    const lum = relativeLuminance(...rgb);
    entries.push({ hex, source: meta.source, frequency: meta.frequency, luminance: lum });
  }

  // Score: prioritize css-var-primary, then frequency, penalize very high/low lum
  entries.sort((a, b) => {
    const aScore = scoreColor(a);
    const bScore = scoreColor(b);
    return bScore - aScore;
  });

  const palette = dedupeByDistance(entries).slice(0, 8);

  // Primary = highest scored that has decent contrast (lum between 0.05 and 0.7)
  const primary =
    palette.find(
      (c) => c.source === "css-var-primary" || (c.luminance > 0.04 && c.luminance < 0.72)
    )?.hex ?? palette[0]?.hex ?? "#2E3538";

  return { primary, palette, cssVars: allCssVars };
}

function scoreColor(c: ColorEntry): number {
  let score = c.frequency;
  if (c.source === "css-var-primary") score += 200;
  if (c.source === "css-var") score += 50;
  if (c.source === "background") score += 10;
  // Penalty for extremes (near-white or near-black)
  const distFromGrey = Math.abs(c.luminance - 0.3);
  score -= distFromGrey * 5;
  return score;
}

/** Remove colors that are perceptually too close to an already-picked one */
function dedupeByDistance(sorted: ColorEntry[]): ColorEntry[] {
  const kept: ColorEntry[] = [];
  for (const entry of sorted) {
    const rgb1 = hexToRgb(entry.hex);
    if (!rgb1) continue;
    const tooClose = kept.some((k) => {
      const rgb2 = hexToRgb(k.hex);
      if (!rgb2) return false;
      // Simple Euclidean distance in RGB space
      const d = Math.sqrt(
        (rgb1[0] - rgb2[0]) ** 2 +
          (rgb1[1] - rgb2[1]) ** 2 +
          (rgb1[2] - rgb2[2]) ** 2
      );
      return d < 40; // threshold: colors within ~15% of each other
    });
    if (!tooClose) kept.push(entry);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// High-level: fetch URL and extract palette
// Designed for server-side use in the API route
// ---------------------------------------------------------------------------

export async function extractPaletteFromUrl(url: string): Promise<SitePalette> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "NavBot/1.0 (color extractor)",
      Accept: "text/html",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error("URL does not return HTML");
  }

  const html = await res.text();

  // Also try to fetch the first external stylesheet referenced
  const $ = cheerio.load(html);
  const stylesheetHrefs: string[] = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) stylesheetHrefs.push(href);
  });

  let combinedHtml = html;

  // Fetch up to 2 external stylesheets and inject as <style> tags
  for (const href of stylesheetHrefs.slice(0, 2)) {
    try {
      const cssUrl = new URL(href, url).toString();
      const cssRes = await fetch(cssUrl, {
        redirect: "follow",
        headers: { "User-Agent": "NavBot/1.0 (color extractor)" },
      });
      if (cssRes.ok) {
        const cssText = await cssRes.text();
        combinedHtml += `<style>${cssText}</style>`;
      }
    } catch {
      // ignore individual stylesheet failures
    }
  }

  return extractColorsFromHtml(combinedHtml);
}