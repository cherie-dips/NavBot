# NavBot

NavBot is a **website-grounded AI assistant** for organizations that want visitors to get accurate answers from their own pages—not from the open web. Owners connect a site, NavBot crawls and indexes the content, and a small **embeddable chat widget** answers questions using **retrieval-augmented generation (RAG)** with support for **text and voice**.

This repository is a **pnpm + Turborepo 2** monorepo: a marketing and dashboard web app, a dedicated auth service, a Node API for crawling and chat, and a standalone widget bundle customers paste into their HTML. Application data and identities live in **PostgreSQL** (`DATABASE_URL`); vectors live in **Pinecone**.

---

## 1. What is NavBot

### Problem

Visitors often struggle to find concrete information (deadlines, fees, program details) when it is spread across many pages, PDFs, or long navigation trees. Generic chatbots either hallucinate or require manual FAQ authoring.

### What NavBot does

- **Crawls** a website (same hostname), extracts readable text (including structured content such as tables), and **chunks** it for search.
- **Stores** embeddings in **Pinecone** (one index, per-site namespaces) so questions can be matched **semantically** to the right passages.
- **Answers** using **Google Gemini** only from retrieved context, with **sources** (URLs) attached to the response (agentic retrieval, optional LLM judge, and code execution for math when relevant).
- **Widgets** can be dropped on any page via a **script tag**; the dashboard generates the snippet and theme configuration.
- **Dashboard** features include site management, integration instructions, analytics-style views (volume, top queries, recent turns), **generated FAQs** with optional admin-edited answers that influence live replies when still “fresh” relative to indexing.

### Who it is for

- **Site owners** (universities, programs, product sites) who want a low-friction Q&A layer on top of existing content.
- **Customer teams** (web, marketing, or operations) who configure sites, themes, and FAQs in the dashboard and paste the embed snippet into their HTML.
- **Engineers** self-hosting the stack or wiring the widget next to an existing site without changing their primary backend.

---

## 2. Customer onboarding

NavBot is built so **your team** can go from account creation to a live assistant **without cloning this repository**. If you use a **hosted** NavBot product, you only need the web dashboard and the integration snippet your administrator provides.

### Steps in the dashboard

1. **Sign up or sign in** — Use email and password, or **Google** / **GitHub** when your deployment has OAuth configured.
2. **Add your website** — Enter the **root URL** of the property you want indexed (same hostname; the crawler expands from that entry point). Wait until crawling and indexing finish; the UI shows progress.
3. **Optional: polish the experience** — Adjust the **widget theme** (colors, fonts, opacity), review **generated FAQs**, and optionally **edit FAQ answers** so approved text is preferred when it is still fresh relative to your latest index.
4. **Install the snippet** — Open **Integration** for your site, copy the embed code (`window.NAVBOT_CONFIG` plus the widget script URL), and paste it into your site’s HTML (commonly just before `</body>`). Serve your site over **HTTPS** in production.
5. **Smoke-test** — Visit a page where the snippet is present, open the chat control, and ask questions that should be answered from **your** pages. Try **voice** if you plan to offer it; answers should include **source links** to the URLs that grounded the reply.

### What visitors get

- **Grounded answers** — Replies use **retrieval-augmented generation** from your indexed pages, with **citations**, not generic web knowledge.
- **Text and voice** — Type a question or use the microphone where voice is enabled; both paths share the same RAG pipeline.
- **Freshness** — When the widget loads, it calls a lightweight **ping** endpoint so NavBot can kick off **background** sitemap sync work without blocking the UI.

---

### Self-hosting and local development

Use this subsection if you **run your own** NavBot stack or contribute to the monorepo. For a cloud blueprint, see `**render.yaml`** at the repo root (PostgreSQL + three services: auth, API, static web) and its inline post-deploy checklist.

#### Prerequisites

