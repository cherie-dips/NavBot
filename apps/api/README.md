# NavBot API

## Swagger UI (interactive tests)

1. Start the API: `pnpm --filter api dev` (default **http://localhost:3001**).
2. Open **http://localhost:3001/api-docs** in your browser.
3. Each operation lists **Examples** (dropdown) — these are ready-made **test payloads** for `Try it out`.
4. Replace placeholders like `example.com` and `user_abc123` with real values from your app after you sign in and index a site.

**Note:** `POST /api/chat/voice` uses **multipart/form-data**. In Swagger UI, use **Choose File** for `audio` after clicking **Try it out**.

The OpenAPI document is defined in `src/openapi/openapi-spec.ts` (single source of truth for docs + examples).
