import { money, contrastInk } from "../lib/format.js";
import Avatar from "./Avatar.jsx";

/**
 * Always-present bubble showing the logged-in user's settlement status.
 * Displays simplified debts: who owes whom and how much.
 */
export default function SettlementBubble({ userId, members, transfers, netCents }) {
  const myNet = netCents[userId] || 0;

  // Find what I owe (transfers where I'm the debtor)
  const iOwe = transfers.filter((t) => t.from === userId);
  // Find what's owed to me (transfers where I'm the creditor)
  const owedToMe = transfers.filter((t) => t.to === userId);

  const nameOf = (id) => members.find((m) => m.id === id)?.name || "Unknown";
  const personOf = (id) => members.find((m) => m.id === id);

  const isSettled = Math.abs(myNet) < 0.005 && iOwe.length === 0 && owedToMe.length === 0;

  return (
    <div className="flex justify-center py-2">
      <div className="w-full max-w-md rounded-2xl border border-gold/30 bg-ivory/80 px-5 py-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <svg className="h-4 w-4 text-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659 1.171-1.671.505.5A7.5 7.5 0 1 0 7.5 13.5" />
          </svg>
          <span className="text-[10px] uppercase tracking-[0.3em] text-gold font-semibold">
            Settlement Status
          </span>
        </div>

        {isSettled ? (
          <div className="flex items-center gap-2">
            <span className="text-lg">✨</span>
            <p className="text-sm text-sage font-medium">
              You're fully settled — no balance owed.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {iOwe.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-wine font-semibold">
                  You owe
                </p>
                {iOwe.map((t, i) => {
                  const person = personOf(t.to);
                  return (
                    <div key={i} className="flex items-center gap-2.5 py-1">
                      {person && <Avatar person={person} size="sm" />}
                      <span className="flex-1 text-sm text-charcoal">
                        {nameOf(t.to)}
                      </span>
                      <span className="font-display text-sm font-semibold text-wine">
                        {money(t.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {owedToMe.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-sage font-semibold">
                  You're owed
                </p>
                {owedToMe.map((t, i) => {
                  const person = personOf(t.from);
                  return (
                    <div key={i} className="flex items-center gap-2.5 py-1">
                      {person && <Avatar person={person} size="sm" />}
                      <span className="flex-1 text-sm text-charcoal">
                        {nameOf(t.from)}
                      </span>
                      <span className="font-display text-sm font-semibold text-sage">
                        {money(t.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
