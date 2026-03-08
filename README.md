# NavBot

### What is NavBot?

NavBot is an **AI-powered chatbot-as-a-service** that lets any website owner add an intelligent Q&A chatbot to their site in under 5 minutes. The chatbot answers visitor questions using **only the content from that specific website** — no hallucinations, no generic answers.

### The Problem

- Website visitors can't find information quickly (buried in nested pages, PDFs, FAQs).

### The Solution

NavBot crawls your website, indexes all content into a vector database, and serves a RAG-powered chatbot that answers **strictly from your site's content** — with source citations.

### Features

1. Answer Queries Instantly & Accurately
2. Summary of Content on the page
3. Redirect Users
4. Just the Website Data and No Google/Web Data
5. Connects Social Media Handles
6. Voice Enabled Chatbot
7. Data Analytics → FAQs → Model Training
8. Data Collection → To follow up with the new users separately

### How Organizations Onboard

1. **Sign up** on the NavBot web app (email/password or Google/GitHub OAuth).
2. **Paste your website URL** in the dashboard.
3. NavBot **automatically crawls** all linked pages, extracts text (including tables), and stores chunked embeddings in ChromaDB.
4. **Copy one script tag** and paste it into your website's HTML.
5. A floating chatbot widget appears on your site — visitors can ask questions via text or voice.

### Key Differentiators

- **Website-only answers**: RAG ensures the bot never makes up information.
- **One-line integration**: A single `<script>` tag — no backend changes needed by the customer.
- **Multi-site support**: One account can manage chatbots for multiple websites.
- **Voice support**: Visitors can speak their questions (via browser microphone).
- **Indian language support**: Powered by Sarvam AI, with native Indian language capabilities.

---

## 2. User Journeys

### User Type 1: Website Owner (Primary User)

**Who**: A business owner, developer, or marketing team member who wants to add a chatbot to their website.

**Why they log in**: To set up, manage, and monitor their chatbot(s).

**How they were doing this earlier**: Manually answering visitor queries via email, contact forms, or hiring support staff. No insights on FAQs.

**User Journey**:

```
Landing Page → "Get Started" button
    → Sign Up / Sign In (email or Google OAuth)
    → Dashboard (Overview tab)
    → Click "Add Website" → paste URL (e.g. https://www.leapai.club)
    → Scraping animation (fetching pages → analyzing → building index → ready)
    → Site appears in Websites list (e.g. "17 pages indexed")
    → Click on site card → Integration page
    → Copy the HTML <script> snippet
    → Paste into their website's HTML
    → Chatbot is live on their site
```

**Post-setup flow**:

```
Dashboard → Overview: see total queries, accuracy rate, active visitors
         → Websites: manage multiple sites, view pages indexed
         → Analytics: query volume charts, top queries, auto-generated FAQs
         → Settings: toggle voice, toggle "website data only" mode
```

### User Type 2: Website Visitor (End User)

**Who**: A person visiting a website that has NavBot installed (e.g., a prospective student visiting a university site).

**Why they interact**: To quickly find specific information without navigating through multiple pages.

**How they were doing this earlier**: Manually browsing through pages, reading long FAQ pages, or emailing the organization.

**User Journey**:

```
Visit website (e.g. plaksha.edu.in) → see floating chat icon (bottom-right)
    → Click icon → chat panel opens
    → Type question: "What is the admission deadline?"
    → NavBot retrieves relevant chunks from indexed pages
    → Sarvam AI generates answer with source citation
    → User sees: "Round 1 deadline is Jan 15, 2026 (Source: Admissions page)"
    → Can ask follow-up questions (conversation history maintained)
    → Can use voice input (microphone button) for hands-free queries
```

### User Type 3: Admin (Future Scope)

**Who**: NavBot platform admin managing all tenants.

**Why**: Monitor usage, manage accounts, view aggregated analytics.

---

## 3. Databases in Use

### Database 1: SQLite (Authentication)

**Location**: `apps/server/sqlite.db`
**Purpose**: Stores all user authentication data
**Managed by**: `better-auth` library

| Table | Columns | Purpose |
|-------|---------|---------|
| `user` | `id`, `name`, `email`, `emailVerified`, `image`, `createdAt`, `updatedAt` | Registered users |
| `session` | `id`, `expiresAt`, `token`, `ipAddress`, `userAgent`, `userId`, `createdAt`, `updatedAt` | Active login sessions |
| `account` | `id`, `accountId`, `providerId`, `userId`, `accessToken`, `refreshToken`, `password` | OAuth + email/password credentials |
| `verification` | `id`, `identifier`, `value`, `expiresAt` | Email verification tokens |

