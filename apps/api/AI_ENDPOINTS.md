# NavBot AI Endpoints

## Overview

NavBot uses 5 AI-powered services across 3 providers:

| Provider | Model | Purpose |
|----------|-------|---------|
| Sarvam AI | `sarvam-m` | Chat completion (RAG answers + FAQ generation) |
| Sarvam AI | `saaras:v3` | Speech-to-text transcription |
| Sarvam AI | `bulbul:v3` | Text-to-speech synthesis |
| OpenAI | `text-embedding-3-small` | Vector embeddings for semantic search |
| Serper.dev | Google Search API | Social media post discovery |

---

## 1. POST /api/chat — RAG Text Chat

**File:** `src/routes/chat.ts` (lines 11-44)
**Core logic:** `src/services/rag.ts` — `answerQuestionWithRag()` (lines 195-305)

### Implementation

```
User question
    |
    v
Query Expansion (rag.ts:52-62)
    - Regex rules detect domain keywords (deadlines, fees, eligibility, programs, contact)
    - Prepends related terms to boost retrieval coverage
    |
    v
Parallel Retrieval
    |--- ChromaDB semantic search (vectorstore.ts:327-379)
    |      - OpenAI text-embedding-3-small embeds the query
    |      - Cosine similarity search, top 8 chunks per expanded query
    |      - Chunks are 900 chars with 180 char overlap, paragraph-aware
    |
    |--- Social media search (social-search.ts:126-165) [if intent detected]
    |      - Regex checks for: event, fest, placement, hackathon, news, etc.
    |      - Serper.dev Google Search scoped to site:instagram.com, site:twitter.com, etc.
    |      - 4-hour in-memory cache, max 500 entries
    |
    v
Context Building (rag.ts:237-261)
    - Website chunks formatted with title + URL
    - Social posts appended as supplementary context
    |
    v
LLM Call — Sarvam AI (rag.ts:273-280)
    - Model: sarvam-m
    - Temperature: 0.2
    - Max tokens: 600
    - System prompt with 9 rules (answer from context, cite dates, no fluff, etc.)
    - Last 6 history turns, strict user/assistant alternation enforced
    - Retry: 3 attempts, 800ms exponential backoff on 500/503/rate_limit/timeout
    |
    v
Post-processing (rag.ts:282-299)
    - Strips <think> tags from model output
    - Converts markdown links to plain text
    - Deduplicates sources by URL
    - Appends social media URLs as sources
    - Formats "Source: url1 | url2" footer (only sources with distance < 0.45)
```

### Sample Input/Output

**Input:**
```json
{
  "siteId": "iitd.ac.in",
  "message": "What is the application deadline for MTech?",
  "history": []
}
```

**Expected Output:**
```json
{
  "answer": "The application deadline for MTech programs at IIT Delhi is typically in April for the autumn semester. Round 1 applications close on April 15, 2026, and Round 2 closes on June 30, 2026.\n\nSource: https://iitd.ac.in/admissions",
  "sources": [
    { "url": "https://iitd.ac.in/admissions", "title": "MTech Admissions - IIT Delhi", "distance": 0.18 },
    { "url": "https://iitd.ac.in/deadlines", "title": "Important Dates", "distance": 0.24 }
  ]
}
```

### Eval Benchmark Pairs

| # | Input message | Expected behavior | Eval criteria |
|---|--------------|-------------------|---------------|
| 1 | "What is the application deadline for MTech?" | Mentions specific dates from the indexed site | Accuracy, specificity |
| 2 | "What programs do you offer?" | Lists programs found in indexed content | Completeness |
| 3 | "How much is the tuition fee?" | Cites fee amounts from site content | Accuracy |
| 4 | "Hi there!" | Natural greeting response, no sources cited | Conversational appropriateness |
| 5 | "What's the campus address?" | Returns contact/address/location info | Relevance |
| 6 | "Tell me about placements" (with history) | Placement stats from site, possibly social results | Multi-turn coherence |
| 7 | "What is the meaning of life?" | Says "I don't have that information" | Out-of-scope guardrail |
| 8 | "Any upcoming events or fests?" | Triggers social search, includes social media URLs | Social intent detection |
| 9 | "What are the eligibility criteria for MBA?" | Returns GPA/GMAT/GRE requirements | Query expansion (eligibility rule) |
| 10 | "How can I contact the admissions office?" | Returns email, phone, office hours | Query expansion (contact rule) |