- **Node.js** 20 (matches `render.yaml` and typical production images)
- **pnpm** — pinned to `**pnpm@8.15.6`** via `packageManager` in the root `package.json`
- **PostgreSQL** — one database **shared** by `apps/server` (Better Auth) and `apps/api` (application tables), both using `**DATABASE_URL`**
- A **Pinecone** account and **serverless dense index** (cosine metric; dimension must match the embedding model, default **1024** for `llama-text-embed-v2`)
- **Google API key** (`GOOGLE_API_KEY` or `GEMINI_API_KEY`) for Gemini LLM, STT, and TTS (vectors use **Pinecone Inference**, not Gemini)

#### Clone and install

```bash
git clone <your-fork-or-remote-url>
cd NavBot
pnpm install
```

#### Environment variables

Configure each app you run. Typical local development:


| App                             | File                  | Variables (summary)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth server** (`apps/server`) | `.env`                | `**DATABASE_URL`** (Postgres). `**BETTER_AUTH_URL`** or `**BETTER_AUTH_BASE_URL**` (public origin of this service only, e.g. `http://localhost:3000`). `**BETTER_AUTH_SECRET**` (required in production; dev can use a long placeholder). `**CORS_ORIGIN**` (comma-separated dashboard origins, e.g. `http://localhost:5173`). Optional `**WEB_APP_ORIGIN**` for OAuth error redirects. Optional `**GOOGLE_CLIENT_***`, `**GITHUB_CLIENT_***` for social login.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **API** (`apps/api`)            | `.env`                | `**DATABASE_URL`** (same Postgres as auth). `**PINECONE_API_KEY`**, `**PINECONE_INDEX**`. Optional: `PINECONE_EMBEDDING_MODEL` (default `llama-text-embed-v2`), `PINECONE_EMBEDDING_DIMENSION` (default `1024`, must match index for vector upserts). `**PINECONE_UPSERT_MODE**`: omit or `auto` (default) — NavBot calls Pinecone `describeIndex` and picks `records` (integrated embedding indexes) vs `vectors` (plain dense). Set `records` or `vectors` to override. `**PINECONE_EMBED_TEXT_FIELD**`: optional override; with `auto`, taken from index `fieldMap` when present (fallback `chunk_text`). `**GOOGLE_API_KEY**` (or `GEMINI_API_KEY`). Optional: `GEMINI_CHAT_MODEL`, `GEMINI_PLANNER_MODEL`, `GEMINI_STT_MODEL` (defaults to the chat model), `GEMINI_TTS_MODEL` (defaults to `gemini-3.1-flash-tts-preview` — must be a TTS-capable model), `GEMINI_TTS_VOICE`. **Reasoning & live search:** `NAVBOT_REASONING` — `on` (default) runs the two-pass analyst→editor path on judgement questions, `off` restores the single call. `NAVBOT_WEB_MODE` — `analytical` (default) searches the live site for judgement questions and for anything the index answered weakly, `weak` only for weak retrieval, `always` every turn, `off` never. `NAVBOT_WEB_PROVIDER` — `auto` (default) prefers Gemini's Google Search grounding and falls back to Serper on quota failure, `grounding` or `serper` pin one, `off` disables. Grounding needs a paid-tier `GEMINI_API_KEY`; Serper needs `SERPER_API_KEY`. **SPAs / React:** `NAVBOT_BROWSER_CRAWL`=`auto` (default). |
| **Web** (`apps/web`)            | `.env` / `.env.local` | `VITE_AUTH_URL`, `VITE_API_URL`, `VITE_WIDGET_SCRIPT_URL` (URL where `chat-widget.iife.js` is served in dev/prod)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |


#### Run the stack (development)

From the repository root:

```bash
pnpm dev
```

This runs **Turborepo** `dev` for **web** (Vite), **server** (auth), and **api** (Express) in parallel. The web task depends on a **chat-widget** build so the widget assets exist before Vite serves the app.

- **Web dashboard & marketing:** `http://localhost:5173` (typical Vite port)
- **Auth (better-auth):** `http://localhost:3000`
- **API:** `http://localhost:3001`
- **API docs (Swagger UI):** `http://localhost:3001/api-docs`

Build the **chat widget** alone when you need a fresh `dist` or a static URL for `VITE_WIDGET_SCRIPT_URL`:

