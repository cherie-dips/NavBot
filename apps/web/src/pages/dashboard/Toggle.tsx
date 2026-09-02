

/* ─── TOGGLE HELPER ─────────────────────────────────────────────────────── */

export function Toggle({ enabled, onChange, color }: { enabled: boolean; onChange: (v: boolean) => void; color: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="relative flex-shrink-0 w-12 h-7 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{ backgroundColor: enabled ? color : "#e7dfd4", flexShrink: 0 }}
    >
      <span
        className="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ left: "4px", transform: enabled ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}
