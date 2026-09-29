import { useState } from "react";
import { draftMoney } from "../lib/format.js";
import { formatPaise } from "../lib/money.js";
import Numpad from "./Numpad.jsx";

/**
 * Settlement overlay — two views of the same debt, never contradictory.
 *
 * Group-wise : the server's minimal transfer set (`suggestions`) — settle the
 *              whole group in the fewest possible payments.
 * People-wise: the server's pairwise matrix filtered to the signed-in user —
 *              settle with one specific person directly.
 *
 * Both write through recordSettlement with integer paise. "Totally cleared"
 * sends the exact outstanding paise for that row rather than a float compare.
 */
export default function SettlementOverlay({
  user,
  members,
  balances,       // server derivation: { suggestions, pairwise, nets, statuses, flags }
  onClose,
  onRecordSettlement, // ({ from, to, amountPaise }) => void
  onConfirmSettlement, // (settlementId, status) => void  (pending rows)
}) {
  const [tab, setTab] = useState("group"); // "group" | "people"
  const [choosing, setChoosing] = useState(null); // { from, to, amountPaise }
  const [showPayNumpad, setShowPayNumpad] = useState(false);
  const [payDraft, setPayDraft] = useState("");
  const canPay = payDraft !== "" && Number.isFinite(Number(payDraft)) && Number(payDraft) > 0;

  const nameOf = (id) => members.find((m) => m.id === id)?.name || "Unknown";

  const myNetPaise = balances?.nets?.[user.id] || 0;
  const suggestions = (balances?.suggestions || []).map((s) => ({
    from: s.from,
    to: s.to,
    amountPaise: s.amount_paise ?? Math.round((s.amount || 0) * 100),
  }));
  // People-wise: pairwise rows involving me with a real outstanding amount,
  // oriented from my perspective (positive = I receive, negative = I pay).
  const myPairs = (balances?.pairwise || [])
    .filter((p) => p.outstanding_a_to_b_paise > 0)
    .map((p) => {
      const row = p.a === user.id
        ? { other: p.b, iPay: p.outstanding_a_to_b_paise }
        : p.b === user.id
          ? { other: p.a, iPay: 0, iReceive: p.outstanding_a_to_b_paise }
          : null;
      return row;
    })
    .filter(Boolean);

  const isSettled = myNetPaise === 0 && suggestions.length === 0 && myPairs.length === 0;

  const chooseRow = (t) => {
    setChoosing(t);
    setPayDraft("");
    setShowPayNumpad(false);
  };

  const recordPart = () => {
    if (!choosing || !canPay) return;
    onRecordSettlement({ from: choosing.from, to: choosing.to, amountPaise: Math.round(Number(payDraft) * 100) });
    setChoosing(null);
    setShowPayNumpad(false);
    setPayDraft("");
  };

  const recordFull = () => {
    if (!choosing) return;
    onRecordSettlement({ from: choosing.from, to: choosing.to, amountPaise: choosing.amountPaise });
    setChoosing(null);
    setPayDraft("");
  };

  const row = ({ from, to, amountPaise }) => {
    const direction = from === user.id ? "owe" : "owed";
    const otherId = direction === "owe" ? to : from;
    const isChoosing = choosing && choosing.from === from && choosing.to === to && choosing.amountPaise === amountPaise;
    return (
      <div key={`${from}-${to}`} className="space-y-1.5">
        <button
          type="button"
          onClick={() => (isChoosing ? setChoosing(null) : chooseRow({ from, to, amountPaise }))}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition active:scale-[0.99]"
          style={{ backgroundColor: direction === "owe" ? "rgba(122,30,42,0.06)" : "rgba(79,111,82,0.06)" }}
        >
          <span className="flex-1 text-sm text-charcoal">
            {nameOf(otherId)}
            {direction === "owe" ? " — you pay" : " — pays you"}
          </span>
          <span
            className="font-display text-sm font-semibold tabular-nums"
            style={{ color: direction === "owe" ? "#7a1e2a" : "#4f6f52" }}
          >
            {formatPaise(amountPaise)}
          </span>
          <svg className="h-3.5 w-3.5 shrink-0 text-faded" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {isChoosing && (
          <div className="pop-in mx-1 space-y-2 rounded-lg border border-gold/30 bg-ivory p-3">
            <p className="text-[9px] uppercase tracking-[0.25em] text-faded">
              How much is cleared with {nameOf(otherId)}?
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

        {/* People-wise / Group-wise tab switch */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-charcoal/5 p-1">
          {[
            { key: "group", label: "Group-wise" },
            { key: "people", label: "People-wise" },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setChoosing(null); setShowPayNumpad(false); }}
              className={`rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
                tab === key ? "bg-charcoal text-ivory shadow-sm" : "text-faded hover:text-charcoal"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isSettled ? (
          <div className="flex items-center gap-3 rounded-xl bg-sage/10 px-4 py-4">
            <span className="text-2xl">✨</span>
            <p className="text-sm font-medium text-sage">You're fully settled — no balance owed.</p>
          </div>
        ) : tab === "group" ? (
          <div className="space-y-4">
            {suggestions.filter((t) => t.from === user.id || t.to === user.id).length > 0 ? (
              <>
                <div>
                  {suggestions.some((t) => t.from === user.id) && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-wine">You owe</p>
                      <div className="space-y-1.5">
                        {suggestions.filter((t) => t.from === user.id).map((t) => row(t))}
                      </div>
                    </div>
                  )}
                </div>
                {suggestions.some((t) => t.to === user.id) && (
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-sage">You're owed</p>
                    <div className="space-y-1.5">
                      {suggestions.filter((t) => t.to === user.id && t.from !== user.id).map((t) => row(t))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="py-2 text-center text-xs italic text-faded">
                Nothing to settle between you and the group directly — other members'
                balances cancel each other out.
              </p>
            )}
            <p className="pt-1 text-center text-[9px] italic text-faded">
              Group-wise: the fewest payments that clear everyone.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {myPairs.length > 0 ? (
              <>
                {myPairs.some((p) => p.iPay > 0) && (
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-wine">You owe</p>
                    <div className="space-y-1.5">
                      {myPairs.filter((p) => p.iPay > 0).map((p) =>
                        row({ from: user.id, to: p.other, amountPaise: p.iPay })
                      )}
                    </div>
                  </div>
                )}
                {myPairs.some((p) => p.iReceive > 0) && (
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-sage">You're owed</p>
                    <div className="space-y-1.5">
                      {myPairs.filter((p) => p.iReceive > 0).map((p) =>
                        row({ from: p.other, to: user.id, amountPaise: p.iReceive })
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="py-2 text-center text-xs italic text-faded">
                No one-on-one balances — nothing owed to or from any single member.
              </p>
            )}
            <p className="pt-1 text-center text-[9px] italic text-faded">
              People-wise: your direct one-on-one balance with each member.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
