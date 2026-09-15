import { money } from "../lib/format.js";
import { monthlyHistory, groupTotal } from "../lib/ledger.js";
import Footer from "./Footer.jsx";

/**
 * Monthly Total History page.
 *
 * Lists past months' totals with dynamic labels:
 *  - Most recently completed month → "Last Month"
 *  - Older months → "1", "2", "3"... counting back from "Last Month"
 *  - The current (in-progress) month is never shown.
 * Labels auto-shift when a new calendar month begins because they're
 * computed from the current date on every render.
 *
 * Theme color (app gold #a98548) is used for accents/cards consistently —
 * this is a totals list, not a debt-direction indicator, so all entries
 * share one theme color rather than red/green settlement coloring.
 */
export default function MonthlyHistory({ user, members, bills, onBack }) {
  const history = monthlyHistory(bills);
  const groupTotalMonths = history.reduce((s, e) => s + e.total, 0);

  return (
    <div className="paper flex h-screen flex-col overflow-hidden">
      <header className="sticky top-0 z-30 shadow-md">
        <div className="bg-charcoal text-ivory">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pb-3 pt-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to monthly totals"
              className="rounded-full p-2 text-champagne transition hover:bg-white/10"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-xl leading-none">
                Monthly History
              </h1>
              <p className="mt-1 text-[9px] uppercase tracking-[0.35em] text-champagne">
                Past months · {history.length} month{history.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="border-t border-white/10">
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-2.5">
              <span className="text-[10px] uppercase tracking-[0.25em] text-ivory/60">
                All listed months
              </span>
              <span className="font-display text-lg tabular-nums text-champagne">
                {money(groupTotalMonths)}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-6 pt-4">
        {history.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <p className="font-display text-2xl text-charcoal/70">No history yet.</p>
            <div className="gold-hairline my-4 w-32" />
            <p className="max-w-xs text-sm italic leading-relaxed text-faded">
              Expenses from past months will appear here. The current month is
              always excluded — only completed months are listed.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((entry, i) => {
              const isRecent = entry.label === "Last Month";
              return (
                <div
                  key={`${entry.monthOf.getTime()}-${entry.label}`}
                  className="pop-in flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm transition hover:shadow-md"
                  style={{
                    animationDelay: `${i * 40}ms`,
                    // Theme-color accent ring + warm ivory card — single theme color
                    // for all entries (no per-entry debt-direction coloring).
                    borderColor: "rgba(169,133,72,0.25)",
                    backgroundColor: "rgba(246,241,231,0.7)",
                  }}
                >
                  {/* Label badge — theme color, consistent across all entries.
                      Width adapts: circles for numeric labels, a pill for "Last Month". */}
                  <span
                    className="flex h-7 shrink-0 items-center justify-center rounded-full px-2 text-xs font-semibold whitespace-nowrap"
                    style={{
                      backgroundColor: "#a98548",
                      color: "#f6f1e7",
                      minWidth: "1.75rem",
                    }}
                  >
                    {entry.label}
                  </span>

                  {/* Month date */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-charcoal">
                      {entry.monthOf.toLocaleDateString("en-IN", {
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  {/* Total */}
                  <span
                    className="font-display text-lg tabular-nums font-semibold"
                    style={{ color: "#1c1917" }}
                  >
                    {money(entry.total)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <Footer />
      </main>
    </div>
  );
}