---

## 2. POST /api/chat/voice — Voice Chat (STT + RAG)

**File:** `src/routes/chat.ts` (lines 76-129)
**Core logic:** `src/services/rag.ts` — `transcribeAndAnswer()` (lines 359-397)

### Implementation

```
Audio file (multipart/form-data, max 10MB)
    |
    v
Multer upload (chat.ts:50-53)
    - Accepts: webm, mp3, wav, ogg, mp4
    - Stored in memory buffer
    |
    v
Sarvam STT — saaras:v3 (rag.ts:310-354)
    - Constructs File object from buffer with correct MIME type
    - Calls sarvam.speechToText.transcribe()
    - Mode: "transcribe"
    - Returns: { transcript, language_code }
    - Retry: 3 attempts on transient errors
    - Throws if transcript is empty
    |
    v
RAG Pipeline (same as POST /api/chat)
    - Transcript becomes the "message" input
    |
    v
Response includes transcript + answer + sources
    - On STT failure: returns friendly error message suggesting text input
```

### Sample Input/Output

**Input:**
```
POST /api/chat/voice
Content-Type: multipart/form-data

audio: <recording.webm>  (user says: "What courses do you offer?")
siteId: "iitd.ac.in"
history: "[]"
```

**Expected Output:**
```json
{
  "transcript": "What courses do you offer?",
  "answer": "IIT Delhi offers BTech, MTech, MBA, MSc, and PhD programs across departments including Computer Science, Electrical Engineering, and Mechanical Engineering.",
  "sources": [
    { "url": "https://iitd.ac.in/programs", "title": "Academic Programs" }
  ]
}
```

### Eval Benchmark Pairs

| # | Audio content | Expected behavior | Eval criteria |
|---|-------------|-------------------|---------------|
| 1 | "What courses do you offer?" (clear English) | Accurate transcript + relevant answer | Transcription accuracy, answer relevance |
| 2 | "Tell me the fee structure" (clear English) | Correct transcript, fee info in answer | STT + RAG accuracy |
| 3 | Noisy/unclear recording | Graceful error or best-effort transcript | Error handling |
| 4 | Hindi-accented English | Correct transcript (Sarvam handles Indian English well) | Accent robustness |
| 5 | Very short audio (< 1 second) | Empty transcript error handled gracefully | Edge case handling |
| 6 | "Are there any upcoming hackathons?" | Correct transcript + social intent triggered | STT + social search |

---

## 3. POST /api/chat/tts — Text-to-Speech

**File:** `src/routes/chat.ts` (lines 58-70)
**Core logic:** `src/services/rag.ts` — `synthesizeSpeech()` (lines 406-427)

### Implementation

```
Text input (JSON body)
    |
    v
Truncation (rag.ts:407)
    - Max 1000 characters, appends "..." if truncated
    |
    v
Sarvam TTS — bulbul:v3 (rag.ts:411-417)
    - Target language: en-IN (Indian English)
    - Returns base64-encoded WAV audio
    - Retry: 3 attempts on transient errors
    - Throws if audio is empty
    |
    v
Response: { audio: "<base64 WAV string>" }
```

### Sample Input/Output

**Input:**
```json
{
  "text": "Welcome to our admissions page. The deadline for Round 1 is February 15, 2026."
}
```

**Expected Output:**
```json
{
  "audio": "UklGRiQAAABXQVZFZm10IBAAAA... (base64-encoded WAV)"
}
```

### Eval Benchmark Pairs

| # | Input text | Expected behavior | Eval criteria |
|---|-----------|-------------------|---------------|
| 1 | "Welcome to our admissions page." | Non-empty base64 audio, decodable to valid WAV | Audio validity |
| 2 | "The deadline for Round 1 applications is February 15, 2026." | Clear speech, correct date pronunciation | Pronunciation accuracy |
| 3 | "" (empty string) | 400 error: "text is required" | Input validation |
| 4 | 1500-character string | Truncated to 1000 chars, still produces audio | Truncation handling |
| 5 | "The fee is Rs. 2,50,000 per semester." | Correct pronunciation of currency and numbers | Number/currency handling |
| 6 | "Contact us at admissions@iitd.ac.in" | Intelligible email address pronunciation | Special format handling |

---

## 4. GET /api/sites/{siteId}/faqs — AI-Generated FAQs

