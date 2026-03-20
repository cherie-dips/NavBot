import type { WidgetTheme } from "./ColorThemePicker";

export const MARKETING_WIDGET_THEME: WidgetTheme = {
  primary: "#1f2522",
  launcherBg: "#bc6c25",
  botBubbleBg: "rgba(255,255,255,0.72)",
  userBubbleBg: "rgba(31,37,34,0.08)",
  headerTextColor: "#1f2522",
  timestampColor: "#7c8a85",
  iconColor: "#7c8a85",
  sendBtnBg: "#1f2522",
  sendBtnColor: "#ffffff",
};

function isLight(hex: string): boolean {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
  } catch {
    return false;
  }
}

interface MarketingWidgetPreviewProps {
  theme?: WidgetTheme;
  title?: string;
  subtitle?: string;
  className?: string;
}

export const MarketingWidgetPreview = ({
  theme = MARKETING_WIDGET_THEME,
  title = "Ask NavBot anything",
  subtitle = "Widget preview",
  className = "",
}: MarketingWidgetPreviewProps) => {
  const textOnLauncher = !isLight(theme.launcherBg) ? "#fff" : "#1e293b";

  return (
    <div
      className={`relative overflow-hidden rounded-[2rem] border border-white/90 bg-[linear-gradient(160deg,#fbfaf7_0%,#eff3f6_52%,#e6edf5_100%)] p-5 shadow-[0_24px_60px_rgba(31,37,34,0.10)] ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(243,225,207,0.8),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(211,224,239,0.9),_transparent_34%)]" />

      <div className="relative mb-5 flex items-center justify-between">
        <div>
          {/* <p className="text-[11px] uppercase tracking-[0.24em] text-[#90755a]">
            {subtitle}
          </p>
          <h3 className="mt-2 text-xl font-medium tracking-[-0.03em] text-[#1f2522]">
            {title}
          </h3> */}
        </div>
      </div>

      <div className="relative h-[420px] overflow-hidden rounded-[1.6rem] border border-white/90 bg-[linear-gradient(180deg,#fdfcf9_0%,#f3eee7_40%,#eef3f7_100%)]">
        <div className="absolute inset-x-0 top-0 border-b border-[#1f2522]/10 bg-white/60 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f5bf9b]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#d6e1ef]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#d7d7cf]" />
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-2 rounded-full bg-[#e4e7e1] w-[58%]" />
            <div className="h-2 rounded-full bg-[#ece7df] w-[40%]" />
          </div>
        </div>

        <div className="absolute left-4 top-24 space-y-3 opacity-80">
          <div className="h-20 w-28 rounded-[1.4rem] bg-white/55 shadow-[0_10px_25px_rgba(31,37,34,0.05)]" />
          <div className="h-24 w-36 rounded-[1.4rem] bg-[#f6eee3]/90 shadow-[0_10px_25px_rgba(31,37,34,0.05)]" />
        </div>

        <div className="absolute bottom-14 right-4 flex h-[312px] w-[270px] flex-col overflow-hidden rounded-[1.4rem] border border-white/80 bg-[rgba(255,255,255,0.62)] shadow-[0_24px_50px_rgba(31,37,34,0.12)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-[#1f2522]/10 px-4 py-3">
            <div>
              <p className="font-display text-sm text-[#1f2522]">navbot</p>
              {/* <p className="font-display text-sm text-[#1f2522]">NavBot</p>
              <p className="text-[10px] text-[#7d8885]">Turning your website into a conversation</p> */}
            </div>
            {/* <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#4caf50]" />
              <span className="text-[10px] text-[#7d8885]">online</span>
            </div> */}
          </div>

          <div className="flex-1 space-y-3 px-4 py-4 text-[11px] leading-5 text-[#32403c]">
            <div className="max-w-[82%] rounded-[0.9rem] rounded-tl-sm border border-white/70 px-3 py-2 shadow-[0_8px_20px_rgba(31,37,34,0.06)]" style={{ background: theme.botBubbleBg }}>
              Hi, I can explain pricing, features, onboarding, or point visitors to the right page.
            </div>
            <div className="max-w-[76%] self-end rounded-[0.9rem] rounded-tr-sm border border-[#1f2522]/10 px-3 py-2 text-[#1f2522] shadow-[0_8px_20px_rgba(31,37,34,0.05)]" style={{ background: theme.userBubbleBg, marginLeft: "auto" }}>
              Which plan is best for a small team with multiple sites?
            </div>
            <div className="max-w-[84%] rounded-[0.9rem] rounded-tl-sm border border-white/70 px-3 py-2 shadow-[0_8px_20px_rgba(31,37,34,0.06)]" style={{ background: theme.botBubbleBg }}>
              Pro is a strong fit if you want multi-site support, analytics, and custom widget theming without jumping to enterprise complexity.
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#1f2522]/10 bg-white/70 px-3 py-1 text-[10px] text-[#697570]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#bc6c25]" />
              grounded in your website content
            </div>
          </div>

          <div className="border-t border-[#1f2522]/10 px-4 py-3">
            <div className="flex items-center gap-2 rounded-[0.9rem] border border-white/70 bg-white/55 px-3 py-2">
              <span className="flex-1 text-[11px] text-[#8a9691]">Ask about pricing, setup, or product fit...</span>
              <span className="grid h-8 w-8 place-items-center rounded-[0.75rem]" style={{ background: theme.sendBtnBg }}>
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={theme.sendBtnColor} strokeWidth={2.4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </div>
        </div>

        <div
          className="absolute bottom-4 right-4 grid h-12 w-12 place-items-center rounded-full border border-white/80 shadow-[0_16px_30px_rgba(31,37,34,0.14)]"
          style={{ background: theme.launcherBg }}
        >
          <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke={textOnLauncher} strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
      </div>
    </div>
  );
};
