import { money } from "../lib/format.js";

/**
 * Translucent badge fixed to top-right of chat page showing
 * the logged-in user's own monthly average expense.
 */
export default function MonthlyAverageBadge({ monthlyAvg }) {
  return (
    <div className="pointer-events-none fixed right-3 top-20 z-20 sm:right-6">
      <div className="rounded-full border border-gold/30 bg-parchment/70 px-3 py-1.5 shadow-sm backdrop-blur-sm">
        <span className="text-[10px] uppercase tracking-[0.15em] text-faded/80">
          M.A:{" "}
        </span>
        <span className="font-display text-sm tabular-nums text-charcoal/80">
          {money(monthlyAvg)}
        </span>
      </div>
    </div>
  );
}
