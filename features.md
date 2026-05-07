# NavBot — Product Features

NavBot is a website-grounded AI assistant that answers visitor questions using retrieval-augmented generation (RAG) from indexed site content.

---

## Table of Contents

1. [Dashboard & Site Management](#1-dashboard--site-management)
2. [Website Crawling & Indexing](#2-website-crawling--indexing)
3. [Chat Widget (Text + Voice)](#3-chat-widget-text--voice)
4. [Agentic RAG Pipeline](#4-agentic-rag-pipeline)
5. [Social Media Search](#5-social-media-search)
6. [FAQ Generation & Management](#6-faq-generation--management)
7. [Theme Customization](#7-theme-customization)
8. [Analytics & Monitoring](#8-analytics--monitoring)
9. [Smart Sync](#9-smart-sync)
10. [AI Endpoint Evaluation](#10-ai-endpoint-evaluation)
11. [API Endpoints](#11-api-endpoints)

---

## 1. Dashboard & Site Management

Users can register, add websites, and manage all sites from a single dashboard.

**Features:**
- Email/password and OAuth (Google/GitHub) authentication via better-auth
- Add sites by URL — automatic crawling and indexing
- View all registered sites with page count and status
- Delete sites and associated vector data
- Configure social media handles per site

---

## 2. Website Crawling & Indexing

NavBot crawls websites and extracts structured text content for semantic search.

**Features:**
- BFS crawl starting from root URL (same-hostname, configurable depth/page limits)
- **SPA/Framework Detection** — automatically identifies React, Vue, Angular, Next.js, Nuxt, Svelte sites
- **Multi-strategy rendering:**
  - Static HTML fetch + Cheerio extraction (fast, for traditional sites)
  - Headless Chromium via Playwright (for SPAs detected by framework signatures)
  - Jina Reader API fallback (when Playwright is unavailable)
- **Structured content extraction:**
  - Headings with hierarchy tracking (h1 > h2 > h3 breadcrumbs)
  - Paragraphs, lists, blockquotes (10-char minimum)
  - Tables converted to Markdown
  - Image alt text and figcaptions
  - Contact information from nav/footer (emails, phone numbers, addresses)
  - Meta descriptions, OG tags, and JSON-LD structured data
- **PDF extraction** — downloads and extracts text from PDF URLs via pdfjs-dist, with Gemini Vision OCR fallback for scanned PDFs
- **Image OCR** — extracts text from images without alt text using Gemini Vision (configurable via `NAVBOT_IMAGE_OCR`)
- Content deduplication via MD5 fingerprinting
- Skips binary files, paginated URLs, and thin/404 pages

**Chunking strategy:**
- 1500-character chunks with 300-character overlap
- Semantic boundary splitting (paragraphs > lines > words)
- Each chunk enriched with heading breadcrumb context (e.g., `Section: Fee Structure > BTech CSE`)
- 24K character page content limit

---

## 3. Chat Widget (Text + Voice)

An embeddable widget that customers paste into their HTML via a script tag.

**Features:**
- Text input with conversation history
- Voice input (speech-to-text via Gemini multimodal)
- Text-to-speech playback of answers
- Source citations with clickable URLs
- Configurable theme (colors, fonts, opacity)
- Works on any website via `window.NAVBOT_CONFIG`

**Embed snippet:**
```html
<script>
  window.NAVBOT_CONFIG = {
    apiBase: "https://your-api.example.com",
    siteId: "your-site-id"
  };
</script>
<script src="https://your-host.com/chat-widget.iife.js"></script>
```

---

## 4. Agentic RAG Pipeline

The core AI pipeline that powers accurate, grounded answers.

**Architecture:**

```
User Question
    |
    +---> Rule-based Query Expansion (deadlines, fees, programs, events, etc.)
    |
    +---> LLM Planner (Gemini) --> generates 6-12 diverse search queries + HyDE paragraph
    |
    +---> Vector Search (Pinecone) --> top-K chunks per query, URL spreading
    |
    +---> Refiner Loop (if retrieval looks weak) --> alternative queries
    |
    +---> Multi-page Expansion (for exhaustive list questions)
    |
    +---> Social Media Search (in parallel, via Serper.dev)
    |
    +---> Gemini Chat Completion (with cross-page synthesis instructions)
    |
    +---> LLM Judge (validates answer against retrieved context)
```

**Key capabilities:**
- **Query expansion rules** — domain-specific patterns for admissions, fees, deadlines, events, contacts
- **Agentic planner** — LLM generates diverse search queries targeting different site sections
- **Refiner loop** — iteratively improves retrieval when initial results are weak (distance > 0.62 or low keyword overlap)
- **Multi-page expansion** — for "list all" questions, loads chunks from tracked URLs in the same path section (e.g., all `/events/...` pages)
- **LLM Judge** — fact-checks the draft answer against retrieved context, revises or rejects hallucinated content
- **FAQ override** — admin-approved answers short-circuit RAG when fresh
- **Cross-page synthesis** — system prompt instructs the LLM to combine information from multiple source pages

---

## 5. Social Media Search

Supplements website content with recent social media posts for event/news queries.

**Features:**
- Intent detection: triggers on keywords like event, workshop, placement, latest, upcoming, news
- Per-site social handle configuration (Instagram, Twitter/X, LinkedIn, Facebook)
- Google search via Serper.dev API scoped to each platform
- Handles stored as full URLs or usernames — auto-extracts slugs from URLs
- Results cached in-memory for 4 hours
- Social post URLs included inline in answers

**Configuration:** Set `SERPER_API_KEY` env var and configure handles via `PATCH /api/sites/:siteId/social`.

---

## 6. FAQ Generation & Management

Auto-generate FAQs from indexed content; admins can edit answers.

**Features:**
- Automatic FAQ generation from retrieved page snippets
- Admin can edit/approve FAQ answers in the dashboard
- Fresh admin answers override RAG for matching questions
- Bulk refresh to regenerate after re-indexing

---

## 7. Theme Customization

Widget appearance is fully configurable per site.

**Features:**
- Color picker with auto-extraction from site CSS (`/api/colors`)
- Font family and size configuration
- Opacity and border radius controls
- Live preview in the dashboard

---

## 8. Analytics & Monitoring

Track chatbot usage and performance from the dashboard.

**Features:**
- Total query count, 7-day volume trends
- Top queries by frequency
- Recent conversation turns with latency
- Per-site and aggregate views
- Source count per answer (retrieval quality signal)

---

## 9. Smart Sync

Keep indexed content fresh without full re-crawls.

**Features:**
- Sitemap-first indexing: uses sitemap.xml to discover all pages on first crawl
- Background sitemap-based sync triggered on widget ping
- Incremental sync: only crawl pages whose `<lastmod>` changed
- Detects never-indexed pages from sitemap and adds them to the crawl queue
- Preview mode: see what would change before applying
- Full re-crawl option when needed
- Content hash comparison for change detection

---

## 10. AI Endpoint Evaluation

Systematic evaluation of the RAG chat endpoint.

### 10.1 Dataset

100 curated ground-truth question/answer pairs across 7 categories:

| Category | Count | Description |
|----------|-------|-------------|
| Factual | 48 | Admissions, fees, contacts, faculty, facilities |
| List | 16 | Programs, workshops, research centers, scholarships |
| Cross-page | 14 | Answers spanning multiple site sections |
| Procedural | 5 | How to apply, admission process |
| Computation | 5 | Fee calculations, counting |
| Conversational | 4 | Greetings, thanks |
| Out-of-scope | 4 | Questions not about the site |

Located at: `apps/api/eval/dataset.json`

### 10.2 Baselines

Two implementations compared side-by-side:

| Baseline | Description |
|----------|-------------|
| **Single-prompt** | Direct vector search (1 query) -> top-6 chunks -> single Gemini call |
| **Agentic RAG** | Rule expansion + LLM planner + multi-query search + refiner loop + LLM judge |

Both run with configurable rate limiting (`EVAL_RPM` env var, default 5) and resume-from-crash support.

Run: `pnpm --filter api eval:baselines`

### 10.3 LLM-as-Judge Evaluation

Each response is scored on three criteria (0-5 scale):

| Criterion | What it measures |
|-----------|-----------------|
| **Correctness** | Factual accuracy vs. ground truth |
| **Groundedness** | No hallucination — claims supported by retrievable content |
| **Relevance** | Directly addresses the user's question |

Run: `pnpm --filter api eval:judge`

### 10.4 Results (63 questions evaluated)

| Metric | Single-Prompt | Agentic | Improvement |
|--------|--------------|---------|-------------|
| Correctness | 3.17/5 | 3.52/5 | +11.0% |
| Groundedness | 4.76/5 | 4.81/5 | +1.0% |
| Relevance | 4.00/5 | 4.27/5 | +6.7% |
| **Overall** | **3.98/5** | **4.20/5** | **+5.6%** |

Head-to-head: Agentic wins 20/63, ties 40/63, single-prompt wins 3/63.
Latency: Single-prompt ~20s avg vs Agentic ~54s avg.

Key findings:
- Cross-page questions see biggest agentic improvement (2.50 -> 3.12 correctness)
- Conversational handling dramatically better in agentic (2.0 -> 4.0)
- Both pipelines strong on groundedness — very little hallucination

---

## 11. API Endpoints

### Site Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sites?userId=...` | List user's sites |
| POST | `/api/sites` | Crawl & index a new site |
| DELETE | `/api/sites/:siteId` | Delete site and vectors |
| POST | `/api/sites/:siteId/reindex` | Re-crawl and re-index |
| GET | `/api/sites/dashboard-stats` | Analytics and metrics |
| GET | `/api/sites/:siteId/widget-config` | Public widget config |
| GET | `/api/sites/:siteId/theme` | Get widget theme |
| PUT | `/api/sites/:siteId/theme` | Save widget theme |
| GET | `/api/sites/:siteId/social` | Get social handles |
| PATCH | `/api/sites/:siteId/social` | Update social handles |
| GET | `/api/sites/:siteId/sync` | Sync status |
| POST | `/api/sites/:siteId/sync` | Trigger sync |
| GET | `/api/sites/:siteId/ping` | Ping (triggers background sync) |
| GET | `/api/colors?url=...` | Extract colors from URL |

### AI Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Text chat (RAG) |
| POST | `/api/chat/voice` | Voice chat (STT + RAG) |
| POST | `/api/chat/tts` | Text-to-speech |
| GET | `/api/sites/:siteId/faqs` | Get/generate FAQs |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + Tailwind CSS |
| Auth | better-auth (email, Google, GitHub OAuth) |
| API | Express + TypeScript |
| Vector DB | Pinecone (llama-text-embed-v2, 1024 dims) |
| LLM | Google Gemini (Gemma 4 for chat/planning, Gemini 2.5 Flash for STT/TTS/OCR) |
| Database | PostgreSQL |
| Crawling | Cheerio + Playwright + pdfjs-dist + Gemini Vision OCR |
| Social Search | Serper.dev (Google search API) |
| Widget | React IIFE bundle |
| Monorepo | pnpm + Turborepo |
| Deploy | Render (Blueprint) |

---

## Running the Evaluation

```bash
# 1. Set environment variables
export GOOGLE_API_KEY="your-key"
export PINECONE_API_KEY="your-key"
export PINECONE_INDEX="your-index"
# DATABASE_URL not required — eval scripts run without DB

# 2. Run both baselines on the dataset (rate-limited, resumable)
pnpm --filter api eval:baselines

# 3. Score with LLM-as-judge
pnpm --filter api eval:judge
```

Output includes a comparison table and aggregate scores showing how agentic RAG improves over the single-prompt baseline.
