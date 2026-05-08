# NavBot — Product Features

NavBot is a website-grounded AI assistant that answers visitor questions using retrieval-augmented generation (RAG) from indexed site content. It combines multi-query vector search, an agentic planner, social media search, and an LLM judge into a single embeddable chat widget with text and voice support.

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
3. **Jina Reader API** (`r.jina.ai`) — fallback when Playwright is unavailable; also used for manual scraping of hard-to-render pages

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
- **Transcription**: Sarvam Saaras (`saaras:v3`) converts audio to text
- Supports **WAV, MP3, OGG, and WebM** audio formats, up to 10 MB
- Transcribed text is then processed through the full RAG pipeline
- Transcript is returned to the widget alongside the answer

### Text-to-Speech
- `/api/chat/tts` endpoint converts answer text to audio
- Uses **Sarvam Bulbul** (`bulbul:v2`) with configurable speaker (default: `anushka`) and language (default: `en-IN`)
- Returns base64-encoded WAV audio for playback in the widget
- 1000-character limit per TTS request (longer answers are truncated)

### Configuration
Widget appearance and behavior controlled via `window.NAVBOT_CONFIG`:
- `apiBase` — URL of the NavBot API
- `siteId` — which site's knowledge base to query
- Theme settings (colors, fonts, opacity) loaded from `/api/sites/:siteId/widget-config`

---

## 4. Agentic RAG Pipeline

The core AI pipeline that powers accurate, grounded answers. It combines rule-based query expansion, an LLM-powered planner, multi-query vector search, a refiner loop, and an LLM judge into a multi-stage retrieval and generation pipeline.

### Architecture

```
User Question
    │
    ├── FAQ Override Check (admin-approved answers short-circuit RAG)
    │
    ├── Rule-based Query Expansion (7 domain patterns)
    │
    ├── LLM Planner (Sarvam sarvam-m) → generates 6-12 search queries + HyDE paragraph
    │
    ├── Vector Search (Pinecone) → top-K chunks per query, URL spreading
    │
    ├── Refiner Loop (if retrieval weak: distance > 0.62 or low keyword overlap)
    │
    ├── Multi-page Expansion (for exhaustive list questions)
    │
    ├── Social Media Search (in parallel via Serper.dev)
    │
    ├── Context Building (50K char budget, page directory, source blocks)
    │
    ├── Sarvam Chat Completion (sarvam-m, cross-page synthesis instructions)
    │
    ├── LLM Judge (validates answer against context, revises or rejects)
    │
    └── Source Attribution (deduplicated URLs, distance-filtered)
```

### Stage 1: FAQ Override
Before running RAG, checks if the user's question matches an admin-approved FAQ answer. If a fresh (non-stale) match exists, returns it immediately without vector search or LLM calls.

### Stage 2: Rule-Based Query Expansion
Seven domain-specific regex patterns that expand the user query with relevant synonyms to improve vector recall:

| Pattern | Expansion |
|---------|-----------|
| Deadlines, dates, admissions | `admission rounds application deadline dates schedule` |
| Fees, scholarships, financial aid | `tuition fee scholarship financial aid funding` |
| Eligibility, requirements, scores | `eligibility criteria requirements qualifications` |
| Programs, courses, curriculum | `program curriculum courses modules structure` |
| Contact, email, phone, location | `contact information address email phone campus` |
| List/enumerate questions | `complete list overview all items features details` |
| Events, workshops, seminars | `events page all events workshops past events schedule` |

Additionally, question phrasing is stripped ("who is", "what are", "tell me about", etc.) to produce a cleaned variant.

### Stage 3: LLM Planner (Agentic)
When enabled (`ENABLE_AGENTIC_PLANNER=true`, default), an LLM call generates:
- **6-12 diverse search queries** targeting different site sections (admissions, fees, faculty, events, etc.)
- A **HyDE paragraph** (Hypothetical Document Embedding) — a synthetic passage that might answer the question, used as an additional search query for better semantic matching
- Event-section retrieval boosters for workshop/event questions

The planner uses `SARVAM_PLANNER_MODEL` (default: `sarvam-m`) with JSON-mode output.

### Stage 4: Multi-Query Vector Search
Each generated query is sent to Pinecone in parallel:
- **Top-K retrieval**: 12 chunks per query
- **URL spreading**: Results are diversified across different pages to avoid over-representing a single source
- All results are merged, deduplicated by vector ID, and sorted by distance

### Stage 5: Refiner Loop
If the best retrieval distance exceeds 0.62 or keyword overlap with the user query is low, the refiner generates alternative queries and re-searches. Controlled by `AGENTIC_RAG_MAX_ROUNDS` (default: 1, max: 3).

### Stage 6: Multi-Page Expansion
For exhaustive list questions ("list all programs", "what are all the events"), the system:
- Detects list-intent via regex patterns
- Loads additional chunks from tracked URLs in the same path section (e.g., all `/events/...` pages)
- Uses `sortDocsForExhaustiveAnswer()` to prioritize diverse source coverage

### Stage 7: Context Building
Retrieved chunks are assembled into a structured context string:
- **50K character budget** for the full context window
- **Page directory** — numbered list of all retrieved pages with titles and URLs
- **Source blocks** — grouped by URL, with chunk overlap removed
- Exhaustive questions get higher per-chunk limits (1400 chars) and more sources (up to 30)
- Standard questions get 1800 chars/chunk and up to 20 sources

