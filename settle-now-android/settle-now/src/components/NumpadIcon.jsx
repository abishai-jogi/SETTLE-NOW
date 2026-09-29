import { contrastInk } from "../lib/format.js";

/* ── Floating Numpad Icon ────────────────────────────────────────────── */
export default function NumpadIcon({ onClick, accentHex }) {
  const fg = contrastInk(accentHex);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Record an expense"
      className="fixed right-4 bottom-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition active:scale-95"
      style={{ backgroundColor: accentHex, color: fg }}
    >
      {/* Numpad grid icon */}
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <rect x="2" y="2" width="4" height="4" rx="1" />
        <rect x="10" y="2" width="4" height="4" rx="1" />
        <rect x="18" y="2" width="4" height="4" rx="1" />
        <rect x="2" y="10" width="4" height="4" rx="1" />
        <rect x="10" y="10" width="4" height="4" rx="1" />
        <rect x="18" y="10" width="4" height="4" rx="1" />
        <rect x="2" y="18" width="4" height="4" rx="1" />
        <rect x="10" y="18" width="4" height="4" rx="1" />
        <rect x="18" y="18" width="4" height="4" rx="1" />
      </svg>
    </button>
  );
}
