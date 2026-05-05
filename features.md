# NavBot — Product Features

NavBot is a website-grounded AI assistant that answers visitor questions using retrieval-augmented generation (RAG) from indexed site content.

---

## Table of Contents

1. [Dashboard & Site Management](#1-dashboard--site-management)
2. [Website Crawling & Indexing](#2-website-crawling--indexing)
3. [Chat Widget (Text + Voice)](#3-chat-widget-text--voice)
4. [Agentic RAG Pipeline](#4-agentic-rag-pipeline)
5. [FAQ Generation & Management](#5-faq-generation--management)
6. [Theme Customization](#6-theme-customization)
7. [Analytics & Monitoring](#7-analytics--monitoring)
8. [Smart Sync](#8-smart-sync)
9. [AI Endpoint Evaluation](#9-ai-endpoint-evaluation)
10. [API Endpoints Demonstration](#10-api-endpoints-demonstration)

---

## 1. Dashboard & Site Management

Users can register, add websites, and manage all sites from a single dashboard.

**Features:**
- Email/password and OAuth (Google/GitHub) authentication
- Add sites by URL — automatic crawling and indexing
- View all registered sites with page count and status
- Delete sites and associated vector data

![Dashboard Screenshot](screenshots/dashboard.png)

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
- Structured text extraction: headings, paragraphs, tables (converted to Markdown), lists
- Content deduplication via MD5 fingerprinting
- Skips binary files, paginated URLs, and thin/404 pages

![Crawling Flow](screenshots/crawling.png)

**Framework Detection Example:**
```
[crawler] SPA detected (react) for https://example.com — using browser rendering
[crawler] JS-rendered page richer for https://example.com (42 → 3847 chars structured text)
```

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

![Chat Widget](screenshots/widget.png)

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
    │
    ├─► Rule-based Query Expansion (deadlines, fees, programs, etc.)
    │
    ├─► LLM Planner (Gemini) → generates 4-10 search queries + HyDE paragraph
    │
    ├─► Vector Search (Pinecone) → top-K chunks per query
    │
    ├─► Refiner Loop (if retrieval looks weak) → alternative queries
    │
    ├─► Multi-page Expansion (for exhaustive list questions)
    │
    ├─► Gemini Chat Completion (with optional code execution for math)
    │
    └─► LLM Judge (validates answer against retrieved context)
```

**Key capabilities:**
- **Query expansion rules** — domain-specific patterns for admissions, fees, deadlines
- **Agentic planner** — LLM generates diverse search queries
- **Refiner loop** — iteratively improves retrieval when initial results are weak
- **Code execution** — solves math/computation questions with sandboxed code
- **LLM Judge** — fact-checks the draft answer against retrieved context
- **FAQ override** — admin-approved answers short-circuit RAG when fresh

![RAG Pipeline](screenshots/rag-pipeline.png)

---

## 5. FAQ Generation & Management

Auto-generate FAQs from indexed content; admins can edit answers.

**Features:**
- Automatic FAQ generation from retrieved page snippets
- Admin can edit/approve FAQ answers in the dashboard
- Fresh admin answers override RAG for matching questions
- Bulk refresh to regenerate after re-indexing

![FAQ Management](screenshots/faqs.png)

---

## 6. Theme Customization

Widget appearance is fully configurable per site.

**Features:**
- Color picker with auto-extraction from site CSS (`/api/colors`)
- Font family and size configuration
- Opacity and border radius controls
- Live preview in the dashboard

![Theme Picker](screenshots/theme.png)

---

## 7. Analytics & Monitoring

Track chatbot usage and performance from the dashboard.

**Features:**
- Total query count, 7-day volume trends
- Top queries by frequency
- Recent conversation turns with latency
- Per-site and aggregate views
- Source count per answer (retrieval quality signal)

![Analytics](screenshots/analytics.png)

---

## 8. Smart Sync

Keep indexed content fresh without full re-crawls.

**Features:**
- Background sitemap-based sync triggered on widget ping
- Incremental sync: only update changed/new/removed pages
- Preview mode: see what would change before applying
- Full re-crawl option when needed
- Content hash comparison for change detection

---

## 9. AI Endpoint Evaluation

Systematic evaluation of the RAG chat endpoint (`POST /api/chat`).

### 9.1 Dataset

A curated dataset of 25 question/answer pairs covering:
- Factual questions (admissions, fees, contacts)
- List questions (programs, workshops, facilities)
- Procedural questions (how to apply)
- Computation questions (calculate total fees)
- Conversational (greetings)
- Out-of-scope (questions not about the site)

Located at: `apps/api/eval/dataset.json`

### 9.2 Baselines

Two implementations compared side-by-side:

| Baseline | Description |
|----------|-------------|
| **Single-prompt** | Direct vector search (1 query) → top-6 chunks → single Gemini call |
| **Agentic RAG** | Rule expansion + LLM planner + multi-query search + refiner loop + LLM judge |

Run: `pnpm --filter api eval:baselines`

### 9.3 LLM-as-Judge Evaluation

Each response is scored by Gemini on three criteria (0-5 scale):

| Criterion | What it measures |
|-----------|-----------------|
| **Correctness** | Factual accuracy vs. ground truth |
| **Groundedness** | No hallucination — claims supported by retrievable content |
| **Relevance** | Directly addresses the user's question |

Run: `pnpm --filter api eval:judge`

**Expected results:** Agentic RAG outperforms the single-prompt baseline on correctness and relevance, especially for list/catalog questions and edge cases requiring multiple retrieval passes.

![Evaluation Results](screenshots/eval-results.png)

---

## 10. API Endpoints Demonstration

### Non-AI Endpoints

#### List user sites
```bash
curl "http://localhost:3001/api/sites?userId=user123"
```
```json
[{"site_id": "www.example.com", "url": "https://www.example.com", "pages_indexed": 45}]
```

#### Dashboard analytics
```bash
curl "http://localhost:3001/api/sites/dashboard-stats?userId=user123&siteId=www.example.com"
```
```json
{"total_queries": 1250, "seven_day_volume": [12, 18, 15, 22, 19, 25, 20], "top_queries": [...]}
```

#### Get widget theme
```bash
curl "http://localhost:3001/api/sites/www.example.com/theme?userId=user123"
```

#### Save widget theme
```bash
curl -X PUT "http://localhost:3001/api/sites/www.example.com/theme?userId=user123" \
  -H "Content-Type: application/json" \
  -d '{"primaryColor": "#2563eb", "fontFamily": "Inter"}'
```

#### Public widget config
```bash
curl "http://localhost:3001/api/sites/www.example.com/widget-config"
```

#### Extract colors from URL
```bash
curl "http://localhost:3001/api/colors?url=https://www.example.com"
```

#### Sync preview
```bash
curl "http://localhost:3001/api/sites/www.example.com/sync?userId=user123&preview=true"
```

#### Ping (triggers background sync)
```bash
curl "http://localhost:3001/api/sites/www.example.com/ping"
```

---

### AI Endpoints

#### Text chat (RAG)
```bash
curl -X POST "http://localhost:3001/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"siteId": "www.example.com", "message": "What are the admission deadlines?"}'
```
```json
{
  "answer": "Applications for Fall 2025 open January 15. Round 1 deadline: March 1. Round 2: May 15. Final: July 1.",
  "sources": [{"url": "https://www.example.com/admissions", "title": "Admissions"}]
}
```

#### Voice chat (STT + RAG)
```bash
curl -X POST "http://localhost:3001/api/chat/voice" \
  -F "siteId=www.example.com" \
  -F "audio=@question.webm"
```
```json
{
  "transcript": "What programs do you offer?",
  "answer": "We offer B.Tech in CS, B.Tech in EE, M.Tech in AI, and a PG Diploma in Tech Leadership.",
  "sources": [...]
}
```

#### Text-to-speech
```bash
curl -X POST "http://localhost:3001/api/chat/tts" \
  -H "Content-Type: application/json" \
  -d '{"text": "We offer four programs including B.Tech and M.Tech."}'
```
```json
{"audio": "<base64-encoded-wav>"}
```

#### FAQ generation
```bash
curl "http://localhost:3001/api/sites/www.example.com/faqs?includeAnswers=true"
```

#### Crawl & index a site
```bash
curl -X POST "http://localhost:3001/api/sites" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.example.com", "userId": "user123"}'
```

#### Re-index site
```bash
curl -X POST "http://localhost:3001/api/sites/www.example.com/reindex" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.example.com", "userId": "user123"}'
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + Tailwind CSS |
| Auth | better-auth (email, Google, GitHub OAuth) |
| API | Express + TypeScript |
| Vector DB | Pinecone (llama-text-embed-v2, 1024 dims) |
| LLM | Google Gemini 2.5 Flash |
| Database | PostgreSQL |
| Crawling | Cheerio + Playwright + Jina Reader |
| Widget | React IIFE bundle |
| Monorepo | pnpm + Turborepo |
| Deploy | Render (Blueprint) |

---

## Running the Evaluation

```bash
# 1. Set environment variables
export EVAL_SITE_ID="your-indexed-site-id"
export GOOGLE_API_KEY="your-key"
export PINECONE_API_KEY="your-key"
export PINECONE_INDEX="your-index"
export DATABASE_URL="postgres://..."

# 2. Run both baselines on the dataset
pnpm --filter api eval:baselines

# 3. Score with LLM-as-judge
pnpm --filter api eval:judge
```

Output includes a comparison table and aggregate scores showing how agentic RAG improves over the naive single-prompt baseline.
