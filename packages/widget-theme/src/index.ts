/**
 * @repo/widget-theme
 *
 * The widget's visual contract, shared by everything that touches it: the dashboard
 * picker that edits a theme, the API that stores and serves it, and the widget that
 * renders it.
 *
 * It lives in one package because it was previously declared in four — and they had
 * already drifted. `apps/web/src/components/IntegrationPanel.tsx` defaulted `primary`
 * to `#1f2522` while the picker, the API and the widget all used `#2E3538`, so the
 * embed snippet a site owner copied previewed a colour their widget would never render.
 */

/**
 * A fully-resolved theme: every field present, ready to render.
 *
 * This is what the dashboard edits and what the API stores.
 */
export interface WidgetTheme {
  primary: string;
  launcherBg: string;
  botBubbleBg: string;
  userBubbleBg: string;
  headerTextColor: string;
  timestampColor: string;
  iconColor: string;
  sendBtnBg: string;
  sendBtnColor: string;
  fontFamily: string;
  widgetOpacity: number;
  /** Shown as a small disclosure link in the widget when set — not required. */
  privacyPolicyUrl?: string;
}

/**
 * What arrives from `window.NAVBOT_CONFIG.theme` on a customer's page.
 *
 * Every field is optional because the snippet is hand-editable and old embeds are
 * still live in the wild; the widget merges it over DEFAULT_THEME.
 */
export interface WidgetThemeInput extends Partial<WidgetTheme> {
  /** Legacy alias for `fontFamily`, still present in early embed snippets. */
  font?: string;
}

export const DEFAULT_THEME: WidgetTheme = {
  primary: "#2E3538",
  launcherBg: "#2E3538",
  botBubbleBg: "rgba(255,255,255,0.4)",
  userBubbleBg: "rgba(0,0,0,0.06)",
  headerTextColor: "#2E3538",
  timestampColor: "#94a3b8",
  iconColor: "#94a3b8",
  sendBtnBg: "#2E3538",
  sendBtnColor: "#ffffff",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  widgetOpacity: 0.45,
};
