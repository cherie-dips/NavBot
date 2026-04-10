# NavBot

NavBot is a **website-grounded AI assistant** for organizations that want visitors to get accurate answers from their own pages—not from the open web. Owners connect a site, NavBot crawls and indexes the content, and a small **embeddable chat widget** answers questions using **retrieval-augmented generation (RAG)** with support for **text and voice**.

This repository is a **pnpm + Turborepo monorepo**: a marketing and dashboard web app, a dedicated auth service, a Node API for crawling and chat, and a standalone widget bundle customers paste into their HTML.

---

## 1. What is NavBot

### Problem

Visitors often struggle to find concrete information (deadlines, fees, program details) when it is spread across many pages, PDFs, or long navigation trees. Generic chatbots either hallucinate or require manual FAQ authoring.

### What NavBot does

- **Crawls** a website (same hostname), extracts readable text (including structured content such as tables), and **chunks** it for search.
- **Stores** embeddings in **ChromaDB** (per-site collections) so questions can be matched **semantically** to the right passages.
- **Answers** using **Sarvam AI** only from retrieved context, with **sources** (URLs) attached to the response.
- **Widgets** can be dropped on any page via a **script tag**; the dashboard generates the snippet and theme configuration.
- **Dashboard** features include site management, integration instructions, analytics-style views (volume, top queries, recent turns), **generated FAQs** with optional admin-edited answers that influence live replies when still “fresh” relative to indexing.

### Who it is for

- **Site owners** (universities, programs, product sites) who want a low-friction Q&A layer on top of existing content.
- **Developers** embedding the widget without changing their main backend.

---

## 2. How to onboard

### Prerequisites

- **Node.js** (LTS recommended)
- **pnpm** (`pnpm@8.x` matches the repo; see root `package.json`)
- For local Chroma (if not using Chroma Cloud): a running **Chroma** instance (default client URL `http://localhost:8000` unless overridden)
- **Sarvam API key** for LLM (and optionally **OpenAI API key** for embeddings—see below)

### Clone and install

```bash
git clone <your-fork-or-remote-url>
cd NavBot
pnpm install
```

### Environment variables

Configure each app that you run. Typical local development:


| App                             | File                  | Variables (summary)                                                                                                                                                                            |
| ------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth server** (`apps/server`) | `.env`                | `CORS_ORIGIN` (e.g. `http://localhost:5173`); optional `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` for OAuth                                        |
| **API** (`apps/api`)            | `.env`                | `SARVAM_API_KEY` (chat/voice); optional `SARVAM_CHAT_MODEL`; local Chroma `CHROMA_URL` or Cloud `CHROMA_API_KEY` + `CHROMA_TENANT` + `CHROMA_DATABASE`; optional `OPENAI_API_KEY` (embeddings) |
| **Web** (`apps/web`)            | `.env` / `.env.local` | `VITE_AUTH_URL` `VITE_API_URL` `VITE_WIDGET_SCRIPT_URL` (URL where `chat-widget.iife.js` is served in dev/prod)                                                                                |


### Run the stack (development)

From the repository root:

```bash
pnpm dev
```

This runs **Turborepo** `dev` for **web** (Vite), **server** (auth), and **api** (Express) in parallel.

- **Web dashboard & marketing:** `http://localhost:5173` (typical Vite port)
- **Auth (better-auth):** `http://localhost:3000`
- **API:** `http://localhost:3001`
- **API docs (Swagger UI):** `http://localhost:3001/api-docs`

Build and serve the **chat widget** separately when you need the real embed script URL (or point `VITE_WIDGET_SCRIPT_URL` at your deployed widget):

```bash
pnpm --filter @repo/chat-widget build
# Serve `packages/chat-widget/dist/chat-widget.iife.js` with your static host or dev server
```

### End-user onboarding (product flow)

1. **Sign up / sign in** via the web app (email/password; Google/GitHub if OAuth env vars are set).
2. **Add a website** from the dashboard (paste root URL). The app triggers crawling and indexing; progress is shown in the UI.
3. Open **Integration** for a site, copy the **script snippet** (`window.NAVBOT_CONFIG` + widget script URL), and paste it into the customer site’s HTML.
4. Visitors use the floating chat: **text** via `POST /api/chat`, **voice** via `POST /api/chat/voice` (multipart audio + `siteId`).

---

## 3. How APIs, services, and databases work?

### Architecture

