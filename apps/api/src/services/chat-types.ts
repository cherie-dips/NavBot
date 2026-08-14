export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface PageLink {
  url: string;
  title: string;
}

export interface SocialLink {
  platform: string;
  title: string;
  url: string;
}

export interface ChatAnswer {
  answer: string;
  sources: Array<{ url: string; title: string }>;
  pageLinks: PageLink[];
  socialLinks: SocialLink[];
  /** Suggested next questions, rendered as chips under the answer. */
  followUps: string[];
  /** Which rung of the fallback ladder produced this, for monitoring. */
  path?: "cache" | "faq" | "greeting" | "out_of_scope" | "answered" | "retry" | "contact_fallback";
}
