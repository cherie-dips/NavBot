// Mock data for dashboard — will be replaced with real ChromaDB/API data later

export const mockWebsites = [
  {
    id: "ws_1",
    url: "https://acmecorp.com",
    hostname: "acmecorp.com",
    status: "active" as const,
    pagesIndexed: 47,
    lastCrawled: "2 hours ago",
    addedAt: "2025-12-01",
  },
];

export const mockStats = {
  totalQueries: 1_284,
  queriesThisWeek: 312,
  avgResponseTime: "1.2s",
  accuracyRate: 94.7,
  contentSummaries: 186,
  redirectsTriggered: 73,
  activeVisitors: 12,
  totalLeads: 48,
};

export const mockQueryHistory = [
  { day: "Mon", queries: 38 },
  { day: "Tue", queries: 52 },
  { day: "Wed", queries: 61 },
  { day: "Thu", queries: 45 },
  { day: "Fri", queries: 58 },
  { day: "Sat", queries: 29 },
  { day: "Sun", queries: 29 },
];

export const mockTopQueries = [
  { question: "What are your pricing plans?", count: 89, accuracy: 97 },
  { question: "How do I get started?", count: 76, accuracy: 95 },
  { question: "Do you offer a free trial?", count: 64, accuracy: 92 },
  { question: "What integrations do you support?", count: 51, accuracy: 96 },
  { question: "How does billing work?", count: 43, accuracy: 91 },
  { question: "Can I cancel anytime?", count: 38, accuracy: 98 },
];

export const mockFaqs = [
  { question: "What are your pricing plans?", answer: "We offer three tiers: Starter ($29/mo), Pro ($79/mo), and Enterprise (custom). All plans include unlimited chatbot conversations.", generatedFrom: 89 },
  { question: "How do I get started?", answer: "Simply add our script tag to your website's HTML. We'll automatically crawl and index your content within minutes.", generatedFrom: 76 },
  { question: "Do you offer a free trial?", answer: "Yes! Every new account gets a 14-day free trial with full Pro features. No credit card required.", generatedFrom: 64 },
  { question: "What integrations do you support?", answer: "We integrate with Slack, Discord, Zendesk, Intercom, and any platform via our REST API and webhooks.", generatedFrom: 51 },
];

export const mockSocialMedia = [
  { platform: "Instagram", handle: "@acmecorp", followers: "12.4K", connected: true, color: "#E1306C" },
  { platform: "Twitter / X", handle: "@acmecorp", followers: "8.2K", connected: true, color: "#1DA1F2" },
  { platform: "LinkedIn", handle: "Acme Corp", followers: "5.1K", connected: true, color: "#0077B5" },
  { platform: "YouTube", handle: "AcmeCorp", subscribers: "2.3K", connected: false, color: "#FF0000" },
  { platform: "TikTok", handle: "@acmecorp", followers: "950", connected: false, color: "#000000" },
];

export const mockLeads = [
  { id: 1, name: "Sarah Chen", email: "sarah@startup.io", query: "Pricing for enterprise", timestamp: "2 min ago", status: "new" as const },
  { id: 2, name: "James Wilson", email: "james@bigco.com", query: "API integration docs", timestamp: "15 min ago", status: "new" as const },
  { id: 3, name: "Maria Garcia", email: "maria@agency.co", query: "White-label options", timestamp: "1 hour ago", status: "contacted" as const },
  { id: 4, name: "Alex Turner", email: "alex@devshop.io", query: "Bulk pricing", timestamp: "3 hours ago", status: "contacted" as const },
  { id: 5, name: "Priya Patel", email: "priya@ecom.store", query: "Custom training data", timestamp: "5 hours ago", status: "converted" as const },
  { id: 6, name: "Tom Nguyen", email: "tom@saas.app", query: "Voice chatbot demo", timestamp: "1 day ago", status: "converted" as const },
];

export const mockRecentConversations = [
  { id: 1, visitor: "Visitor #1284", query: "What's the refund policy?", response: "We offer a 30-day money-back guarantee on all plans...", timestamp: "Just now", redirected: false },
  { id: 2, visitor: "Visitor #1283", query: "How to install on Shopify?", response: "To add NavBot to your Shopify store, go to Online Store > Themes...", timestamp: "3 min ago", redirected: true },
  { id: 3, visitor: "Visitor #1282", query: "Do you have a React component?", response: "Yes! We offer a React SDK. Install via npm install @navbot/react...", timestamp: "8 min ago", redirected: false },
  { id: 4, visitor: "Visitor #1281", query: "Support hours?", response: "Our support team is available Monday-Friday, 9am-6pm EST...", timestamp: "12 min ago", redirected: true },
];