**Why SQLite**: Lightweight, zero-config, perfect for auth in a dev/small-scale deployment. No separate DB server needed.

### Database 2: ChromaDB (Vector Store)

**Location**: Chroma Cloud
**Purpose**: Stores website content as vector embeddings for semantic search (RAG retrieval)

| Concept | Details |
|---------|---------|
| **Collection** | One per site: `site_{siteId}` (e.g., `site_www.leapai.club`) |
| **Document** | A text chunk (~900 chars) from a crawled page |
| **Metadata** | `siteId`, `url`, `title`, `chunkIndex`, `totalChunks` |
| **Embedding** | Generated by ChromaDB default embedder |
| **ID** | `{pageUrl}#chunk_{index}` for uniqueness |

**How data flows in**:

```
Website URL → Crawler (Cheerio) → Raw HTML → Structured text extraction
    → Chunking (900 chars, 150 overlap) → ChromaDB upsert with embeddings
```

**How data flows out (retrieval)**:

```
User question → Query expansion → Semantic search (top-8 chunks)
    → Deduplication → Context string → Sarvam AI LLM → Answer
```

---

## 4. API Endpoints

**Base URL**: `http://localhost:3001`

### Site Indexing

| Method | Endpoint | Request Body | Response | Purpose |
|--------|----------|-------------|----------|---------|
| `POST` | `/api/sites` | `{ url: string, siteId?: string }` | `{ siteId, pageCount, stored, failed }` | Crawl a website, chunk content, store in ChromaDB |
| `POST` | `/api/sites/:siteId/reindex` | `{ url: string }` | `{ siteId, pageCount, stored, failed, reindexed: true }` | Re-crawl and re-index an existing site |

### Chat (RAG)

| Method | Endpoint | Request Body | Response | Purpose |
|--------|----------|-------------|----------|---------|
| `POST` | `/api/chat` | `{ siteId, message, history? }` | `{ answer, sources: [{url, title, distance}] }` | Text-based RAG Q&A |
| `POST` | `/api/chat/voice` | FormData: `audio` (file), `siteId` | `{ transcript, answer, sources }` | Voice-based Q&A (STT + RAG) |

### Auth (via Auth Server on port 3000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/auth/sign-up/email` | Register with email + password |
| `POST` | `/api/auth/sign-in/email` | Login with email + password |
| `POST` | `/api/auth/sign-in/social` | OAuth (Google/GitHub) initiation |
| `GET` | `/api/auth/callback/:provider` | OAuth callback handler |
| `GET` | `/api/auth/get-session` | Check current session |
| `POST` | `/api/auth/sign-out` | Logout |

### Request/Response Flow Example

```json
// POST /api/chat
// Request:
{
  "siteId": "www.leapai.club",
  "message": "What programs do you offer?",
  "history": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello! How can I help?" }
  ]
}

// Response:
{
  "answer": "LeapAI offers an AI Fellowship program focused on...",
  "sources": [
    { "url": "https://www.leapai.club/programs", "title": "Programs" },
    { "url": "https://www.leapai.club/about", "title": "About" }
  ]
}
```

---

## 5. Code Understanding

### Architecture Overview

```
┌─────────────┐    ┌─────────────┐    ┌──────────────┐
│  Web App     │   │  Auth Server │   │  API Server   │
│  (React)     │   │  (Express)   │   │  (Express)    │
│  :5173       │   │  :3000       │   │  :3001        │
└──────┬───────┘   └──────┬───────┘   └──────┬────────┘
       │                  │                   │
       │  Auth requests   │                   │
       │─────────────────→│                   │
       │                   SQLite             │
       │                  (users/sessions)    │
       │                                      │
       │  Site/Chat requests                  │
       │─────────────────────────────────────→│
       │                                      │
       │                              ┌───────┴────────┐
       │                              │                │
       │                         ChromaDB        Sarvam AI
       │                         (vectors)       (LLM)
       │
┌──────┴───────┐
│ Chat Widget  │  (embedded on customer sites via <script> tag)
│ (React IIFE) │  → talks to API at :3001
└──────────────┘
```

### Monorepo Structure

```
NavBot/
├── apps/
│   ├── web/          → React dashboard + marketing site (Vite, Tailwind, better-auth client)
│   ├── api/          → Express API (crawling, RAG, ChromaDB, Sarvam AI)
│   └── server/       → Auth server (Express, better-auth, SQLite)
├── packages/
│   ├── chat-widget/  → Embeddable React widget (builds to IIFE)
│   ├── typescript-config/
│   └── eslint-config/
├── turbo.json
└── pnpm-workspace.yaml
```

