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
  /**
   * Which route produced this, for monitoring. "reasoned" is the two-pass analytical
   * path; "answered" is the single-pass one.
   */
  path?:
    | "cache"
    | "faq"
    | "greeting"
    | "out_of_scope"
    | "answered"
    | "reasoned"
    | "retry"
    | "contact_fallback";
}
