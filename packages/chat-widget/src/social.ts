/**
 * Recognising and embedding social posts cited in an answer.
 */
export const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E4405F",
  twitter: "#1DA1F2",
  linkedin: "#0A66C2",
  facebook: "#1877F2",
};

export function detectSocialPlatform(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "instagram.com") return "instagram";
    if (host === "twitter.com" || host === "x.com") return "twitter";
    if (host === "facebook.com") return "facebook";
    if (host === "linkedin.com") return "linkedin";
  } catch {
    /* not a URL we can classify */
  }
  return null;
}

export function getSocialEmbedUrl(url: string, platform: string): string | null {
  try {
    const parsed = new URL(url);
    switch (platform) {
      case "instagram": {
        const match = parsed.pathname.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (match) return `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
        return null;
      }
      case "twitter": {
        const match = parsed.pathname.match(/\/\w+\/status\/(\d+)/);
        if (match) return `https://twitframe.com/show?url=${encodeURIComponent(url)}`;
        return null;
      }
      case "facebook": {
        if (parsed.pathname.indexOf("/posts/") !== -1 || parsed.pathname.indexOf("/videos/") !== -1 || parsed.pathname.indexOf("/photos/") !== -1) {
          return `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&width=350&show_text=true`;
        }
        return null;
      }
      case "linkedin":
        return null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

