import { money, tint } from "../lib/format.js";
import { netBalances, paidTotals, sumSince, groupTotal } from "../lib/ledger.js";
import Avatar from "./Avatar.jsx";

const fmtNet = (n) =>
  n > 0 ? `+${money(n)}` : n < 0 ? `\u2212${money(Math.abs(n))}` : "\u2014";

export default function StatsDrawer({ open, onClose, userId, members, bills, onClear }) {
  const nets = netBalances(bills, members);
  const totals = paidTotals(bills, members);
  const rows = members.map((p) => ({
    p,
    week: sumSince(bills, p.id, 7),
    month: sumSince(bills, p.id, 30),
    paid: totals[p.id],
    net: nets[p.id],
    mine: p.id === userId,
  }));

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-label="Household ledger statistics"
        className={`paper fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-gold/40 shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex h-full flex-col">
          <header className="px-6 pb-4 pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-gold">
                  Statistics
                </p>
                <h2 className="mt-1 font-display text-2xl text-charcoal">
                  Settle Now
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close statistics"
                className="rounded-full p-2 text-faded transition hover:bg-black/5"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="gold-hairline mt-4" />
          </header>

          <div className="thin-scroll flex-1 space-y-4 overflow-y-auto px-6 pb-4">
            <div className="flex items-baseline justify-between rounded-lg border border-gold/40 bg-ivory/70 px-4 py-3">
              <span className="text-[10px] uppercase tracking-[0.25em] text-faded">
                Total recorded
              </span>
              <span className="font-display text-xl text-charcoal">
                {money(groupTotal(bills))}
              </span>
            </div>

            <div className="overflow-hidden rounded-lg border border-charcoal/15 bg-ivory/70">
              <div className="grid grid-cols-[1.35fr_0.9fr_0.95fr_1fr] items-center border-b border-charcoal/10 px-4 py-2.5 text-[9px] uppercase tracking-[0.2em] text-faded">
                <span>Member</span>
                <span className="text-right">Week</span>
                <span className="text-right">Month</span>
                <span className="text-right">Net</span>
              </div>
              {rows.map(({ p, week, month, paid, net, mine }) => (
                <div
                  key={p.id}
                  title={`Paid to date: ${money(paid)}`}
                  className="grid grid-cols-[1.35fr_0.9fr_0.95fr_1fr] items-center border-b border-charcoal/10 px-4 py-3 last:border-0"
                  style={{
                    backgroundColor: mine ? tint(p.color, 0.08) : undefined,
                    boxShadow: `inset 3px 0 0 ${mine ? p.color : "transparent"}`,
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar person={p} size="sm" />
                    <span
                      className="truncate text-sm"
                      style={mine ? { color: p.color } : undefined}
                    >
                      {p.name}
                    </span>
                  </span>
                  <span className="text-right text-sm tabular-nums">{money(week)}</span>
                  <span className="text-right text-sm tabular-nums">{money(month)}</span>
                  <span
                    className="text-right font-display text-sm tabular-nums"
                    style={{
                      color: net > 0 ? "#4f6f52" : net < 0 ? "#7a1e2a" : "#736859",
                    }}
                  >
                    {fmtNet(net)}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[10px] italic leading-relaxed text-faded">
              Week = trailing 7 days &middot; Month = trailing 30 days. Net is the
              simplified settlement against the group; each bill was split
              equally among the members active when it was logged.
            </p>
          </div>

          <footer className="border-t border-gold/30 px-6 py-4">
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Clear the entire ledger? This cannot be undone.")) {
                  onClear();
                }
              }}
              className="rounded-md border border-wine/40 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-wine transition hover:bg-wine/10"
            >
              Clear ledger
            </button>
          </footer>
        </div>
      </aside>
    </>
  );
}