**Clients:** The **web app** (dashboard and marketing) runs in the browser and talks to two backends: the **auth server** for sign-in and sessions, and the **NavBot API** for everything related to sites, crawling, chat, and analytics. The **chat widget** is a separate JavaScript bundle embedded on customer websites; it only talks to the **NavBot API** using `apiBase` and `siteId` from `window.NAVBOT_CONFIG`.

**Auth server (`apps/server`):** Implements **better-auth** on top of the same **SQLite** file as the API (`navbot.db` at the repo root). It issues and validates sessions for the web app. User identifiers from auth are passed to the API (today often as `userId` query parameters from the dashboard) to scope site lists, themes, sync, and analytics.

**NavBot API (**`apps/api`**):** Single Express application that orchestrates **crawling**, **writes and reads application tables** in SQLite, **queries and updates** the **ChromaDB** collection for each `siteId`, and calls **Sarvam** for LLM chat, speech-to-text, and text-to-speech. Chroma uses OpenAI **text-embedding-3-small** for embeddings; the browser never calls OpenAI directly.

**Data flow for a typical chat:** Widget sends `POST /api/chat` with `siteId` and `message`. The API may return an admin-approved FAQ answer from SQLite if it matches the question and is not stale; otherwise it **embeds/expands the query**, **retrieves chunks** from the site’s Chroma collection, builds context, calls **Sarvam** for a completion, formats the answer (including sources), and **logs** a row to `chat_query` in SQLite.

**Background freshness:** `GET /api/sites/:siteId/ping` (used when the widget loads) triggers **non-blocking** sitemap sync work so indexed content can stay aligned with the live site without blocking the UI.

---

### SQLite (`navbot.db`)

**Single shared file** at the **repository root** (`navbot.db`), opened by:

- `**apps/server`** — **better-auth** tables (`user`, `session`, `account`, `verification`) and bootstraps related app tables.
- `**apps/api`** — **application** tables via `better-sqlite3` (`apps/api/src/services/db.ts`).

**Important:** Both processes expect the same path (`../../navbot.db` from `apps/server` or `apps/api` working directory). Run API and auth from the monorepo layout so the file stays consistent.

**Main application tables (API side)** include:


| Area         | Tables (conceptual) | Role                                                                                                     |
| ------------ | ------------------- | -------------------------------------------------------------------------------------------------------- |
| Sites        | `site`              | Per-user site registration: `site_id`, `user_id`, URL, hostname, `pages_indexed`, theme JSON, timestamps |
| Crawl / sync | `page_lastmod`      | Per-URL tracking: content hash, `indexed_at`, optional sitemap `lastmod` for auto-sync                   |
| FAQs         | `faq`               | Generated FAQ rows per site; optional `answer_preview`, `user_answer`, timestamps for dashboard edits    |
| Analytics    | `chat_query`        | Logged turns: query, channel, answer preview, latency, source count                                      |


**How it is used:** The API reads/writes sites and analytics; the auth server authenticates users; user IDs from auth tie dashboard requests (e.g. `?userId=`) to rows in `site`.

### ChromaDB (vector store)

**Purpose:** Semantic retrieval for RAG.

- **Client:** `chromadb` npm package (`apps/api/src/services/vectorstore.ts`).
- **Modes:**
  - **Local:** `ChromaClient` with `CHROMA_URL` (default `http://localhost:8000`).
  - **Cloud:** `CloudClient` when `CHROMA_API_KEY`, `CHROMA_TENANT`, and `CHROMA_DATABASE` are set.

**Collections:** One per site, named with prefix `site_` + `siteId` (e.g. hostname-based id).

**Embeddings:**

- If `**OPENAI_API_KEY`** is set, the API configures Chroma to use **OpenAI `text-embedding-3-small`** for upserts and queries.
- Otherwise Chroma falls back to its **default** embedding behavior (see `apps/api/src/services/vectorstore.ts`).

**Pipeline:**

1. **Upsert:** Crawled pages → chunking (~900 characters, overlap) → batch upsert with metadata (`siteId`, `url`, `title`, chunk indices).
2. **Query:** User message (plus optional query expansion) → embedding search → top-K chunks → dedupe by URL → context string for the LLM.

### Sarvam AI (LLM + voice)

**Purpose:** Answer generation and optional speech features.

- **Chat completions** for RAG answers (`apps/api/src/services/rag.ts`).
- **Speech-to-text** and **text-to-speech** for voice flows (`apps/api/src/routes/chat.ts` uses transcribe/TTS from the RAG service layer).

