/// <reference types="vite/client" />

/**
 * Typed build-time config. Without these declarations every read site had to cast
 * `import.meta` to `any` first, so a misspelt VITE_* name failed silently at runtime
 * instead of failing the build.
 */
interface ImportMetaEnv {
  /** Base URL of the NavBot API service (apps/api). */
  readonly VITE_API_URL?: string;
  /** Base URL of the auth service (apps/server). */
  readonly VITE_AUTH_URL?: string;
  /** Absolute URL the embed snippet should load the widget bundle from. */
  readonly VITE_WIDGET_SCRIPT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Config the embed snippet sets before the widget bundle loads. The dashboard writes
 * `apiBase` here too, so its own live widget preview talks to the same API.
 */
interface NavbotConfig {
  apiBase?: string;
  siteId?: string;
  theme?: Record<string, unknown>;
}

interface Window {
  NAVBOT_CONFIG?: NavbotConfig;
}