### Key Files & What They Do

| File | What it does | Key functions/concepts |
|------|-------------|----------------------|
| `apps/api/src/services/crawler.ts` | Crawls websites using `node-fetch` + `cheerio`. Extracts text, converts tables to Markdown, normalizes URLs, deduplicates by content fingerprint. | `crawlSite()`, `extractStructuredContent()`, `tableToMarkdown()`, `normalizeUrl()`, `contentFingerprint()` |
| `apps/api/src/services/vectorstore.ts` | Manages ChromaDB. Chunks text (900 chars, 150 overlap), upserts with metadata, queries with semantic search. Handles both local and cloud ChromaDB. | `upsertSitePages()`, `querySiteDocs()`, `chunkText()`, `getOrCreateCollection()` |
| `apps/api/src/services/rag.ts` | The RAG pipeline. Expands queries by domain (deadlines, fees, etc.), retrieves chunks, builds context, calls Sarvam AI, deduplicates sources. | `answerQuestionWithRag()`, `buildRetrievalQueries()`, `buildContextString()`, `withRetry()` |
| `apps/api/src/routes/sites.ts` | Express routes for site indexing. Calls crawler then vectorstore. | `POST /api/sites`, `POST /api/sites/:siteId/reindex` |
| `apps/api/src/routes/chat.ts` | Express routes for chat. Calls RAG pipeline. | `POST /api/chat`, `POST /api/chat/voice` |
| `apps/web/src/main.tsx` | App root. Manages `currentView` (routing), `isAuthed` state, OAuth callback detection, sign-out handler. | `handleGetStartedNav()`, `handleSignOut()`, `onAuthSuccess()` |
| `apps/web/src/pages/DashboardPage.tsx` | 855-line dashboard. 6 tabs, real site indexing via API, integration panel per site. | `handleAddWebsite()`, `buildIntegration()`, `OverviewTab`, `WebsitesTab` |
| `apps/server/src/auth.ts` | Configures `better-auth` with SQLite, conditionally enables Google/GitHub OAuth based on env vars. | `authOptions`, conditional `socialProviders` |
| `packages/chat-widget/src/ChatWidget.tsx` | The embeddable widget. Reads `window.NAVBOT_CONFIG`, renders floating chat UI, sends messages to API, supports voice recording via `MediaRecorder`. | `sendMessage()`, voice recording, `createPortal()` |

### How RAG Works (Step by Step)

1. **User types a question** in the chat widget.
2. Widget sends `POST /api/chat` with `{ siteId, message, history }`.
3. **Query expansion**: if the question mentions "deadline", "fee", etc., additional targeted queries are generated (e.g., `"admission rounds application deadline dates schedule {original question}"`).
4. **Vector search**: expanded queries are sent to ChromaDB's `site_{siteId}` collection. Top-8 chunks retrieved per query, deduplicated by URL.
5. **Context building**: retrieved chunks are formatted as `[Source N] Title: ... URL: ... {content}` (max 1200 chars per source).
6. **LLM call**: A single system message (instructions + context) + conversation history + user message → sent to Sarvam AI (`sarvam-m` model, temperature 0.2, max 600 tokens).
7. **Response**: LLM answer + deduplicated source URLs returned to the widget.

### How Crawling Works

1. Start from the given URL, fetch HTML via `node-fetch`.
2. Parse with `cheerio`, extract text using `extractStructuredContent()` which preserves headings and converts HTML tables to Markdown format.
3. Follow internal links (same hostname), normalize URLs (remove hash fragments, trailing slashes, sort query params).
4. Skip duplicate content via `contentFingerprint()` (hashes first 500 chars of each page).
5. Respect `maxPages` (500) and `maxDepth` (10) limits.
6. Return array of `{ url, title, content }` for each unique page.

### How Chunking Works

```
Page content (e.g. 3000 chars)
    → Split into chunks of ~900 chars with 150-char overlap
    → Chunk 0: chars 0–900
    → Chunk 1: chars 750–1650    (150 overlap with chunk 0)
    → Chunk 2: chars 1500–2400   (150 overlap with chunk 1)
    → Chunk 3: chars 2250–3000   (150 overlap with chunk 2)

Each chunk gets:
    → ID:       "{url}#chunk_0", "{url}#chunk_1", etc.
    → Metadata: { siteId, url, title }
    → Upserted to ChromaDB (embedding auto-generated)
```

**Why overlap?** So that information spanning a chunk boundary isn't lost. A sentence split across two chunks will appear fully in at least one of them.

