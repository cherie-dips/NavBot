// Demo data for dashboard — showcases NavBot's capabilities to potential customers

export const mockWebsites = [
  {
    id: "ws_1",
    url: "https://example.com",
    hostname: "example.com",
    status: "active" as const,
    pagesIndexed: 0,
    lastCrawled: "Never",
    addedAt: "",
  },
];

export const mockStats = {
  totalConversations: 2_847,
  conversationsThisWeek: 436,
  avgResponseTime: "0.8s",
  pagesIndexed: 124,
  contentSummaries: 312,
  redirectsTriggered: 189,
  activeWebsites: 3,
};

export const mockQueryHistory = [
  { day: "Mon", queries: 58 },
  { day: "Tue", queries: 72 },
  { day: "Wed", queries: 85 },
  { day: "Thu", queries: 63 },
  { day: "Fri", queries: 91 },
  { day: "Sat", queries: 42 },
  { day: "Sun", queries: 25 },
];

export const mockTopQueries: { question: string; count: number; answered: boolean }[] = [
  { question: "What programs do you offer?", count: 214, answered: true },
  { question: "What are the admission deadlines?", count: 187, answered: true },
  { question: "How do I apply?", count: 156, answered: true },
  { question: "What is the fee structure?", count: 132, answered: true },
  { question: "Do you offer scholarships?", count: 98, answered: true },
  { question: "What are the eligibility criteria?", count: 76, answered: false },
];

export const mockFaqs: { question: string; answer: string; generatedFrom: number }[] = [
  { question: "What programs do you offer?", answer: "We offer undergraduate, postgraduate, and certificate programs across multiple disciplines including technology, business, and liberal arts.", generatedFrom: 214 },
  { question: "What are the admission deadlines?", answer: "Applications are accepted in multiple rounds. Round 1 closes in October, Round 2 in January, and Round 3 in March. Early applications are encouraged.", generatedFrom: 187 },
  { question: "How do I apply?", answer: "You can apply online through our admissions portal. The process includes submitting your application form, academic transcripts, test scores, and a personal statement.", generatedFrom: 156 },
  { question: "Do you offer scholarships?", answer: "Yes, we offer merit-based and need-based scholarships. Financial aid packages are available for eligible students. Contact our admissions office for details.", generatedFrom: 98 },
];

export const mockSocialMedia = [
  { platform: "Instagram", handle: "@yourhandle", followers: "15.2K", connected: true, color: "#E1306C" },
  { platform: "Twitter / X", handle: "@yourhandle", followers: "9.8K", connected: true, color: "#1DA1F2" },
  { platform: "LinkedIn", handle: "Your Page", followers: "6.4K", connected: true, color: "#0077B5" },
  { platform: "YouTube", handle: "Your Channel", subscribers: "3.1K", connected: false, color: "#FF0000" },
  { platform: "TikTok", handle: "@yourhandle", followers: "1.2K", connected: false, color: "#000000" },
];

export const mockVisitorInteractions = [
  { id: 1, visitor: "Visitor #2847", query: "What are the admission requirements for the CS program?", response: "The CS program requires...", timestamp: "Just now", source: "chatbot" as const },
  { id: 2, visitor: "Visitor #2846", query: "Can I get a campus tour?", response: "Yes! Campus tours are available...", timestamp: "3 min ago", source: "chatbot" as const },
  { id: 3, visitor: "Visitor #2845", query: "What is the application fee?", response: "The application fee is...", timestamp: "12 min ago", source: "voice" as const },
  { id: 4, visitor: "Visitor #2844", query: "Do you have hostel facilities?", response: "Yes, we offer on-campus housing...", timestamp: "28 min ago", source: "chatbot" as const },
  { id: 5, visitor: "Visitor #2843", query: "When does the next semester start?", response: "The upcoming semester begins in...", timestamp: "1 hour ago", source: "chatbot" as const },
  { id: 6, visitor: "Visitor #2842", query: "What placement stats do you have?", response: "Our recent placement statistics show...", timestamp: "2 hours ago", source: "voice" as const },
];

export const mockRecentConversations = [
  { id: 1, visitor: "Visitor #2847", query: "What are the admission requirements for the CS program?", response: "The CS program requires a strong foundation in mathematics and programming...", timestamp: "Just now", redirected: false },
  { id: 2, visitor: "Visitor #2846", query: "Can I get a campus tour?", response: "Yes! Campus tours are available every Saturday. You can book a slot through our website...", timestamp: "3 min ago", redirected: true },
  { id: 3, visitor: "Visitor #2845", query: "What is the application fee?", response: "The application fee varies by program. For undergraduate programs it is...", timestamp: "12 min ago", redirected: false },
  { id: 4, visitor: "Visitor #2844", query: "Do you have hostel facilities?", response: "Yes, we offer on-campus housing with modern amenities including Wi-Fi, laundry, and dining...", timestamp: "28 min ago", redirected: true },
];
