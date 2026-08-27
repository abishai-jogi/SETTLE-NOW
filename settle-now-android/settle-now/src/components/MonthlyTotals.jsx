import { money } from "../lib/format.js";
import { sumSince } from "../lib/ledger.js";
import Avatar from "./Avatar.jsx";
import Footer from "./Footer.jsx";

/**
 * Monthly Totals page — shows each member's total paid this calendar month.
 * Reached by tapping the ledger name in the chat header.
 */
export default function MonthlyTotals({ user, members, bills, onBack }) {
  // Calculate each member's total paid this month (trailing 30 days)
  const totals = members.map((m) => ({
    ...m,
    totalPaid: sumSince(bills, m.id, 30),
  }));

  // Sort highest to lowest
  totals.sort((a, b) => b.totalPaid - a.totalPaid);

  const groupTotal = totals.reduce((s, t) => s + t.totalPaid, 0);

  return (
    <div className="paper flex h-screen flex-col overflow-hidden">
      <header className="sticky top-0 z-30 shadow-md">
        <div className="bg-charcoal text-ivory">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pb-3 pt-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to chat"
              className="rounded-full p-2 text-champagne transition hover:bg-white/10"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-xl leading-none">
                Monthly Totals
              </h1>
              <p className="mt-1 text-[9px] uppercase tracking-[0.35em] text-champagne">
                Trailing 30 days · {members.length} member{members.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="border-t border-white/10">
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-2.5">
              <span className="text-[10px] uppercase tracking-[0.25em] text-ivory/60">
                Group total
              </span>
              <span className="font-display text-lg tabular-nums text-champagne">
                {money(groupTotal)}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-6 pt-4">
        <div className="space-y-2">
          {totals.map((t, i) => {
            const isMe = t.id === user.id;
            const pct = groupTotal > 0 ? (t.totalPaid / groupTotal) * 100 : 0;
            return (
              <div
                key={t.id}
                className="pop-in flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm transition hover:shadow-md"
                style={{
                  animationDelay: `${i * 40}ms`,
                  borderColor: isMe ? t.color : "rgba(169,133,72,0.2)",
                  backgroundColor: isMe ? `${t.color}10` : "rgba(246,241,231,0.7)",
                }}
              >
                {/* Rank */}
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: isMe ? t.color : "rgba(28,25,23,0.08)",
                    color: isMe ? "#f6f1e7" : "#736859",
                  }}
                >
                  {i + 1}
                </span>

                {/* Avatar */}
                <Avatar person={t} size="sm" />

                {/* Name */}
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${isMe ? "text-charcoal" : "text-ink"}`}>
                    {t.name}
                    {isMe && (
                      <span className="ml-2 text-[9px] uppercase tracking-[0.15em] opacity-50">
                        you
                      </span>
                    )}
                  </p>
                  {/* Progress bar */}
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-charcoal/8">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: t.color,
                      }}
                    />
                  </div>
                </div>

                {/* Amount */}
                <span
                  className="font-display text-lg tabular-nums font-semibold"
                  style={{ color: isMe ? t.color : "#1c1917" }}
                >
                  {money(t.totalPaid)}
                </span>
              </div>
            );
          })}
        </div>
        <Footer />
      </main>
    </div>
  );
}
