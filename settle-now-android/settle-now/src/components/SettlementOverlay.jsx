import { useState } from "react";
import { draftMoney } from "../lib/format.js";
import { formatPaise } from "../lib/money.js";
import { buildSettlementView } from "../lib/settlementsView.js";
import Numpad from "./Numpad.jsx";

/**
 * Settlement overlay — every "you owe" and "you're owed" in one list.
 *
 * Rows come straight from the server's pairwise matrix (integer paise), so
 * they always agree with the balance shown in the header. No tabs, no modes.
 *
 * Clearing a row (partial or total) belongs to the person who OWES: only
 * "You owe" rows are actionable. The "You're owed" side is read-only — what
 * you do about that is between you and them, not a button in your ledger.
 *
 * "Totally cleared" sends the exact outstanding paise for that row rather
 * than a float comparison.
 */
export default function SettlementOverlay({
  user,
  members,
  balances,          // server derivation: { nets, pairwise, suggestions, statuses, flags }
  onClose,
  onRecordSettlement, // ({ from, to, amountPaise }) => void
}) {
  const [choosing, setChoosing] = useState(null); // { from, to, amountPaise, other }
  const [showPayNumpad, setShowPayNumpad] = useState(false);
  const [payDraft, setPayDraft] = useState("");
  const canPay = payDraft !== "" && Number.isFinite(Number(payDraft)) && Number(payDraft) > 0;

  const nameOf = (id) => members.find((m) => m.id === id)?.name || "Unknown";

  // One list of everything outstanding for this person, both directions.
  const { iOwe, owedToMe, isSettled } = buildSettlementView(user.id, balances);

  const chooseRow = (t) => {
    setChoosing(t);
    setPayDraft("");
    setShowPayNumpad(false);
  };

  const recordPart = () => {
    if (!choosing || !canPay) return;
    onRecordSettlement({ from: user.id, to: choosing.other, amountPaise: Math.round(Number(payDraft) * 100) });
    setChoosing(null);
    setShowPayNumpad(false);
    setPayDraft("");
  };

  const recordFull = () => {
    if (!choosing) return;
    onRecordSettlement({ from: user.id, to: choosing.other, amountPaise: choosing.amountPaise });
    setChoosing(null);
    setPayDraft("");
  };

  // ── "You owe" row — actionable (you are the payer of this debt) ──
  const oweRow = ({ other, amountPaise }) => {
    const isChoosing = choosing?.other === other;
    return (
      <div key={`owe-${other}`} className="space-y-1.5">
        <button
          type="button"
          onClick={() => (isChoosing ? setChoosing(null) : chooseRow({ other, amountPaise }))}
          className="flex w-full items-center gap-3 rounded-lg bg-wine/[0.06] px-3 py-2 text-left transition active:scale-[0.99]"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-charcoal">{nameOf(other)}</span>
          <span className="font-display text-sm font-semibold tabular-nums text-wine">
            {formatPaise(amountPaise)}
          </span>
          <svg className="h-3.5 w-3.5 shrink-0 text-faded" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {isChoosing && (
          <div className="pop-in mx-1 space-y-2 rounded-lg border border-gold/30 bg-ivory p-3">
            <p className="text-[9px] uppercase tracking-[0.25em] text-faded">
              How much are you clearing with {nameOf(other)}?
            </p>
            {!showPayNumpad ? (
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setShowPayNumpad(true)}
                  className="flex items-center justify-center gap-2 rounded-lg border border-gold/50 bg-ivory px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-charcoal shadow-sm transition hover:bg-gold/10 active:scale-[0.99]"
                >
                  <svg className="h-4 w-4 text-gold" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="2" y="2" width="4" height="4" rx="1" /><rect x="10" y="2" width="4" height="4" rx="1" /><rect x="18" y="2" width="4" height="4" rx="1" />
                    <rect x="2" y="10" width="4" height="4" rx="1" /><rect x="10" y="10" width="4" height="4" rx="1" /><rect x="18" y="10" width="4" height="4" rx="1" />
                    <rect x="2" y="18" width="4" height="4" rx="1" /><rect x="10" y="18" width="4" height="4" rx="1" /><rect x="18" y="18" width="4" height="4" rx="1" />
                  </svg>
                  Cleared amount
                </button>
                <button
                  type="button"
                  onClick={recordFull}
                  className="flex items-center justify-center gap-2 rounded-lg bg-sage px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-ivory shadow-sm transition hover:opacity-90 active:scale-[0.99]"
                >
                  ✓ Totally cleared
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-charcoal/20 bg-ivory px-3 py-2 shadow-sm">
                  <span className="whitespace-nowrap text-[10px] uppercase tracking-[0.25em] text-faded">
                    You paid
                  </span>
                  <input
                    readOnly
                    tabIndex={-1}
                    inputMode="none"
                    value={draftMoney(payDraft)}
                    placeholder="₹ 0"
                    onMouseDown={(e) => e.preventDefault()}
                    className="w-full min-w-0 bg-transparent text-right font-display text-xl tabular-nums text-charcoal outline-none placeholder:text-faded/50"
                  />
                </div>
                <Numpad
                  onKey={(k) =>
                    setPayDraft((d) => {
                      if (k === "back") return d.slice(0, -1);
                      if (k === ".") {
                        if (d.includes(".")) return d;
                        return d === "" ? "0." : d + ".";
                      }
                      if (!/^\d$/.test(k)) return d;
                      if (d.includes(".")) {
                        return d.length - d.indexOf(".") <= 2 ? d + k : d;
                      }
                      if (d.length >= 7) return d;
                      if (d === "0") return k;
                      return d + k;
                    })
                  }
                  onSend={recordPart}
                  canSend={canPay}
                  accentHex="#4f6f52"
                  label="Cleared"
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── "You're owed" row — read-only (the other person is the debtor) ──
  const owedRow = ({ other, amountPaise }) => (
    <div
      key={`owed-${other}`}
      className="flex w-full items-center gap-3 rounded-lg bg-sage/[0.06] px-3 py-2"
    >
      <span className="min-w-0 flex-1 truncate text-sm text-charcoal">{nameOf(other)}</span>
      <span className="font-display text-sm font-semibold tabular-nums text-sage">
        {formatPaise(amountPaise)}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" />
      <div
        className="pop-in relative z-10 mx-4 max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-gold/30 bg-ivory p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659 1.171-1.671.505.5A7.5 7.5 0 1 0 7.5 13.5" />
            </svg>
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              Settlement Status
            </span>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-faded transition hover:bg-charcoal/10">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isSettled ? (
          <div className="flex items-center gap-3 rounded-xl bg-sage/10 px-4 py-4">
            <span className="text-2xl">✨</span>
            <div>
              <p className="text-sm font-medium text-sage">You're fully settled — no balance owed.</p>
              {!balances && (
                <p className="mt-1 text-[10px] italic text-faded">
                  Nothing outstanding in this ledger.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {iOwe.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-wine">You owe</p>
                <div className="space-y-1.5">{iOwe.map((r) => oweRow(r))}</div>
              </div>
            )}
            {owedToMe.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-sage">You're owed</p>
                <div className="space-y-1.5">{owedToMe.map((r) => owedRow(r))}</div>
              </div>
            )}
            <p className="pt-1 text-center text-[9px] italic text-faded">
              {iOwe.length > 0
                ? "Tap what you owe to record a payment."
                : "Waiting on the people you lent to."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