**Configuration:** `SARVAM_API_KEY`; optional `SARVAM_CHAT_MODEL` (default `sarvam-m`).

**Behavior (summary):** Retrieve context from Chroma → build a strict “answer only from context” system prompt → call Sarvam with short history → return answer and source list. FAQ **user overrides** can short-circuit RAG when the saved answer is not considered stale vs. latest indexing (see `getFaqUserAnswerForQuestion` / `rag.ts`).

### Endpoint reference (by layer)

Base URL for the NavBot API is typically `http://localhost:3001` in development. Interactive docs: `**GET /api-docs`** (Swagger UI). The **auth app** is separate on port **3000** under `/api/auth/`*.

---

#### HTTP + SQLite (`navbot.db`) — sites, themes, analytics, FAQs, logging

These routes persist or read **application state** in SQLite (and may trigger work that also touches Chroma—see the next sections).


| Method   | Path                               | Query / body                              | Purpose                                                                                                                                           | SQLite (primary)                                                                                |
| -------- | ---------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET`    | `/api/sites`                       | `userId` (required)                       | List all sites registered to that user (dashboard navbar, website list).                                                                          | Reads `site`.                                                                                   |
| `GET`    | `/api/sites/dashboard-stats`       | `userId` (required), `siteId` (optional)  | Aggregated analytics: totals, 7-day volume, top queries, recent turns, context counts. Omit `siteId` to aggregate across all of the user’s sites. | Reads `chat_query`, `site`, `faq` counts. Returns `403` if `siteId` is not owned by user.       |
| `DELETE` | `/api/sites/:siteId`               | `userId` (required)                       | Removes the user’s row for that site; if no users remain for `siteId`, may purge Chroma collection and derived data.                              | Deletes/updates `site`, `faq`, `chat_query`, `page_lastmod` as implemented in `db.ts` / routes. |
| `GET`    | `/api/sites/:siteId/theme`         | `userId` (required)                       | Load saved widget theme for the integration panel.                                                                                                | Reads `site.widget_theme`.                                                                      |
| `PUT`    | `/api/sites/:siteId/theme`         | `userId` (required), JSON **WidgetTheme** | Save widget colors, fonts, opacity, etc.                                                                                                          | Updates `site.widget_theme`.                                                                    |
| `GET`    | `/api/sites/:siteId/widget-config` | —                                         | **Public** (no `userId`): returns `siteId` + theme JSON for the embeddable widget on customer pages.                                              | Reads `site.widget_theme` (first matching `site_id`).                                           |
| `GET`    | `/api/sites/:siteId/faqs`          | `includeAnswers=1` or `true` (optional)   | Returns FAQ list; generates and stores FAQs if empty. With `includeAnswers`, includes generated/admin answers and metadata for dashboard.         | Reads/writes `faq`; may invoke LLM path (see Sarvam table below).                               |
| `POST`   | `/api/sites/:siteId/faqs/refresh`  | —                                         | Regenerates FAQ questions (and answers per current implementation).                                                                               | Replaces `faq` rows for site.                                                                   |
| `PATCH`  | `/api/sites/:siteId/faqs/:faqId`   | JSON `{ "answer": "..." }`                | Save **user-edited** canonical answer for that FAQ (dashboard feedback).                                                                          | Updates `faq.user_answer`, `user_answer_updated_at`.                                            |
| `GET`    | `/api/sites/:siteId/ping`          | —                                         | Quick `ok` response; kicks off **background** sitemap sync (fire-and-forget).                                                                     | Minimal direct SQL; sync updates `page_lastmod` and related state indirectly.                   |


---

#### HTTP + ChromaDB — vector index (embeddings and semantic search)

Indexing and sync routes **write** chunks and embeddings to the Chroma collection `site_<siteId>`. Chat **reads** that collection during RAG unless an FAQ override applies.


| Method  | Path                         | Query / body                                   | Purpose                                                                                                                                                   | Chroma                                                                    |
| ------- | ---------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `POST`  | `/api/sites`                 | JSON `{ url, userId?, siteId? }`               | First-time or reuse: crawl site (or attach user to existing index), chunk pages, **upsert** vectors.                                                      | **Upsert** into `site_<siteId>`.                                          |
| `PATCH` | `/api/sites/:siteId/pages`   | JSON `{ urls: string[] }`                      | Recrawl only listed URLs, replace those pages’ chunks in the index.                                                                                       | Delete old chunks for URLs, **upsert** new chunks.                        |
| `POST`  | `/api/sites/:siteId/reindex` | JSON `{ url, userId? }`                        | Full re-crawl and replace vectors for the site.                                                                                                           | **Replace** collection content for that site (per `vectorstore` options). |
| `GET`   | `/api/sites/:siteId/sync`    | `userId` (required), `preview=true` (optional) | Without `preview`: SQLite sync **stats** only (tracked URLs, last sync). With `preview`: compute what would change (sitemap or BFS) **without** applying. | Preview does not write Chroma; stats are SQLite-centric.                  |
| `POST`  | `/api/sites/:siteId/sync`    | `userId` (required), `full=true` (optional)    | Run **smart sync**: update/remove/add chunks for changed pages; may use sitemap lastmod or full crawl if forced.                                          | **Upsert** / **delete** chunks as pages change.                           |


**Note:** `POST /api/chat` and `POST /api/chat/voice` also **query** Chroma during RAG (see next table).

---

#### HTTP + Sarvam AI (LLM, STT, TTS) — and optional OpenAI embeddings

Sarvam is invoked from the API for **text generation**, **speech-to-text**, and **text-to-speech**. OpenAI is used **only** for embeddings inside `vectorstore.ts` when configured—not as a separate public HTTP API.


| Method | Path                   | Query / body                                                               | Purpose                                                                                                                                                          | Model / service                                                                                     |
| ------ | ---------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| —      | *(internal)*           | —                                                                          | **FAQ generation** (`faq.ts`): produce FAQ JSON from retrieved snippets.                                                                                         | Sarvam chat completion.                                                                             |
| —      | *(internal)*           | —                                                                          | **FAQ answer preview** when `includeAnswers` and no stored preview: runs same RAG pipeline as chat.                                                              | Sarvam + Chroma.                                                                                    |
| `POST` | `/api/chat`            | JSON `{ siteId, message, history? }`                                       | **RAG chat:** optional SQLite FAQ match (fresh user answer) → else Chroma retrieval → Sarvam completion → **logs** query, latency, source count, answer preview. | Default chat model `sarvam-m` (override `SARVAM_CHAT_MODEL`). **SQLite:** insert into `chat_query`. |
| `POST` | `/api/chat/voice`      | `multipart/form-data`: `audio`, `siteId`, optional `history` (JSON string) | Transcribe audio with Sarvam STT, then same RAG path as text chat; **logs** turn when transcript present.                                                        | Sarvam **saaras** STT + chat model. **SQLite:** insert into `chat_query`.                           |
| `POST` | `/api/chat/tts`        | JSON `{ text }`                                                            | Convert assistant text to **base64 WAV** for the widget “listen” control.                                                                                        | Sarvam **bulbul** TTS. No SQLite write.                                                             |
| —      | *(during crawl/index)* | —                                                                          | Embedding text chunks when storing in Chroma.                                                                                                                    | **OpenAI** `text-embedding-3-small` if `OPENAI_API_KEY` set; else Chroma default embedder.          |


---

#### HTTP + external website fetch (no NavBot DB) — theme helper


| Method | Path          | Query / body                 | Purpose                                                              | Backend behavior                                                                                       |
| ------ | ------------- | ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET`  | `/api/colors` | `url` (required, http/https) | Suggest a color palette for the widget from the customer’s page CSS. | Server **fetches** the URL (and linked stylesheets via `@repo/color-extractor`); no SQLite/Chroma/LLM. |