```bash
pnpm --filter @repo/chat-widget build
# Serve packages/chat-widget/dist/chat-widget.iife.js from your static host or CDN
```

---

## 3. How APIs, services, and databases work?

### Architecture

**Clients:** The **web app** (dashboard and marketing) runs in the browser and talks to two backends: the **auth server** for sign-in and sessions, and the **NavBot API** for everything related to sites, crawling, chat, and analytics. The **chat widget** is a separate JavaScript bundle embedded on customer websites; it only talks to the **NavBot API** using `apiBase` and `siteId` from `window.NAVBOT_CONFIG`.

**Auth server (`apps/server`):** Implements **better-auth** on the **same PostgreSQL database** as the API (`DATABASE_URL`). It issues and validates sessions for the web app and runs Better Auth **migrations** on startup. User identifiers from auth are passed to the API (often as `userId` query parameters from the dashboard) to scope site lists, themes, sync, and analytics.

**NavBot API (**`apps/api`**):** Single Express application that orchestrates **crawling**, **reads and writes application tables** in PostgreSQL, **queries and updates** vectors in **Pinecone** (namespace `site_<siteId>` per site) using **Pinecone Inference** embeddings (default `**llama-text-embed-v2`**), and calls **Google Gemini** for LLM chat, speech-to-text, and text-to-speech. The browser never calls these APIs directly.

**Data flow for a typical chat:** Widget sends `POST /api/chat` with `siteId` and `message`. The API may return an admin-approved FAQ answer from Postgres if it matches the question and is not stale; otherwise it runs **agentic retrieval** (planner + optional refiner), **retrieves chunks** from the site’s Pinecone namespace, builds context, calls **Gemini** for a completion (with optional **code execution** for math), runs an optional **LLM judge** pass, formats the answer (including sources), and **logs** a row to `chat_query` in PostgreSQL.

**Background freshness:** `GET /api/sites/:siteId/ping` (used when the widget loads) triggers **non-blocking** sitemap sync work so indexed content can stay aligned with the live site without blocking the UI.

---

### PostgreSQL (`DATABASE_URL`)

**One shared database** (connection string in `**DATABASE_URL`**) used by:

- `**apps/server`** — Better Auth **identity** tables (`user`, `session`, `account`, `verification`, …) via the Better Auth **PostgreSQL** adapter; migrations run on server startup.
- `**apps/api`** — **Application** tables via `pg` (`apps/api/src/services/db.ts`); `initAppDatabase()` creates core tables if they do not exist.

**Important:** Point **both** services at the **same** Postgres instance (or at least the same logical database) so user IDs from auth line up with `site.user_id` and related rows.

**Main application tables (API side)** include:


| Area         | Tables (conceptual) | Role                                                                                                     |
| ------------ | ------------------- | -------------------------------------------------------------------------------------------------------- |
| Sites        | `site`              | Per-user site registration: `site_id`, `user_id`, URL, hostname, `pages_indexed`, theme JSON, timestamps |
| Crawl / sync | `page_lastmod`      | Per-URL tracking: content hash, `indexed_at`, optional sitemap `lastmod` for auto-sync                   |
| FAQs         | `faq`               | Generated FAQ rows per site; optional `answer_preview`, `user_answer`, timestamps for dashboard edits    |
| Analytics    | `chat_query`        | Logged turns: query, channel, answer preview, latency, source count                                      |


**How it is used:** The API reads and writes sites and analytics; the auth server authenticates users; user IDs from auth tie dashboard requests (for example `?userId=`) to rows in `site`.

### Pinecone (vector store)

**Purpose:** Semantic retrieval for RAG.

- **Client:** `@pinecone-database/pinecone` (`apps/api/src/services/vectorstore.ts`).
- **Index:** One **dense** serverless index (name from `**PINECONE_INDEX`**), cosine metric, dimension matching `**PINECONE_EMBEDDING_DIMENSION`** (default **1024** for `**llama-text-embed-v2`**).

**Namespaces:** One per site, named `site_` + `siteId` (same isolation idea as the old per-site Chroma collections).