**File:** `src/routes/sites.ts` (lines 243-254)
**Core logic:** `src/services/faq.ts` — `generateFaqsForSite()` (lines 24-92)

### Implementation

```
GET /api/sites/:siteId/faqs?includeAnswers=true
    |
    v
Check DB for existing FAQs (faq.ts:129-130)
    |--- If FAQs exist and no answers needed: return from DB
    |--- If FAQs exist and answers needed: generate answer previews via RAG
    |--- If no FAQs: generate new ones
    |
    v
FAQ Generation (faq.ts:24-92)
    |
    |--- Seed query retrieval (faq.ts:26)
    |      - 8 seed queries: admissions deadlines, programs offered, fee structure,
    |        how to apply, campus facilities, contact info, scholarships, placements
    |      - Retrieves top 6 chunks per query from ChromaDB
    |
    |--- Popular query incorporation (faq.ts:38-42)
    |      - Fetches top 10 user queries from chat_query logs
    |      - If >= 3 popular queries exist, adds them to the prompt
    |
    |--- LLM call — Sarvam AI (faq.ts:60-68)
    |      - Model: sarvam-m, temperature: 0.3, max_tokens: 500
    |      - System prompt: "You output only valid JSON arrays"
    |      - Requests 4-6 FAQs with "label" and "question" keys
    |
    |--- JSON extraction (faq.ts:70-87)
    |      - Strips <think> tags
    |      - Extracts JSON array via regex (handles markdown fences)
    |      - Validates each item has string label + question
    |      - Caps at 6 FAQs
    |
    |--- Fallback (faq.ts:113-119)
    |      - On any failure: returns 3 generic FAQs
    |        ("About this website", "How to get started", "Contact information")
    |
    v
Answer preview generation (if includeAnswers=true) (faq.ts:100-111)
    - Each FAQ question runs through full RAG pipeline
    - Answer truncated to 800 chars
    - Cached in DB for future requests
```

### Sample Input/Output

**Input:**
```
GET /api/sites/iitd.ac.in/faqs?includeAnswers=true
```

**Expected Output:**
```json
{
  "siteId": "iitd.ac.in",
  "faqs": [
    {
      "label": "Admission deadlines",
      "question": "What are the admission deadlines for various programs?",
      "answerPreview": "IIT Delhi has multiple admission rounds. For BTech, JEE Advanced results are typically out in June. MTech admissions via GATE open in March."
    },
    {
      "label": "Programs offered",
      "question": "What academic programs does IIT Delhi offer?",
      "answerPreview": "IIT Delhi offers BTech, MTech, MBA, MSc, and PhD programs across 25+ departments."
    },
    {
      "label": "Fee structure",
      "question": "What is the fee structure for different programs?",
      "answerPreview": "BTech tuition is approximately Rs. 2,00,000 per semester. MTech fees vary by department."
    },
    {
      "label": "Placement statistics",
      "question": "What are the recent placement statistics?",
      "answerPreview": "The 2025 placement season saw 95% placement rate with an average package of Rs. 28 LPA."
    }
  ]
}
```

### Eval Benchmark Pairs

| # | Input | Expected behavior | Eval criteria |
|---|-------|-------------------|---------------|
| 1 | `GET /faqs` for a well-indexed site | 4-6 FAQs with short labels and natural questions | Relevance, diversity |
| 2 | `GET /faqs?includeAnswers=true` | Same + `answerPreview` that actually answers the question | Answer quality |
| 3 | `POST /faqs/refresh` after many user chats | FAQs reflect popular user queries | Freshness, user-query alignment |
| 4 | `GET /faqs` for a site with no indexed content | Fallback FAQs (About, Get started, Contact) | Graceful degradation |
| 5 | `GET /faqs` for a site with only 2 pages indexed | Fewer FAQs, still relevant to available content | Content-aware generation |
| 6 | Repeated `GET /faqs` calls | Returns cached FAQs from DB (no re-generation) | Caching behavior |

---

## 5. Social Media Search (internal service)

**File:** `src/services/social-search.ts`
**Entry point:** `searchSocialMedia()` (lines 126-165)
**Called from:** `answerQuestionWithRag()` in `rag.ts` (lines 221-223)

### Implementation