---

#### Auth server — HTTP (SQLite for identities only)

The auth app does **not** expose the same `/api/sites` or `/api/chat` routes. All routes are handled by **better-auth** under the mount `/api/auth/`*.


| Pattern                            | Purpose                                            | Persistence                          |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------ |
| `POST /api/auth/sign-up/email`     | Register with email and password.                  | Inserts into `user`, `account`, etc. |
| `POST /api/auth/sign-in/email`     | Email/password login.                              | Session in `session`.                |
| `POST /api/auth/sign-in/social`    | Start OAuth (Google/GitHub when env vars are set). | Redirect flow; tokens in `account`.  |
| `GET /api/auth/callback/:provider` | OAuth callback.                                    | Updates OAuth-linked `account` rows. |
| `GET /api/auth/get-session`        | Return current session / user for the SPA.         | Reads `session` + `user`.            |
| `POST /api/auth/sign-out`          | End session.                                       | Deletes or invalidates session row.  |


**CORS:** NavBot API uses wide CORS (`*`) today for embedded widgets—**tighten in production** (allowlist your dashboard origin and, if needed, known embed origins). Auth server uses `CORS_ORIGIN` (default `http://localhost:5173`) with credentials.

**Auth implementation:** `apps/server/src/auth.ts` configures better-auth (SQLite, email/password, optional Google/GitHub). `apps/server/src/index.ts` mounts `toNodeHandler(auth)` on `/api/auth/`*. The web app uses `apps/web/src/lib/auth-client.ts` with `VITE_AUTH_URL`.