### How the Chat Widget Integrates

The website owner adds this to their HTML:

```html
<script>
  window.NAVBOT_CONFIG = { apiBase: "http://localhost:3001", siteId: "www.leapai.club" };
</script>
<script src="http://localhost:5173/chat-widget.iife.js" crossorigin="anonymous"></script>
```

What happens:

1. The IIFE script creates a `#chat-widget-root` div and mounts a React app into it via `createPortal`.
2. It reads `window.NAVBOT_CONFIG` for `apiBase` and `siteId`.
3. A floating chat button appears at the bottom-right (`z-index: 9999`).
4. On click, a 360×500px glassmorphic chat panel opens.
5. User messages are sent to `POST {apiBase}/api/chat` with the configured `siteId`.
6. Voice messages use `MediaRecorder` → `POST {apiBase}/api/chat/voice` with FormData.

### Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18, Vite 5, Tailwind CSS 4 | Dashboard & marketing site |
| **Auth** | better-auth, SQLite, Google/GitHub OAuth | User management & sessions |
| **API** | Express.js, TypeScript | Backend HTTP server |
| **Crawling** | node-fetch, Cheerio, domhandler | Website scraping & content extraction |
| **Vector DB** | ChromaDB (local or cloud) | Semantic search & embeddings |
| **LLM** | Sarvam AI (`sarvam-m` model) | Answer generation from context |
| **Chat Widget** | React 18, Vite IIFE build | Embeddable chatbot on customer sites |
| **Monorepo** | Turborepo, pnpm workspaces | Multi-app project management |

### Environment Variables

**apps/api/.env:**

| Variable | Purpose |
|----------|---------|
| `SARVAM_API_KEY` | Sarvam AI API key for LLM |
| `SARVAM_CHAT_MODEL` | Model name (default: `sarvam-m`) |
| `CHROMA_URL` | Local ChromaDB URL |
| `CHROMA_HOST`, `CHROMA_API_KEY`, `CHROMA_TENANT`, `CHROMA_DATABASE` | Chroma Cloud config |

**apps/server/.env:**

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `CORS_ORIGIN` | Allowed frontend origin |

**apps/web (via Vite):**

| Variable | Purpose |
|----------|---------|
| `VITE_AUTH_URL` | Auth server URL (default: `http://localhost:3000`) |
| `VITE_API_URL` | API server URL (default: `http://localhost:3001`) |
| `VITE_WIDGET_SCRIPT_URL` | Chat widget script URL |

### Our Website

![Website Screenshot 1](images/Screenshot%202026-03-07%20at%209.13.32%E2%80%AFPM.png)

![Website Screenshot 2](images/Screenshot%202026-03-07%20at%209.13.49%E2%80%AFPM.png)

![Website Screenshot 3](images/Screenshot%202026-03-07%20at%209.14.05%E2%80%AFPM.png)

![Website Screenshot 4](images/Screenshot%202026-03-07%20at%209.14.21%E2%80%AFPM.png)

![Website Screenshot 5](images/Screenshot%202026-03-07%20at%209.14.31%E2%80%AFPM.png)

![Website Screenshot 6](images/Screenshot%202026-03-07%20at%209.14.41%E2%80%AFPM.png)

![Website Screenshot 7](images/Screenshot%202026-03-07%20at%209.15.20%E2%80%AFPM.png)

![Website Screenshot 8](images/Screenshot%202026-03-07%20at%209.08.14%E2%80%AFPM.png)

![Website Screenshot 9](images/Screenshot%202026-03-07%20at%209.08.38%E2%80%AFPM.png)

![Website Screenshot 10](images/Screenshot%202026-03-07%20at%209.09.26%E2%80%AFPM.png)

![Website Screenshot 11](images/Screenshot%202026-03-07%20at%209.11.36%E2%80%AFPM.png)

![Website Screenshot 12](images/Screenshot%202026-03-07%20at%209.11.57%E2%80%AFPM.png)

![Website Screenshot 13](images/Screenshot%202026-03-07%20at%209.12.24%E2%80%AFPM.png)

![Website Screenshot 14](images/Screenshot%202026-03-07%20at%209.12.57%E2%80%AFPM.png)

![Website Screenshot 15](images/Screenshot%202026-03-07%20at%209.13.08%E2%80%AFPM.png)

### NavBot Demo

![NavBot Demo 1](images/Screenshot%202026-03-07%20at%209.24.18%E2%80%AFPM.png)

![NavBot Demo 2](images/Screenshot%202026-03-07%20at%209.30.20%E2%80%AFPM.png)
