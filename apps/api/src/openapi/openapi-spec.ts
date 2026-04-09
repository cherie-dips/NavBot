/**
 * OpenAPI 3.0 spec for NavBot API — drives Swagger UI at /api-docs.
 * Example values under `examples` are ready-made test cases you can run from the UI.
 */
export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "NavBot API",
    description:
      "Website indexing, RAG chat, voice, TTS, theme, FAQs, and sitemap sync. " +
      "Most site routes require `userId` (from auth session). " +
      "Replace placeholder IDs with real values from your DB after indexing.",
    version: "1.0.0",
  },
  servers: [
    { url: "http://localhost:3001", description: "Local development" },
    { url: "/", description: "Same origin (use when behind a proxy)" },
  ],
  tags: [
    { name: "Health", description: "Liveness" },
    { name: "Sites", description: "Index, theme, FAQs, delete" },
    { name: "Sync", description: "Sitemap-based smart sync" },
    { name: "Chat", description: "RAG text, voice, TTS" },
    { name: "Colors", description: "Palette extraction for widget theme" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthOk" },
                examples: {
                  ok: { summary: "Typical", value: { status: "ok" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/sites": {
      get: {
        tags: ["Sites"],
        summary: "List sites for a user",
        operationId: "listSites",
        parameters: [
          {
            name: "userId",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "User id from auth session",
            example: "user_abc123",
          },
        ],
        responses: {
          "200": {
            description: "Array of site summaries",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/SiteListItem" },
                },
              },
            },
          },
          "400": { description: "Missing userId" },
        },
      },
      post: {
        tags: ["Sites"],
        summary: "Crawl and index a new website",
        operationId: "indexSite",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/IndexSiteBody" },
              examples: {
                minimal: {
                  summary: "Minimal (siteId defaults to hostname)",
                  value: {
                    url: "https://example.com",
                    userId: "user_abc123",
                  },
                },
                explicitSiteId: {
                  summary: "Explicit site id",
                  value: {
                    url: "https://docs.example.com",
                    siteId: "docs.example.com",
                    userId: "user_abc123",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Indexed or reused",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/IndexSiteResponse" },
              },
            },
          },
          "400": { description: "Bad request" },
          "500": { description: "Indexing failed" },
        },
      },
    },
    "/api/sites/dashboard-stats": {
      get: {
        tags: ["Sites"],
        summary: "Dashboard analytics from logged chat turns",
        description:
          "Aggregates `chat_query` rows (user questions, optional latency and RAG source counts). " +
          "Pass `siteId` to scope to one website; omit to aggregate all sites the user owns.",
        operationId: "getDashboardStats",
        parameters: [
          {
            name: "userId",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "User id from auth session",
          },
          {
            name: "siteId",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Optional site id (hostname-style) to filter analytics",
          },
        ],
        responses: {
          "200": {
            description: "Totals, 7-day volume, top queries, recent turns, context",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DashboardAnalytics" },
              },
            },
          },
          "400": { description: "Missing userId" },
          "403": { description: "siteId not owned by user" },
        },
      },
    },
    "/api/sites/{siteId}/pages": {
      patch: {
        tags: ["Sites"],
        summary: "Recrawl specific URLs only",
        operationId: "patchSitePages",
        parameters: [
          {
            name: "siteId",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "example.com",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PatchPagesBody" },
              examples: {
                twoUrls: {
                  summary: "Two pages",
                  value: {
                    urls: [
                      "https://example.com/about",
                      "https://example.com/contact",
                    ],
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Update stats" },
          "400": { description: "Invalid body" },
          "500": { description: "Failed" },
        },
      },
    },
    "/api/sites/{siteId}/reindex": {
      post: {
        tags: ["Sites"],
        summary: "Full reindex of a site",
        operationId: "reindexSite",
        parameters: [
          {
            name: "siteId",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "example.com",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReindexBody" },
              examples: {
                full: {
                  summary: "Reindex with user",
                  value: {
                    url: "https://example.com",
                    userId: "user_abc123",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Reindexed" },
          "400": { description: "Missing url" },
          "500": { description: "Failed" },
        },
      },
    },
    "/api/sites/{siteId}": {
      delete: {
        tags: ["Sites"],
        summary: "Delete site for user (may clear vector store)",
        operationId: "deleteSite",
        parameters: [
          {
            name: "siteId",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "example.com",
          },
          {
            name: "userId",
            in: "query",
            required: true,
            schema: { type: "string" },
            example: "user_abc123",
          },
        ],
        responses: {
          "200": {
            description: "Deletion result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    deleted: { type: "boolean" },
                    vectorStoreCleared: { type: "boolean" },
                  },
                },
              },
            },
          },
          "400": { description: "Missing userId" },
        },
      },
    },
    "/api/sites/{siteId}/theme": {
      put: {
        tags: ["Sites"],
        summary: "Save widget theme (dashboard)",
        operationId: "putSiteTheme",
        parameters: [
          {
            name: "siteId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "userId",
            in: "query",
            required: true,
            schema: { type: "string" },
            example: "user_abc123",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WidgetTheme" },
              examples: {
                dark: {
                  summary: "Dark accent",
                  value: {
                    primary: "#2E3538",
                    launcherBg: "#2E3538",
                    botBubbleBg: "rgba(255,255,255,0.4)",
                    userBubbleBg: "rgba(0,0,0,0.06)",
                    headerTextColor: "#2E3538",
                    timestampColor: "#94a3b8",
                    iconColor: "#94a3b8",
                    sendBtnBg: "#2E3538",
                    sendBtnColor: "#ffffff",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Saved" },
          "400": { description: "Invalid theme" },
          "404": { description: "Site not found" },
        },
      },
      get: {
        tags: ["Sites"],
        summary: "Get widget theme (dashboard)",
        operationId: "getSiteTheme",
        parameters: [
          {
            name: "siteId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "userId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Theme JSON",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WidgetTheme" },
              },
            },
          },
          "400": { description: "Missing userId" },
        },
      },
    },
    "/api/sites/{siteId}/widget-config": {
      get: {
        tags: ["Sites"],
        summary: "Public widget config (theme)",
        operationId: "getWidgetConfig",
        parameters: [
          {
            name: "siteId",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "example.com",
          },
        ],
        responses: {
          "200": {
            description: "siteId + theme",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    siteId: { type: "string" },
                    theme: { $ref: "#/components/schemas/WidgetTheme" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/sites/{siteId}/faqs": {
      get: {
        tags: ["Sites"],
        summary: "Get FAQs (generates if empty)",
        operationId: "getFaqs",
        parameters: [
          {
            name: "siteId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "FAQs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    siteId: { type: "string" },
                    faqs: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          label: { type: "string" },
                          question: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "500": { description: "Failed" },
        },
      },
    },
    "/api/sites/{siteId}/faqs/refresh": {
      post: {
        tags: ["Sites"],
        summary: "Regenerate FAQs",
        operationId: "refreshFaqs",
        parameters: [
          {
            name: "siteId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Refreshed" },
          "500": { description: "Failed" },
        },
      },
    },
    "/api/sites/{siteId}/ping": {
      get: {
        tags: ["Sites"],
        summary: "Ping — triggers background sync (widget)",
        operationId: "pingSite",
        parameters: [
          {
            name: "siteId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Always ok (sync is async)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean" } },
                  example: { ok: true },
                },
              },
            },
          },
        },
      },
    },
    "/api/sites/{siteId}/sync": {
      get: {
        tags: ["Sync"],
        summary: "Sync stats or preview diff",
        description:
          "Without `preview`: returns `totalTracked` + `lastSynced`. " +
          "With `preview=true`: runs sitemap/BFS preview (may be slow).",
        operationId: "getSync",
        parameters: [
          {
            name: "siteId",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "example.com",
          },
          {
            name: "userId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "preview",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["true", "false"] },
            description: "Set to true for change preview",
          },
        ],
        responses: {
          "200": { description: "Stats or preview payload" },
          "400": { description: "Missing userId" },
          "404": { description: "Site not found" },
          "500": { description: "Preview failed" },
        },
      },
      post: {
        tags: ["Sync"],
        summary: "Run smart sync",
        description: "Optional query `full=true` to force full crawl path.",
        operationId: "postSync",
        parameters: [
          {
            name: "siteId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "userId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "full",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["true", "false"] },
          },
        ],
        responses: {
          "200": { description: "Sync result" },
          "400": { description: "Missing userId" },
          "404": { description: "Site not found" },
          "500": { description: "Sync failed" },
        },
      },
    },
    "/api/chat": {
      post: {
        tags: ["Chat"],
        summary: "Text chat (RAG)",
        operationId: "postChat",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ChatBody" },
              examples: {
                simple: {
                  summary: "Single question",
                  value: {
                    siteId: "example.com",
                    message: "What programs do you offer?",
                    history: [],
                  },
                },
                withHistory: {
                  summary: "With prior turns",
                  value: {
                    siteId: "example.com",
                    message: "What is the application deadline?",
                    history: [
                      { role: "user", content: "Hi" },
                      { role: "assistant", content: "Hello! How can I help?" },
                    ],
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Answer + sources",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChatResponse" },
              },
            },
          },
          "400": { description: "Missing siteId or message" },
          "500": { description: "chat_failed" },
        },
      },
    },
    "/api/chat/tts": {
      post: {
        tags: ["Chat"],
        summary: "Text-to-speech",
        operationId: "postTts",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["text"],
                properties: {
                  text: {
                    type: "string",
                    description: "Answer text to speak (truncated server-side if very long)",
                  },
                },
              },
              examples: {
                short: {
                  summary: "Short line",
                  value: { text: "Welcome to our admissions page." },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Base64 WAV",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    audio: { type: "string", description: "Base64-encoded WAV" },
                  },
                },
              },
            },
          },
          "400": { description: "Missing text" },
          "500": { description: "tts_failed" },
        },
      },
    },
    "/api/chat/voice": {
      post: {
        tags: ["Chat"],
        summary: "Voice chat (multipart)",
        description:
          "Send `audio` file + `siteId`. Optional `history` as JSON string array.",
        operationId: "postVoice",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["audio", "siteId"],
                properties: {
                  audio: {
                    type: "string",
                    format: "binary",
                    description: "Audio blob (e.g. webm)",
                  },
                  siteId: { type: "string", example: "example.com" },
                  history: {
                    type: "string",
                    description: 'JSON string: [{"role":"user"|"assistant","content":"..."}]',
                    example: "[]",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "transcript + answer + sources",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    transcript: { type: "string", nullable: true },
                    answer: { type: "string" },
                    sources: { type: "array" },
                    error: { type: "string" },
                  },
                },
              },
            },
          },
          "400": { description: "Missing siteId or audio" },
          "500": { description: "voice_chat_failed" },
        },
      },
    },
    "/api/colors": {
      get: {
        tags: ["Colors"],
        summary: "Extract color palette from a URL",
        operationId: "getColors",
        parameters: [
          {
            name: "url",
            in: "query",
            required: true,
            schema: { type: "string", format: "uri" },
            example: "https://example.com",
          },
        ],
        responses: {
          "200": { description: "Palette object" },
          "400": { description: "Missing or invalid url" },
          "500": { description: "color_extraction_failed" },
        },
      },
    },
  },
  components: {
    schemas: {
      HealthOk: {
        type: "object",
        properties: { status: { type: "string", example: "ok" } },
      },
      DashboardAnalytics: {
        type: "object",
        properties: {
          totals: {
            type: "object",
            properties: {
              totalTurns: { type: "integer" },
              last7Days: { type: "integer" },
              thisCalendarMonth: { type: "integer" },
              avgLatencyMs: { type: "integer", nullable: true },
              turnsWithSources: { type: "integer" },
              voiceTurns: { type: "integer" },
              textTurns: { type: "integer" },
            },
          },
          volumeByDay: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                dayLabel: { type: "string" },
                count: { type: "integer" },
              },
            },
          },
          topQueries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                query: { type: "string" },
                count: { type: "integer" },
                answered: { type: "boolean" },
              },
            },
          },
          recentTurns: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                siteId: { type: "string" },
                query: { type: "string" },
                answerPreview: { type: "string", nullable: true },
                createdAt: { type: "string" },
                channel: { type: "string" },
                sourceCount: { type: "integer", nullable: true },
              },
            },
          },
          context: {
            type: "object",
            properties: {
              websiteCount: { type: "integer" },
              pagesIndexed: { type: "integer" },
              faqCount: { type: "integer" },
            },
          },
        },
      },
      SiteListItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          url: { type: "string" },
          hostname: { type: "string" },
          status: { type: "string" },
          pagesIndexed: { type: "integer" },
          lastCrawled: { type: "string" },
          addedAt: { type: "string" },
          widgetTheme: { nullable: true },
        },
      },
      IndexSiteBody: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri" },
          siteId: { type: "string" },
          userId: { type: "string" },
        },
      },
      IndexSiteResponse: {
        type: "object",
        properties: {
          siteId: { type: "string" },
          pageCount: { type: "integer" },
          stored: { type: "integer" },
          failed: { type: "integer" },
          reused: { type: "boolean" },
        },
      },
      PatchPagesBody: {
        type: "object",
        required: ["urls"],
        properties: {
          urls: { type: "array", items: { type: "string", format: "uri" } },
        },
      },
      ReindexBody: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri" },
          userId: { type: "string" },
        },
      },
      WidgetTheme: {
        type: "object",
        required: ["primary"],
        properties: {
          primary: { type: "string" },
          launcherBg: { type: "string" },
          botBubbleBg: { type: "string" },
          userBubbleBg: { type: "string" },
          headerTextColor: { type: "string" },
          timestampColor: { type: "string" },
          iconColor: { type: "string" },
          sendBtnBg: { type: "string" },
          sendBtnColor: { type: "string" },
        },
      },
      ChatBody: {
        type: "object",
        required: ["siteId", "message"],
        properties: {
          siteId: { type: "string" },
          message: { type: "string" },
          history: {
            type: "array",
            items: {
              type: "object",
              properties: {
                role: { type: "string", enum: ["user", "assistant"] },
                content: { type: "string" },
              },
            },
          },
        },
      },
      ChatResponse: {
        type: "object",
        properties: {
          answer: { type: "string" },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string" },
                title: { type: "string" },
                distance: { type: "number" },
              },
            },
          },
        },
      },
    },
  },
} as const;