**Embeddings:** Default (`**PINECONE_UPSERT_MODE` unset or `auto`**) uses `**describeIndex`**: integrated indexes (with `embed` in the API response) use `**upsertRecords**`; others use **Inference + vector upsert**. **Reindex** all sites after changing model or index settings.

**Console “no records”:** Vectors are stored under namespace `**site_<siteId>`** (usually `site_` + hostname, e.g. `site_www.example.com`). In the index **Browser**, open the **namespace** selector and choose that name—not the empty/default namespace.

**Pipeline:**

1. **Upsert:** Crawled pages → chunking (~900 characters, overlap) → either Pinecone `**upsertRecords`** (integrated index) or Inference embed + `**upsert`** with metadata (`siteId`, `url`, `title`, chunk indices, and passage text for RAG).
2. **Query:** User message → **agentic retrieval** (rule expansion + Gemini planner / refiner) → embed queries → vector search → top-K chunks → dedupe by URL → context string for the LLM.

### Google Gemini (LLM + voice)

**Purpose:** Answer generation, speech, and optional reasoning tools.

- **Chat** for RAG answers (`apps/api/src/services/rag.ts`); **agentic retrieval** (`agentic-retrieval.ts`); optional **LLM judge**; optional **code execution** for math.
- **Speech-to-text** (multimodal `generateContent` on audio) and **native TTS** (`apps/api/src/routes/chat.ts`).

**Configuration:** `GEMINI_API_KEY` (or `GOOGLE_API_KEY`); model overrides via `GEMINI_*_MODEL` env vars. Note the `gemini-2.5-*` family now returns 404 for new API keys — set `GEMINI_CHAT_MODEL` to a current model such as `gemini-3.5-flash`.

**Behavior (summary):** Retrieve context from Pinecone → grounded system prompt → Gemini completion → optional judge → return answer and source list. FAQ **user overrides** can short-circuit RAG when the saved answer is not considered stale vs. latest indexing (see `getFaqUserAnswerForQuestion` / `rag.ts`).

### Endpoint reference (by layer)

Base URL for the NavBot API is typically `http://localhost:3001` in development. Interactive docs: `**GET /api-docs`** (Swagger UI). The **auth app** is separate on port **3000** under `/api/auth/`*.

---

#### HTTP + PostgreSQL — sites, themes, analytics, FAQs, logging

These routes persist or read **application state** in PostgreSQL (and may trigger work that also touches Pinecone—see the next sections).


