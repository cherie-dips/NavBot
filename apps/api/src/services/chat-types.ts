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