### Stage 8: LLM Chat Completion
The assembled context is sent to Sarvam (`SARVAM_CHAT_MODEL`, default: `sarvam-m`) with:
- A detailed system prompt with 22 rules covering: customer service chatbot identity, first-person voice, grounded answering, cross-page synthesis, data-first responses (specific dates/amounts/names over generic steps), concise formatting (bullets for lists, direct for factual), university/academic awareness, follow-up questions, and security constraints
- Last 6 conversation turns for multi-turn context
- Temperature: 0.2 for factual consistency
- Higher token limit for catalog/list questions (1536 vs 400)

### Stage 9: LLM Judge
When enabled (`ENABLE_LLM_JUDGE=true`), a second LLM call validates the draft answer:
- Checks that all factual claims are supported by retrieved context
- Returns `{"acceptable": true}` or provides a `revised_answer`
- If the draft is unacceptable and no revision is possible, returns a safe fallback ("I don't have that information")
- Uses `SARVAM_JUDGE_MODEL` with temperature 0.1 and JSON-mode output
- Receives condensed context summaries (320 chars per source, up to 6-14 sources)

### Stage 10: Source Attribution
- Sources are deduplicated by URL
- Filtered by distance threshold (0.55 when social results present, 1.0 otherwise)
- Exhaustive questions show up to 8 source URLs; standard questions show up to 2
- Social media URLs are included inline in the answer text (not in the source line)

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
- Cross-page questions see the biggest agentic improvement (2.50 → 3.12 correctness)
- Conversational handling dramatically better in agentic (2.0 → 4.0)
- Both pipelines strong on groundedness — very little hallucination

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
| GET | `/api/colors?url=...` | Extract colors from URL |

### AI Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Text chat (RAG pipeline) |
| POST | `/api/chat/voice` | Voice chat (STT → RAG) |
| POST | `/api/chat/tts` | Text-to-speech |
| GET | `/api/sites/:siteId/faqs` | Get/generate FAQs |

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
| LLM (Chat/Planner/Judge) | Sarvam AI (`sarvamai`) | `sarvam-m` (24B) via Sarvam API; also supports `sarvam-30b` and `sarvam-105b` |
| STT | Sarvam Saaras | `saaras:v3` for speech-to-text |
| TTS | Sarvam Bulbul | `bulbul:v2` for text-to-speech (configurable speaker and language) |
| Database | PostgreSQL | Sites, pages, analytics, social handles, FAQs |
| Crawling | Cheerio + Playwright + pdfjs-dist | Static HTML, SPA rendering, PDF extraction |
| Social Search | Serper.dev | Google search API scoped to social platforms |
| Widget | React IIFE bundle | Cross-origin embeddable via `<script>` tag |
| Monorepo | pnpm + Turborepo | Shared packages across apps |
| Deploy | Render (Blueprint) | `render.yaml` defines all services |
| Docker | Playwright + Chromium | API runs in Docker for headless browser support |

---

## 13. Environment Variables

### API Service (`navbot-api`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SARVAM_API_KEY` | Yes | Sarvam AI API key for chat, planner, judge, STT, and TTS |
| `SARVAM_CHAT_MODEL` | No | Chat model (default: `sarvam-m`) |
| `SARVAM_PLANNER_MODEL` | No | Planner model (default: `sarvam-m`) |
| `SARVAM_JUDGE_MODEL` | No | Judge model (default: `sarvam-m`) |
| `SARVAM_STT_MODEL` | No | STT model (default: `saaras:v3`) |
| `SARVAM_TTS_MODEL` | No | TTS model (default: `bulbul:v2`) |
| `SARVAM_TTS_SPEAKER` | No | TTS speaker voice (default: `anushka`) |
| `SARVAM_TTS_LANG` | No | TTS language code (default: `en-IN`) |
| `PINECONE_API_KEY` | Yes | Pinecone API key |
| `PINECONE_INDEX` | Yes | Pinecone index name |
| `PINECONE_HOST` | No | Pinecone host URL (optional override) |
| `SERPER_API_KEY` | No | Serper.dev API key for social media search |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AGENTIC_RAG_MAX_ROUNDS` | No | Max refiner iterations (default: 1, max: 3) |
| `ENABLE_AGENTIC_PLANNER` | No | Enable LLM planner (default: `true`) |
| `ENABLE_LLM_JUDGE` | No | Enable LLM judge (default: `false`) |
| `NAVBOT_BROWSER_CRAWL` | No | Browser crawl mode: `auto`, `on`, `off` (default: `auto`) |

### Auth Service (`navbot-auth`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | Secret for signing sessions |
| `BETTER_AUTH_URL` | Yes | Public URL of the auth service |
| `CORS_ORIGIN` | Yes | Allowed origins (comma-separated) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth client secret |

### Web App (`navbot-web`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | NavBot API URL |
| `VITE_AUTH_URL` | Yes | Auth service URL |
| `VITE_WIDGET_SCRIPT_URL` | Yes | URL of `chat-widget.iife.js` |

---

## Running the Evaluation

```bash
# 1. Set environment variables
export SARVAM_API_KEY="your-key"
export PINECONE_API_KEY="your-key"
export PINECONE_INDEX="your-index"
# DATABASE_URL not required — eval scripts run without DB

# 2. Run both baselines on the dataset (rate-limited, resumable)
pnpm --filter api eval:baselines

# 3. Score with LLM-as-judge
pnpm --filter api eval:judge
```

Output includes a comparison table and aggregate scores showing how agentic RAG improves over the single-prompt baseline.