| Method   | Path                               | Query / body                              | Purpose                                                                                                                                           | Postgres (primary)                                                                              |
| -------- | ---------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET`    | `/api/sites`                       | `userId` (required)                       | List all sites registered to that user (dashboard navbar, website list).                                                                          | Reads `site`.                                                                                   |
| `GET`    | `/api/sites/dashboard-stats`       | `userId` (required), `siteId` (optional)  | Aggregated analytics: totals, 7-day volume, top queries, recent turns, context counts. Omit `siteId` to aggregate across all of the user’s sites. | Reads `chat_query`, `site`, `faq` counts. Returns `403` if `siteId` is not owned by user.       |
| `DELETE` | `/api/sites/:siteId`               | `userId` (required)                       | Removes the user’s row for that site; if no users remain for `siteId`, may purge Pinecone namespace and derived data.                             | Deletes/updates `site`, `faq`, `chat_query`, `page_lastmod` as implemented in `db.ts` / routes. |
| `GET`    | `/api/sites/:siteId/theme`         | `userId` (required)                       | Load saved widget theme for the integration panel.                                                                                                | Reads `site.widget_theme`.                                                                      |
| `PUT`    | `/api/sites/:siteId/theme`         | `userId` (required), JSON **WidgetTheme** | Save widget colors, fonts, opacity, etc.                                                                                                          | Updates `site.widget_theme`.                                                                    |
| `GET`    | `/api/sites/:siteId/widget-config` | —                                         | **Public** (no `userId`): returns `siteId` + theme JSON for the embeddable widget on customer pages.                                              | Reads `site.widget_theme` (first matching `site_id`).                                           |
| `GET`    | `/api/sites/:siteId/faqs`          | `includeAnswers=1` or `true` (optional)   | Returns FAQ list; generates and stores FAQs if empty. With `includeAnswers`, includes generated/admin answers and metadata for dashboard.         | Reads/writes `faq`; may invoke Gemini (see table below).                                        |
| `POST`   | `/api/sites/:siteId/faqs/refresh`  | —                                         | Regenerates FAQ questions (and answers per current implementation).                                                                               | Replaces `faq` rows for site.                                                                   |
| `PATCH`  | `/api/sites/:siteId/faqs/:faqId`   | JSON `{ "answer": "..." }`                | Save **user-edited** canonical answer for that FAQ (dashboard feedback).                                                                          | Updates `faq.user_answer`, `user_answer_updated_at`.                                            |
| `GET`    | `/api/sites/:siteId/ping`          | —                                         | Quick `ok` response; kicks off **background** sitemap sync (fire-and-forget).                                                                     | Minimal direct SQL; sync updates `page_lastmod` and related state indirectly.                   |


---

#### HTTP + Pinecone — vector index (embeddings and semantic search)

Indexing and sync routes **write** chunks and embeddings to the Pinecone namespace `site_<siteId>`. Chat **reads** that namespace during RAG unless an FAQ override applies.


| Method  | Path                         | Query / body                                   | Purpose                                                                                                                                            | Pinecone                                                                 |
| ------- | ---------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `POST`  | `/api/sites`                 | JSON `{ url, userId?, siteId? }`               | First-time or reuse: crawl site (or attach user to existing index), chunk pages, **upsert** vectors.                                               | **Upsert** into namespace `site_<siteId>`.                               |
| `PATCH` | `/api/sites/:siteId/pages`   | JSON `{ urls: string[] }`                      | Recrawl only listed URLs, replace those pages’ chunks in the index.                                                                                | Delete old chunks for URLs, **upsert** new chunks.                       |
| `POST`  | `/api/sites/:siteId/reindex` | JSON `{ url, userId? }`                        | Full re-crawl and replace vectors for the site.                                                                                                    | **Replace** namespace content for that site (per `vectorstore` options). |
| `GET`   | `/api/sites/:siteId/sync`    | `userId` (required), `preview=true` (optional) | Without `preview`: sync **stats** only (tracked URLs, last sync). With `preview`: compute what would change (sitemap or BFS) **without** applying. | Preview does not write Pinecone; stats read from Postgres.               |
| `POST`  | `/api/sites/:siteId/sync`    | `userId` (required), `full=true` (optional)    | Run **smart sync**: update/remove/add chunks for changed pages; may use sitemap lastmod or full crawl if forced.                                   | **Upsert** / **delete** chunks as pages change.                          |


**Note:** `POST /api/chat` and `POST /api/chat/voice` also **query** Pinecone during RAG (see next table).

---

#### HTTP + Google Gemini (LLM, STT, TTS)

The API calls **Gemini** for **text generation**, **speech-to-text**, and **text-to-speech**. **Embeddings** for retrieval are generated by **Pinecone Inference**, not Gemini.


| Method | Path                   | Query / body                                                               | Purpose                                                                                                                                                                                                        | Model / service                                                                            |
| ------ | ---------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| —      | *(internal)*           | —                                                                          | **FAQ generation** (`faq.ts`): produce FAQ JSON from retrieved snippets.                                                                                                                                       | Gemini chat (default `gemini-2.5-flash`).                                                  |
| —      | *(internal)*           | —                                                                          | **FAQ answer preview** when `includeAnswers` and no stored preview: runs same RAG pipeline as chat.                                                                                                            | Gemini + Pinecone.                                                                         |
| `POST` | `/api/chat`            | JSON `{ siteId, message, history? }`                                       | **RAG chat:** optional Postgres FAQ match (fresh user answer) → else agentic Pinecone retrieval → Gemini completion (optional code execution + judge) → **logs** query, latency, source count, answer preview. | Default `GEMINI_CHAT_MODEL`. **Postgres:** insert into `chat_query`. |
| `POST` | `/api/chat/voice`      | `multipart/form-data`: `audio`, `siteId`, optional `history` (JSON string) | Transcribe audio with Gemini multimodal STT, then same RAG path as text chat; **logs** turn when transcript present.                                                                                           | Default `GEMINI_STT_MODEL`, else the chat model. **Postgres:** insert into `chat_query`.  |
| `POST` | `/api/chat/tts`        | JSON `{ text }`                                                            | Convert assistant text to **base64 WAV** for the widget “listen” control.                                                                                                                                      | Gemini native TTS (default `gemini-2.5-flash-preview-tts`). No database write.             |
| —      | *(during crawl/index)* | —                                                                          | Embedding text chunks when storing in Pinecone.                                                                                                                                                                | **Pinecone Inference** (`PINECONE_EMBEDDING_MODEL`, default `llama-text-embed-v2`).        |


---

#### HTTP + external website fetch (no NavBot DB) — theme helper


| Method | Path          | Query / body                 | Purpose                                                              | Backend behavior                                                                                           |
| ------ | ------------- | ---------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/colors` | `url` (required, http/https) | Suggest a color palette for the widget from the customer’s page CSS. | Server **fetches** the URL (and linked stylesheets via `@repo/color-extractor`); no Postgres/Pinecone/LLM. |


