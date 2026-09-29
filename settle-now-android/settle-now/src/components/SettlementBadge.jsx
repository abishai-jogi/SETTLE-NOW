/**
 * Floating settlement badge — consumes the server's derived status + flags.
 * Not recomputed locally: whatever the balances endpoint says is what shows.
 *
 * status: "settled" | "owes" | "owed"
 * flag:   { partially_settled: boolean } — rendered as a pulsing half-dot
 *         and the label "Settling" (a modifier, not a fourth state).
 */
export default function SettlementBadge({ status, partiallySettled, onClick }) {
  const bg =
    status === "settled" ? "#4f6f52" : status === "owes" ? "#7a1e2a" : "#a98548";
  const dot = status === "settled" ? "✓" : status === "owes" ? "↓" : "↑";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Settlement status"
      className="fixed left-4 top-[7rem] z-40 flex items-center gap-1.5 rounded-full px-3 py-1.5 shadow-lg transition active:scale-95"
      style={{ backgroundColor: bg, color: "#f6f1e7" }}
    >
      {partiallySettled ? (
        <span className="relative flex h-3 w-3 items-center justify-center">
          <span className="absolute h-3 w-3 animate-ping rounded-full bg-white/40" />
          <span
            className="h-3 w-3 rounded-full border-2"
            style={{ borderColor: "#f6f1e7", backgroundColor: "transparent" }}
          />
        </span>
      ) : (
        <span className="text-xs font-bold leading-none">{dot}</span>
      )}
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] leading-none">
        {partiallySettled ? "Settling" : "STLMNT STS"}
      </span>
    </button>
  );
}
