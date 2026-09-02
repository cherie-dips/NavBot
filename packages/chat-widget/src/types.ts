/**
 * Shapes shared across the widget's modules.
 *
 * The theme types are aliases onto @repo/widget-theme so the widget, the dashboard
 * picker and the API cannot drift apart on what a theme is.
 */
import type {
  WidgetTheme as SharedWidgetTheme,
  WidgetThemeInput,
} from "@repo/widget-theme";

export interface SocialLink {
  platform: string;
  title: string;
  url: string;
}

export interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  timestamp: string;
  isVoice?: boolean;
  voiceReply?: boolean;
  pageLinks?: Array<{ url: string; title: string }>;
  socialLinks?: SocialLink[];
  /** Suggested next questions, shown as chips under the answer. */
  followUps?: string[];
}

/**
 * The wire format (all optional, plus the legacy `font` alias) and the resolved shape
 * both live in @repo/widget-theme, shared with the dashboard picker and the API.
 */
export type WidgetTheme = WidgetThemeInput;
export type ResolvedWidgetTheme = SharedWidgetTheme;

export type NavbotConfig = {
  apiBase?: string;
  siteId?: string;
  theme?: WidgetTheme;
};

declare global {
  interface Window {
    NAVBOT_CONFIG?: NavbotConfig;
  }
}


export type { SharedWidgetTheme, WidgetThemeInput };