---

#### Auth server — HTTP (PostgreSQL for identities)

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

**Auth implementation:** `apps/server/src/auth.ts` configures better-auth (**PostgreSQL**, email/password, optional Google/GitHub). `apps/server/src/index.ts` mounts `toNodeHandler(auth)` on `/api/auth/`*. The web app uses `apps/web/src/lib/auth-client.ts` with `VITE_AUTH_URL`.

### Web application (Vite + React)

- **Marketing** and **dashboard** pages under `apps/web/src`.
- Talks to **auth** for session and to **API** for sites, analytics, themes, integration snippets (`VITE_API_URL`).

### Chat widget (React → IIFE bundle)

- **Package:** `packages/chat-widget`.
- **Build output:** `chat-widget.iife.js` (and other formats) consumed via `VITE_WIDGET_SCRIPT_URL` or static hosting.
- **Config:** `window.NAVBOT_CONFIG = { apiBase, siteId, theme? }`.
- **Calls:** FAQ fetch, ping, widget theme, `POST /api/chat`, `POST /api/chat/voice`, `POST /api/chat/tts`.

### Other notable libraries


| Library                         | Role                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| **Cheerio / domhandler**        | HTML parsing and structured text extraction in the crawler   |
| **node-fetch**                  | Fetching pages during crawl                                  |
| **multer**                      | Multipart audio for voice endpoint                           |
| **@pinecone-database/pinecone** | Vector index + Pinecone Inference embeddings (`vectorstore`) |
| **node-cron**                   | Scheduled / background sync hooks (`auto-sync`)              |
| **swagger-ui-express**          | Serves OpenAPI spec as `/api-docs`                           |


---

## 4. How the project is structured

```text
NavBot/
├── apps/
│   ├── api/                 # Express API: crawl, RAG, Pinecone, Postgres app data, OpenAPI
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
├── render.yaml              # Render Blueprint: Postgres + auth, API, static web (see file for env checklist)
├── package.json             # Root scripts: dev, build, lint, format; pins pnpm@8.15.6
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

- Treat `GOOGLE_API_KEY` / `GEMINI_API_KEY`, `PINECONE_API_KEY`, and OAuth client secrets as production secrets (environment variables or a secret manager).
- Restrict **API CORS** and validate **site ownership** on sensitive routes in production (the dashboard currently passes `userId` query params—harden with session-derived identity on the server).
- Serve the **widget** over **HTTPS**; set `apiBase` to your public API URL.
- **PostgreSQL:** use managed Postgres for production (backups, upgrades, connection limits). The API and auth services both open pools against `DATABASE_URL`; size instances and `max` pool settings for your traffic.

---

## 6. Project videos

- [NavBot](https://www.youtube.com/watch?v=dQ3EHuyKFAg)
- [Implementation](https://www.youtube.com/watch?v=900uS6Zjiw0)

