# NavBot — Product Features

NavBot is a website-grounded AI assistant that answers visitor questions using retrieval-augmented generation (RAG) from indexed site content. It combines an LLM query planner, multi-query vector search, cross-encoder reranking, live site and social search, and a two-pass analyst/editor writer into a single embeddable chat widget with text and voice support.

All language, speech and vision calls run on **Google Gemini** via `@google/genai`; embeddings and reranking run on **Pinecone Inference**.

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
12. [Tech Stack](#12-tech-stack)
13. [Environment Variables](#13-environment-variables)

---

## 1. Dashboard & Site Management

Users can register, add websites, and manage all sites from a single dashboard.

### Authentication
- Email/password registration and login via **better-auth**
- OAuth login with **Google** and **GitHub**
- Session-based authentication with secure cookies
- Auth service runs as a separate deployment (`navbot-auth`) with its own `BETTER_AUTH_SECRET`

### Site Management
- **Add sites by URL** — triggers automatic BFS crawl and Pinecone indexing
- **View all registered sites** with page count, crawl status, and last-synced timestamp
- **Delete sites** — removes the site record, all associated pages from the database, and all vectors from Pinecone
- **Configure social media handles** per site (Instagram, Twitter/X, LinkedIn, Facebook) for supplementary search

### Widget Embed Code
The dashboard provides a copy-paste embed snippet for each site:
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

## 2. Website Crawling & Indexing

NavBot crawls websites and extracts structured text content for semantic search. The crawler supports traditional server-rendered sites, single-page applications, PDFs, and images.

### Crawl Strategy
- **BFS crawl** starting from the root URL, following same-hostname links
- Configurable depth limit and maximum page count
- Skips binary files, paginated URLs, and thin/404 pages
- Content deduplication via **MD5 fingerprinting** — unchanged pages are not re-upserted

### SPA / Framework Detection
NavBot automatically identifies single-page application frameworks and switches rendering strategy:
- Detects **React, Vue, Angular, Next.js, Nuxt, Svelte** via framework-specific DOM signatures
- SPA detection overrides `BROWSER_CRAWL=off` — detected SPAs always use browser rendering

### Multi-Strategy Rendering
Three rendering backends, selected automatically:
1. **Static HTML fetch + Cheerio** — fast extraction for traditional server-rendered sites
2. **Headless Chromium via Playwright** — full browser rendering for SPAs; runs inside Docker on production (pinned to Playwright v1.59.1)
3. **Static fetch fallback** — when Playwright is unavailable the crawler keeps the plain HTTP response rather than substituting a third-party renderer

### Content Extraction
- **Headings** with hierarchy tracking (h1 > h2 > h3 breadcrumbs)
- **Paragraphs, lists, blockquotes** (10-character minimum to skip noise)
- **Tables** converted to Markdown format
- **Image alt text and figcaptions**
- **Contact information** from nav/footer — emails, phone numbers, physical addresses
- **Meta descriptions, OpenGraph tags, and JSON-LD** structured data
- **PDF extraction** — downloads and extracts text from PDF URLs via `pdfjs-dist`

### Chunking Strategy
- **1500-character chunks** with **300-character overlap** for context continuity
- Semantic boundary splitting: paragraphs > lines > words (never splits mid-word)
- Each chunk enriched with **heading breadcrumb context** (e.g., `Section: Fee Structure > BTech CSE`) so the LLM knows the chunk's position in the page hierarchy
- **24K character page content limit** — pages exceeding this are truncated (SPA-detected sites bypass this limit)

### Pinecone Vector Storage
- **Embedding model**: `llama-text-embed-v2` (1024 dimensions)
- **Upsert mode**: Pinecone `records` mode — text is embedded server-side by Pinecone
- **Namespace**: `site_{siteId}` (e.g., `site_plaksha.edu.in`)
- **Vector IDs**: Deterministic SHA256 hash of `URL + chunk index` — re-upserting is idempotent
- **Metadata per vector**: `url`, `title`, `siteId`, `chunkIndex`, `text`

---

## 3. Chat Widget (Text + Voice)

An embeddable React widget that site owners paste into their HTML. Built as an IIFE bundle (`chat-widget.iife.js`) served with `Access-Control-Allow-Origin: *` for cross-origin embedding.

### Text Chat
- Free-text input with full conversation history (last 6 turns sent to the LLM)
- Source citations with clickable URLs appended to each answer
- Markdown rendering in the widget for formatted responses
- Conversational handling — greetings, thanks, and small talk answered naturally without triggering RAG

### Voice Chat
- **Speech-to-Text**: Records audio in the browser, sends as multipart form data to `/api/chat/voice`
- **Transcription**: Gemini multimodal generation with an inline audio part (`GEMINI_STT_MODEL`, defaults to the chat model)
- Supports **WAV, MP3, OGG, and WebM** audio formats, up to 10 MB
- Transcribed text is then processed through the full RAG pipeline
- Transcript is returned to the widget alongside the answer

### Text-to-Speech
- `/api/chat/tts` endpoint converts answer text to audio
- Uses a Gemini TTS model (`GEMINI_TTS_MODEL`, default `gemini-3.1-flash-tts-preview`) with a configurable voice (`GEMINI_TTS_VOICE`, default `Kore`)
- Gemini returns raw little-endian PCM, so a 44-byte RIFF/WAVE header is prepended before the audio is handed to the widget
- Returns base64-encoded WAV audio for playback in the widget
- 1000-character limit per TTS request (longer answers are truncated)

### Configuration
Widget appearance and behavior controlled via `window.NAVBOT_CONFIG`:
- `apiBase` — URL of the NavBot API
- `siteId` — which site's knowledge base to query
- Theme settings (colors, fonts, opacity) loaded from `/api/sites/:siteId/widget-config`

---

## 4. Agentic RAG Pipeline

The core AI pipeline that produces grounded answers. It plans retrieval with an LLM, searches the vector index with several queries at once, strips boilerplate, reranks with a cross-encoder, optionally consults a live web and social search, and writes the answer — using a two-pass analyst/editor for questions that need judgement.

Implemented in `apps/api/src/services/answer/rag.ts`, with retrieval in `services/retrieval/` and search in `services/search/`.

### Architecture

```
Visitor question
    │
    ├── 1. Curated answer  — an owner-approved FAQ answer short-circuits everything
    │
    ├── 2. Semantic cache  — first turn only, keyed on the question
    │
    ├── 3. Query planner (Gemini, JSON out)
    │        standalone question · intent · sub-queries · sections
    │        exhaustive? · analytical? · experiential?
    │        └─ greeting / out_of_scope answered here, no retrieval
    │
    ├── 4. Retrieval (parallel)
    │        ├── multi-query vector search (Pinecone, per-site namespace)
    │        ├── section expansion for exhaustive "list every X" questions
    │        ├── boilerplate removal (nav/footer text shared across pages)
    │        └── cross-encoder rerank (Pinecone Inference, bge-reranker-v2-m3)
    │
    ├── 5. Live search, when it changes the answer
    │        ├── site search  — Gemini grounding, else Serper with a site: filter
    │        └── social search — Serper over the site's configured accounts
    │
    ├── 6. Writing
    │        ├── analytical questions: analyst pass (internal brief) → editor pass
    │        └── everything else: a single streamed generation
    │
    └── 7. Parse, attach page links and follow-ups, cache if confident
```

### Stage 1: Curated answer override
Before anything else, a question is matched against FAQ answers the site owner has written. A fresh (non-stale relative to the last index) match is returned verbatim, with no vector search and no LLM call.

### Stage 2: Semantic cache
First turn only — a follow-up depends on the history that produced it, and the cache key is the question alone. Only confident, non-declining answers are written back. `NAVBOT_DISABLE_CACHE=1` bypasses it, which is what the benchmarks use.

### Stage 3: LLM query planner
One Gemini call (`GEMINI_PLANNER_MODEL`, defaults to the chat model) returns JSON:

| Field | Purpose |
|-------|---------|
| `standalone` | The question with pronouns and ellipsis resolved from history |
| `intent` | `greeting` \| `out_of_scope` \| `simple` \| `compositional` |
| `subQueries` | 1 for simple questions, 2–4 for compositional ones |
| `sections` | URL path prefixes where the answer probably lives |
| `exhaustive` | The visitor wants a complete list |
| `analytical` | Answering needs judgement, not lookup — routes to the reasoning path |
| `experiential` | "What is it *like*" — needs a description, not a fact list |

A rule-based `fallbackPlan()` covers a planner timeout or malformed JSON, so the pipeline degrades rather than failing.

### Stage 4: Retrieval
Multi-query vector search against the site's Pinecone namespace, with the section expansion running concurrently rather than after it. For exhaustive questions, roster pages found by section expansion are merged **ahead** of the vector hits and pinned through reranking — a cross-encoder scores a page of names poorly against a conversational question, and without pinning it evicts the pages that are literally the answer.

Boilerplate removal strips text that repeats across many pages of the same site before reranking, so the reranker judges page content rather than shared navigation.

### Stage 5: Cross-encoder reranking
Pinecone Inference (`PINECONE_RERANK_MODEL`, default `bge-reranker-v2-m3`) reorders candidates. The score sets **how much the answer hedges**, and is deliberately never used to refuse: its absolute value shifts with phrasing (the same correct pages scored 0.94 and 0.03 on two wordings of one question), so gating on it would refuse questions the site can answer. On reranker failure the pipeline falls back to distance ordering.

### Stage 6: Live search
Two independent, optional searches, both sharing one Serper client (`services/search/serper.ts`):

- **Site search** (`search/site.ts`) — catches what a stale or incomplete crawl missed. Prefers Gemini's Google Search grounding and falls back to Serper with a `site:` filter; a grounding quota failure parks that provider for 30 minutes rather than retrying it on every turn. Controlled by `NAVBOT_WEB_MODE` (`analytical` default, `weak`, `always`, `off`) and `NAVBOT_WEB_PROVIDER`.
- **Social search** (`search/social.ts`) — see §5.

### Stage 7: Answer generation
For `analytical` questions the pipeline runs two passes: an **analyst** produces an internal brief with a real thinking budget (never shown to the visitor), then an **editor** writes the visible answer against both the brief and the source material. Everything else takes a single streamed generation. `NAVBOT_REASONING=off` disables the two-pass path.

Context is assembled to an **18,000 character budget** — reduced from an earlier 128k, which was the dominant cost in time-to-first-token and was mostly boilerplate. When pages do not fit, the count of dropped pages travels with the context so the answer can admit the gap instead of silently truncating a list.

Answers stream to the widget as they generate. Trailing metadata blocks (`[RELEVANT_PAGES]`, `[FOLLOW_UPS]`) and `[POST:n]` citation tags are withheld from the visible text, with the displayed prefix recomputed from the whole buffer each tick so a tag split across two chunks can never leak.

### Stage 8: Degradation ladder
No answer path returns a bare error:

1. Streamed generation
2. Non-streamed retry on a reduced context (also dodges token-limit failures)
3. Partial answer with page links
4. A contact block naming the right desk for the question

### Stage 9: Source attribution
Sources are deduplicated by URL, with live-search and social URLs merged in. When the answer actually cites social posts, "For More Info" points at the official accounts rather than website pages — the visitor is being shown posts, so the useful next step is the feed.

---

## 5. Social Media Search

Supplements website content with recent social media posts for event/news queries. Runs in parallel with vector search to avoid adding latency.

### Intent Detection
Triggers when the user query contains keywords like: `event`, `workshop`, `placement`, `latest`, `upcoming`, `news`, `seminar`, `hackathon`, `bootcamp`, `meetup`, `webinar`.

### Search Pipeline
1. Per-site social handle configuration stored in the database (Instagram, Twitter/X, LinkedIn, Facebook)
2. Handles stored as full URLs or usernames — auto-extracts slugs from URLs
3. For each configured platform, queries **Serper.dev Google Search API** scoped to that platform's domain
4. Results include post title, snippet, URL, and platform identifier

### Caching & Integration
- Results cached **in-memory for 4 hours** to reduce API calls
- Social post URLs included inline in the answer text
- Social sources appended to the source list with platform prefix (e.g., `Instagram: Post Title`)

### Configuration
- Set `SERPER_API_KEY` env var
- Configure handles via `PATCH /api/sites/:siteId/social` with `{ instagram, twitter, linkedin, facebook }` fields

---

## 6. FAQ Generation & Management

Auto-generate FAQs from indexed content; admins can review and edit answers.

### Generation
- Automatic FAQ generation from retrieved page snippets using the LLM
- Questions generated based on the most important and frequently relevant content

### Admin Workflow
- View generated FAQ questions and answers in the dashboard
- **Edit/approve** individual FAQ answers — approved answers become authoritative
- **Fresh admin answers override RAG** — when a user asks a matching question, the approved answer is returned immediately without running the full pipeline
- **Stale detection** — FAQs are marked stale after re-indexing; stale FAQs fall back to RAG
- **Bulk refresh** to regenerate all FAQs after re-indexing

---

## 7. Theme Customization

Widget appearance is fully configurable per site from the dashboard.

### Features
- **Color picker** with auto-extraction from site CSS via `/api/colors?url=...`
- Font family and font size configuration
- Opacity and border radius controls
- **Live preview** in the dashboard before saving

### How It Works
1. When a site is added, NavBot fetches the site's CSS and extracts dominant colors
2. Admin can pick from extracted colors or choose custom colors
3. Theme settings are saved via `PUT /api/sites/:siteId/theme`
4. The widget loads its theme from `GET /api/sites/:siteId/widget-config` on initialization

---

## 8. Analytics & Monitoring

Track chatbot usage and performance from the dashboard.

### Metrics
- **Total query count** — lifetime queries across all sites or per site
- **7-day volume trends** — daily query counts for the past week
- **Top queries by frequency** — most common user questions
- **Recent conversation turns** with latency (ms) per response
- **Source count per answer** — a proxy for retrieval quality (more sources = richer context)
- Per-site and aggregate views

### Logging
- Every chat turn (text and voice) is logged to PostgreSQL via `logChatTurn()`
- Logs include: `siteId`, `query`, `channel` (text/voice), `answerPreview`, `latencyMs`, `sourceCount`
- Logging is **fire-and-forget** — the response is sent to the user before the log write completes, so database timeouts never cause 500 errors

---

## 9. Smart Sync

Keep indexed content fresh without full re-crawls.

### Sitemap-First Indexing
- On first crawl, NavBot checks for `sitemap.xml` and uses it to discover all pages
- Sitemap URLs are added to the crawl queue alongside BFS-discovered links
- Pages discovered only via sitemap (not linked from the site) are still indexed

### Background Sync
- **Triggered automatically** when the chat widget pings `/api/sites/:siteId/ping`
- Compares current `<lastmod>` timestamps from the sitemap against stored values
- **Incremental**: only re-crawls pages whose `<lastmod>` has changed
- **New page detection**: identifies sitemap URLs that were never indexed and adds them to the queue
- Content hash comparison for change detection even when lastmod is absent

### Manual Controls
- **Preview mode** via `GET /api/sites/:siteId/sync` — shows what would change before applying
- **Trigger sync** via `POST /api/sites/:siteId/sync`

---

## 10. AI Endpoint Evaluation

Systematic evaluation of the RAG chat endpoint using a curated dataset and LLM-as-judge scoring.

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
| **Single-prompt** | Direct vector search (1 query) → top-6 chunks → single LLM call |
| **Agentic RAG** | LLM planner + multi-query search + boilerplate removal + cross-encoder rerank + optional live search + analyst/editor |

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
- Cross-page questions see the biggest agentic improvement (2.50 → 3.12 correctness)
- Conversational handling dramatically better in agentic (2.0 → 4.0)
- Both pipelines strong on groundedness — very little hallucination

> These figures were measured against the pipeline as it stood at the time of the run.
> Re-run the harness after pipeline changes rather than quoting them as current.

### 10.5 Other harnesses

| Script | Command | What it does |
|--------|---------|--------------|
| `eval/bench.ts` | `eval:bench` | Generate **and** judge in one resumable, concurrent pass; writes `eval/runs/<label>.json` and supports `--compare before after` |
| `eval/retrieval-bench.ts` | `eval:retrieval` | Retrieval only — embed → query → boilerplate → rerank, no answer model, so it runs freely against LLM quota |
| `eval/format-test.ts` | part of `pnpm test` | Asserts answer post-formatting (chip handling, empty brackets, citation stripping) |
| `eval/clear-cache.ts` | `tsx eval/clear-cache.ts` | Clears `rag_cache` for `EVAL_SITE_ID` between measured runs |

---

## 11. API Endpoints

### Site Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sites?userId=...` | List user's sites |
| POST | `/api/sites` | Crawl & index a new site |
| DELETE | `/api/sites/:siteId` | Delete site and vectors |
| GET | `/api/sites/dashboard-stats` | Analytics and metrics |
| GET | `/api/sites/:siteId/widget-config` | Public widget config |
| GET | `/api/sites/:siteId/theme` | Get widget theme |
| PUT | `/api/sites/:siteId/theme` | Save widget theme |
| GET | `/api/sites/:siteId/social` | Get social handles |
| PATCH | `/api/sites/:siteId/social` | Update social handles |
| GET | `/api/sites/:siteId/sync` | Sync status / preview |
| POST | `/api/sites/:siteId/sync` | Trigger sync |
| GET | `/api/sites/:siteId/ping` | Ping (triggers background sync) |
| GET | `/api/sites/:siteId/pages` | List indexed pages |
| POST | `/api/sites/:siteId/pages` | Add pages by URL |
| PATCH | `/api/sites/:siteId/pages` | Re-crawl specific pages |
| DELETE | `/api/sites/:siteId/pages` | Remove pages from the index |
| POST | `/api/sites/:siteId/reindex` | Full re-crawl and re-index |
| GET | `/api/sites/:siteId/limits` | Read the daily question limit |
| PATCH | `/api/sites/:siteId/limits` | Update the daily question limit |
| GET | `/api/colors?url=...` | Extract colors from URL |

### AI Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/session` | Start/resume a visitor session, returns the quota |
| POST | `/api/chat` | Text chat (RAG pipeline) |
| POST | `/api/chat/stream` | Text chat streamed as Server-Sent Events |
| POST | `/api/chat/voice` | Voice chat (STT → RAG) |
| POST | `/api/chat/tts` | Text-to-speech |
| GET | `/api/sites/:siteId/faqs` | Get/generate FAQs |
| POST | `/api/sites/:siteId/faqs/refresh` | Regenerate FAQs from popular queries |
| PATCH | `/api/sites/:siteId/faqs/:faqId` | Save an owner-written FAQ answer |

Interactive docs, with runnable examples, are served at `/api-docs` (`apps/api/src/openapi/openapi-spec.ts`).

### Request/Response Examples

**Text Chat** — `POST /api/chat`
```json
{
  "siteId": "plaksha.edu.in",
  "message": "What are the BTech admission deadlines?",
  "history": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello! How can I help you?" }
  ]
}
```
Response:
```json
{
  "answer": "The BTech admission deadlines for 2026 are:\n• Round 1: Dec 20, 2025\n• Round 2: Feb 15, 2026\n...\n\nSource: https://plaksha.edu.in/admissions",
  "sources": [
    { "url": "https://plaksha.edu.in/admissions", "title": "BTech Admissions" }
  ]
}
```

**Voice Chat** — `POST /api/chat/voice` (multipart/form-data)
- Fields: `siteId` (string), `audio` (file, max 10 MB), `history` (optional JSON string)
- Response includes `transcript` field alongside `answer` and `sources`

**TTS** — `POST /api/chat/tts`
```json
{ "text": "The application deadline is February 15, 2026." }
```
Response:
```json
{ "audio": "<base64-encoded WAV>" }
```

---

## 12. Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Frontend | React + Vite + Tailwind CSS | Dashboard and widget UI |
| Auth | better-auth | Email/password, Google OAuth, GitHub OAuth |
| API | Express + TypeScript | REST API server |
| Vector DB | Pinecone | `llama-text-embed-v2` embeddings, 1024 dims, records mode |
| LLM (chat, planner, analyst/editor) | Google Gemini (`@google/genai`) | `gemini-2.5-flash` by default; the planner can be pointed at a smaller model |
| Reranking | Pinecone Inference | `bge-reranker-v2-m3` cross-encoder |
| STT | Google Gemini | Multimodal generation with an inline audio part |
| TTS | Google Gemini | `gemini-3.1-flash-tts-preview`, PCM wrapped as WAV |
| Database | PostgreSQL | Sites, pages, analytics, social handles, FAQs |
| Crawling | Cheerio + Playwright + pdfjs-dist | Static HTML, SPA rendering, PDF extraction |
| Live search | Gemini Google Search grounding + Serper.dev | Site-restricted web search and social account search |
| Widget | React IIFE bundle | Cross-origin embeddable via `<script>` tag |
| Monorepo | pnpm + Turborepo | Shared packages across apps |
| Deploy | Render (Blueprint) | `render.yaml` defines all services |
| Docker | Playwright + Chromium | API runs in Docker for headless browser support |

---

## 13. Environment Variables

### API Service (`navbot-api`)

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Gemini API key for chat, planner, STT and TTS (`GOOGLE_API_KEY` also accepted) |
| `GEMINI_CHAT_MODEL` | No | Answer model (default: `gemini-2.5-flash`) |
| `GEMINI_PLANNER_MODEL` | No | Planner model (defaults to the chat model) |
| `GEMINI_STT_MODEL` | No | Speech-to-text model (defaults to the chat model) |
| `GEMINI_TTS_MODEL` | No | Text-to-speech model (default: `gemini-3.1-flash-tts-preview`) |
| `GEMINI_TTS_VOICE` | No | TTS voice name (default: `Kore`) |
| `PINECONE_API_KEY` | Yes | Pinecone API key |
| `PINECONE_INDEX` | Yes | Pinecone index name |
| `PINECONE_HOST` | No | Pinecone host URL (optional override) |
| `PINECONE_RERANK_MODEL` | No | Cross-encoder for reranking (default: `bge-reranker-v2-m3`) |
| `SERPER_API_KEY` | No | Serper.dev key — powers both site search and social search |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NAVBOT_REASONING` | No | `off` disables the two-pass analyst/editor path (default: on) |
| `NAVBOT_WEB_MODE` | No | Live site search: `analytical` (default), `weak`, `always`, `off` |
| `NAVBOT_WEB_PROVIDER` | No | `auto` (default), `grounding`, `serper`, `off` |
| `NAVBOT_SESSION_SECRET` | Yes (prod) | Signs anonymous visitor tokens for the daily question cap |
| `NAVBOT_API_TOKEN_SECRET` | Yes (prod) | Must match the auth service — verifies dashboard requests |
| `NAVBOT_DISABLE_CACHE` | No | `1` bypasses the semantic cache (used by the benchmarks) |
| `AUTO_SYNC_CRON` | No | Sitemap re-crawl schedule (default: `0 */6 * * *`) |
| `NAVBOT_BROWSER_CRAWL` | No | Browser crawl mode: `auto` (default), `always`, `off` |

### Auth Service (`navbot-auth`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | Secret for signing sessions |
| `BETTER_AUTH_URL` | Yes | Public URL of the auth service |
| `CORS_ORIGIN` | Yes | Allowed origins (comma-separated) |
| `NAVBOT_API_TOKEN_SECRET` | Yes (prod) | Must be the same value as on the API service |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth client secret |

### Web App (`navbot-web`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | NavBot API URL |
| `VITE_AUTH_URL` | Yes | Auth service URL |
| `VITE_WIDGET_SCRIPT_URL` | No | Absolute URL of `chat-widget.iife.js`; defaults to this app's own origin |

---

## Running the Evaluation

```bash
# 1. Set environment variables
export GEMINI_API_KEY="your-key"
export PINECONE_API_KEY="your-key"
export PINECONE_INDEX="your-index"
export DATABASE_URL="postgres://..."     # curated answers and the semantic cache
export EVAL_SITE_ID="plaksha.edu.in"
export NAVBOT_DISABLE_CACHE=1            # measure the pipeline, not the cache

# 2a. Single-prompt vs agentic comparison (rate-limited, resumable)
pnpm --filter api eval:baselines         # → eval/baseline-results.json
pnpm --filter api eval:judge             # → eval/eval-results.json

# 2b. Or the current benchmark: generate + judge in one resumable pass
pnpm --filter api eval:bench -- --label after
pnpm --filter api eval:bench -- --compare before after

# 3. Retrieval only — no answer model, so it runs freely against LLM quota
pnpm --filter api eval:retrieval
```

`eval:baselines` + `eval:judge` produce the single-prompt vs agentic comparison used in client reporting. `eval:bench` is the day-to-day harness: it writes `eval/runs/<label>.json`, skips ids already finished, and scores correctness, groundedness and relevance with a Gemini judge.