```
User query (from RAG pipeline)
    |
    v
Intent Detection (social-search.ts:48-53)
    - Regex pattern matches: event, fest, festival, workshop, seminar, webinar,
      placement, recruit, hackathon, announcement, update, news, latest, upcoming,
      recent, happening, drive, talk, guest lecture, conference, cultural, sports,
      competition, club, society, activity, post, social media
    - Returns boolean — if false, social search is skipped entirely
    |
    v
Cache Check (social-search.ts:137-143)
    - Key: "siteId:query_normalized"
    - TTL: 4 hours
    - Max cache entries: 500 (evicts expired on overflow)
    |
    v
Build Platform Queries (social-search.ts:65-84)
    - Reads configured social handles from DB (getSocialHandles)
    - For each platform with a handle:
      - Instagram: site:instagram.com "handle" <query>
      - Twitter: site:twitter.com OR site:x.com "handle" <query>
      - LinkedIn: site:linkedin.com "handle" <query>
      - Facebook: site:facebook.com "handle" <query>
    |
    v
Serper.dev API (social-search.ts:89-121)
    - POST https://google.serper.dev/search
    - Returns top 5 organic results per platform
    - All platform searches run in parallel
    |
    v
Results cached and returned as:
    [{ platform, title, url, snippet }]
```

### Sample Input/Output

**Input (internal call):**
```
searchSocialMedia("iitd.ac.in", "upcoming hackathon events")
```

**Expected Output:**
```json
[
  {
    "platform": "instagram",
    "title": "IIT Delhi on Instagram: 'Register now for Tryst 2026!'",
    "url": "https://instagram.com/p/ABC123",
    "snippet": "Tryst 2026, IIT Delhi's annual tech fest, is here! Register before April 20..."
  },
  {
    "platform": "twitter",
    "title": "IIT Delhi (@iaboraiitd) - Hackathon announcement",
    "url": "https://twitter.com/iaboraiitd/status/123456",
    "snippet": "Excited to announce our annual hackathon! 48 hours of coding, mentorship..."
  }
]
```

### Eval Benchmark Pairs

| # | Input query | Social intent? | Expected behavior | Eval criteria |
|---|------------|---------------|-------------------|---------------|
| 1 | "upcoming events" | Yes | Searches all configured social platforms | Correct intent detection |
| 2 | "placement drive 2026" | Yes | Returns social posts about placements | Result relevance |
| 3 | "what is the fee structure" | No | Skips social search entirely | Correct negative |
| 4 | "latest news and updates" | Yes | Returns recent social posts | Recency of results |
| 5 | "tell me about the campus" | No | No social search triggered | Correct negative |
| 6 | "any hackathon happening?" | Yes | Returns hackathon-related posts | Keyword specificity |
| 7 | "cultural fest dates" | Yes | Returns fest/event posts | Multi-keyword detection |
| 8 | "what is the eligibility for MTech?" | No | No social search (academic query) | Correct negative |

---

## 6. OpenAI Embeddings (internal service)

**File:** `src/services/vectorstore.ts` (lines 37-42)

### Implementation

```
Text (page chunk or user query)
    |
    v
OpenAI Embedding Function (vectorstore.ts:37-42)
    - Model: text-embedding-3-small
    - Falls back to ChromaDB default embedding if OPENAI_API_KEY is absent
    |
    v
ChromaDB Storage / Retrieval
    - Collection per site: "site_{siteId}"
    - Similarity metric: cosine
    - Chunking: 900 chars, 180 char overlap, paragraph-boundary splitting
    - Each chunk enriched with page title + URL prefix (vectorstore.ts:130-152)
    - Deduplication via MD5 content hash (vectorstore.ts:159-161)
    - Batch upsert: 10 chunks per batch (vectorstore.ts:218-251)
    - Query: supports multi-query retrieval, deduped by chunk ID (vectorstore.ts:327-379)
```

### Eval Benchmark Pairs

| # | Scenario | Expected behavior | Eval criteria |
|---|---------|-------------------|---------------|
| 1 | Query "admission deadline" against page with "application due date" | Returns the page (semantic match) | Semantic similarity |
| 2 | Query "fee structure" against page titled "Tuition and Costs" | Returns the page despite different wording | Cross-vocabulary retrieval |
| 3 | Query "MTech AI" against multiple program pages | Returns the AI-specific page ranked highest | Ranking accuracy |
| 4 | Query irrelevant to any indexed content | Returns results with high distance (> 0.4) | Distance calibration |
| 5 | Same content indexed twice | Deduplicated in storage (single chunk ID) | Dedup correctness |