### Web application (Vite + React)

- **Marketing** and **dashboard** pages under `apps/web/src`.
- Talks to **auth** for session and to **API** for sites, analytics, themes, integration snippets (`VITE_API_URL`).

### Chat widget (React → IIFE bundle)

- **Package:** `packages/chat-widget`.
- **Build output:** `chat-widget.iife.js` (and other formats) consumed via `VITE_WIDGET_SCRIPT_URL` or static hosting.
- **Config:** `window.NAVBOT_CONFIG = { apiBase, siteId, theme? }`.
- **Calls:** FAQ fetch, ping, widget theme, `POST /api/chat`, `POST /api/chat/voice`, `POST /api/chat/tts`.

### Other notable libraries


| Library                  | Role                                                       |
| ------------------------ | ---------------------------------------------------------- |
| **Cheerio / domhandler** | HTML parsing and structured text extraction in the crawler |
| **node-fetch**           | Fetching pages during crawl                                |
| **multer**               | Multipart audio for voice endpoint                         |
| **node-cron**            | Scheduled / background sync hooks (`auto-sync`)            |
| **swagger-ui-express**   | Serves OpenAPI spec as `/api-docs`                         |


---

## 4. How the project is structured

```text
NavBot/
├── apps/
│   ├── api/                 # Express API: crawl, RAG, Chroma, SQLite app data, OpenAPI
│   │   └── src/
│   │       ├── index.ts           # App entry, routers, Swagger
│   │       ├── routes/            # sites, chat, sync, colors
│   │       ├── services/          # crawler, vectorstore, rag, db, faq, sitemap, auto-sync, …
│   │       └── openapi/           # OpenAPI spec for /api-docs
│   ├── server/              # Express + better-auth (sessions, OAuth)
│   │   └── src/
│   │       ├── index.ts           # Auth routes + shared DB bootstrap
│   │       └── auth.ts            # better-auth configuration
│   └── web/                 # Vite + React dashboard and marketing site
│       └── src/
│           ├── pages/             # Dashboard, scraping flow, billing, etc.
│           ├── components/        # UI pieces (integration, theme picker, …)
│           └── lib/               # auth-client, mocks, etc.
├── packages/
│   ├── chat-widget/         # Embeddable widget (Vite library build → IIFE)
│   ├── color-extractor/     # Shared helper used by API for theme/color features
│   ├── eslint-config/       # Shared ESLint config
│   └── typescript-config/   # Shared TS config
├── navbot.db                # Created at runtime: shared SQLite (gitignored in many setups)
├── package.json             # Root scripts: dev, build, lint, format
├── pnpm-workspace.yaml      # workspaces: apps/*, packages/*
└── turbo.json               # Turborepo pipeline
```

**Useful root commands**


| Command                                 | Purpose                            |
| --------------------------------------- | ---------------------------------- |
| `pnpm dev`                              | Run web + server + api in dev mode |
| `pnpm build`                            | Turbo build across packages        |
| `pnpm --filter api build`               | Compile API only                   |
| `pnpm --filter web build`               | Typecheck + Vite build web app     |
| `pnpm --filter @repo/chat-widget build` | Build embeddable widget assets     |


---

## 5. Security and production notes (brief)

- Treat `SARVAM_API_KEY`, **Chroma**, and **OAuth** secrets as production secrets (env or secret manager).
- Restrict **API CORS** and validate **site ownership** on sensitive routes in production (the dashboard currently passes `userId` query params—harden with session-derived identity on the server).
- Serve the **widget** over **HTTPS**; set `apiBase` to your public API URL.
- **SQLite** on a single file suits one VM or container with persistent disk; for horizontal scale or managed ops, plan a move to **Postgres** (and optionally managed vector search).

---

## 6. Project videos

- [NavBot](https://www.youtube.com/watch?v=dQ3EHuyKFAg)
- [Implementation](https://www.youtube.com/watch?v=900uS6Zjiw0)

