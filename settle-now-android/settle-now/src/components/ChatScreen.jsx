import { useEffect, useRef, useState } from "react";
import { CHIP_AMOUNTS } from "../config/people.js";
import { contrastInk, dayKey, dayLabel, draftMoney, money } from "../lib/format.js";
import { netBalances, simplifyDebts, sumSince } from "../lib/ledger.js";
import { appendBill, clearBillsForLedger, clearBillsOnServer } from "../lib/storage.js";
import { genUuid } from "../lib/uid.js";
import MessageBubble from "./MessageBubble.jsx";
import Numpad from "./Numpad.jsx";
import MonthlyAverageBadge from "./MonthlyAverageBadge.jsx";
import Footer from "./Footer.jsx";

function DayDivider({ ts }) {
  return (
    <div className="flex items-center gap-4 py-4">
      <div className="gold-hairline flex-1" />
      <span className="text-[10px] uppercase tracking-[0.3em] text-faded">
        {dayLabel(ts)}
      </span>
      <div className="gold-hairline flex-1" />
    </div>
  );
}

/* ── Floating Settlement Badge ──────────────────────────────────────── */
function SettlementBadge({ status, onClick }) {
  // status: "settled" | "owes" | "owed"
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
      <span className="text-xs font-bold leading-none">{dot}</span>
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] leading-none">
        STLMNT STS
      </span>
    </button>
  );
}

/* ── Settlement Overlay ──────────────────────────────────────────────── */
function SettlementOverlay({ user, members, transfers, netCents, onClose }) {
  const myNet = netCents[user.id] || 0;
  const iOwe = transfers.filter((t) => t.from === user.id);
  const owedToMe = transfers.filter((t) => t.to === user.id);
  const isSettled = Math.abs(myNet) < 0.005 && iOwe.length === 0 && owedToMe.length === 0;
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "Unknown";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" />
      <div
        className="pop-in relative z-10 mx-4 w-full max-w-sm rounded-2xl border border-gold/30 bg-ivory p-6 shadow-xl"
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
            <p className="text-sm font-medium text-sage">You're fully settled — no balance owed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {iOwe.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-wine">You owe</p>
                {iOwe.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg bg-wine/5 px-3 py-2">
                    <span className="flex-1 text-sm text-charcoal">{nameOf(t.to)}</span>
                    <span className="font-display text-sm font-semibold text-wine">{money(t.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {owedToMe.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-sage">You're owed</p>
                {owedToMe.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg bg-sage/5 px-3 py-2">
                    <span className="flex-1 text-sm text-charcoal">{nameOf(t.from)}</span>
                    <span className="font-display text-sm font-semibold text-sage">{money(t.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Floating Numpad Icon ────────────────────────────────────────────── */
function NumpadIcon({ onClick, accentHex }) {
  const fg = contrastInk(accentHex);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open numeric keypad"
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

/* ── Numpad Bottom Sheet ─────────────────────────────────────────────── */
function NumpadSheet({ user, draft, setDraft, onSend, canSend, onClose }) {
  const press = (k) => {
    setDraft((d) => {
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
    });
  };

  const onChipTap = (amount) => setDraft(String(amount));

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0" />
      <div
        className="pop-in relative z-10 w-full rounded-t-2xl bg-parchment shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3">
          <div className="h-1 w-8 rounded-full bg-charcoal/15" />
        </div>

        <div className="mx-auto max-w-3xl space-y-2 px-3 pb-4 pt-2">
          {/* Chips */}
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {CHIP_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => onChipTap(amt)}
                className="shrink-0 rounded-full border border-gold/50 bg-ivory px-4 py-1.5 text-sm text-ink shadow-sm transition hover:bg-gold/15 active:scale-95"
              >
                ₹{amt}
              </button>
            ))}
          </div>

          {/* Amount field */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-charcoal/20 bg-ivory px-4 py-2 shadow-sm">
            <span className="whitespace-nowrap text-[10px] uppercase tracking-[0.25em] text-faded">
              {user.name} pays
            </span>
            <input
              readOnly
              tabIndex={-1}
              inputMode="none"
              value={draftMoney(draft)}
              placeholder="₹ 0"
              onMouseDown={(e) => e.preventDefault()}
              className="w-full min-w-0 bg-transparent text-right font-display text-2xl tabular-nums text-charcoal outline-none placeholder:text-faded/50"
            />
          </div>

          {/* Numpad */}
          <Numpad
            onKey={press}
            onSend={() => { onSend(); onClose(); }}
            canSend={canSend}
            accentHex={user.color}
            label={canSend ? `Record ${draftMoney(draft)}` : "Record payment"}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Main ChatScreen ─────────────────────────────────────────────────── */
export default function ChatScreen({ user, members, ledger, bills, onRefreshBills, onBack, onLogout, onClear, onMonthlyTotals }) {
  const [draft, setDraft] = useState("");
  const [showSettlement, setShowSettlement] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);
  const endRef = useRef(null);

  const balances = netBalances(bills, members);
  const balance = balances[user.id] || 0;
  const transfers = simplifyDebts(balances);
  const monthlyAvg = sumSince(bills, user.id, 30);
  const canSend = draft !== "" && Number.isFinite(Number(draft)) && Number(draft) > 0;

  // Settlement icon status
  const myNet = balances[user.id] || 0;
  const iOwe = transfers.some((t) => t.from === user.id);
  const owedToMe = transfers.some((t) => t.to === user.id);
  const settlementStatus = iOwe ? "owes" : owedToMe ? "owed" : "settled";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bills.length]);

  const send = () => {
    const amount = Number(draft);
    if (!Number.isFinite(amount) || amount <= 0) return;
    appendBill({
      id: genUuid(),
      ledgerId: ledger.id,
      payerId: user.id,
      amount: Math.round(amount * 100) / 100,
      timestamp: Date.now(),
      splitAmongIds: members.map((m) => m.id),
    });
    setDraft("");
    onRefreshBills();
  };

  return (
    <div className="paper flex h-screen flex-col overflow-hidden">
      {/* Monthly Average Badge */}
      <MonthlyAverageBadge monthlyAvg={monthlyAvg} />

      <header className="sticky top-0 z-30 shadow-md">
        <div className="bg-charcoal text-ivory">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pb-3 pt-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to ledgers"
              className="rounded-full p-2 text-champagne transition hover:bg-white/10"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              {/* Tappable ledger name → Monthly Totals */}
              <button
                type="button"
                onClick={onMonthlyTotals}
                className="truncate text-left font-display text-xl leading-none transition hover:text-champagne"
              >
                {ledger.name}
                <svg className="ml-1.5 inline h-3.5 w-3.5 text-champagne/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
              <p className="mt-1 text-[9px] uppercase tracking-[0.35em] text-champagne">
                {members.length} member{members.length !== 1 ? "s" : ""}
                {""} · {""}
                <span className="font-mono tracking-wider">{ledger.inviteCode}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Clear all expenses in this ledger?")) {
                  clearBillsForLedger(ledger.id);
                  clearBillsOnServer(ledger.id);
                  onClear();
                }
              }}
              className="rounded-full border border-champagne/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-champagne/70 transition hover:bg-white/10"
            >
              Clear
            </button>
          </div>
          <div className="border-t border-white/10">
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
              <span className="truncate text-[10px] uppercase tracking-[0.25em] text-ivory/60">
                Signed in as {user.name}
              </span>
              {/* Balance banner */}
              {balance > 0 ? (
                <span className="rounded-full border border-sage/50 bg-sage/10 px-4 py-1.5 text-sm tabular-nums text-sage">
                  You get back {money(balance)}
                </span>
              ) : balance < 0 ? (
                <span className="rounded-full border border-wine/50 bg-wine/10 px-4 py-1.5 text-sm tabular-nums text-wine">
                  You owe {money(-balance)}
                </span>
              ) : (
                <span className="rounded-full border border-gold/50 bg-gold/10 px-4 py-1.5 text-sm text-gold">
                  Perfectly settled
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Scrollable chat area — no settlement bubble, no docked footer */}
      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-24 pt-2">
        {bills.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <p className="font-display text-2xl text-charcoal/70">An empty ledger.</p>
            <div className="gold-hairline my-4 w-32" />
            <p className="max-w-xs text-sm italic leading-relaxed text-faded">
              Tap the numpad icon below to record the first payment — it will be
              divided equally among all {members.length} members.
            </p>
          </div>
        ) : (
          bills.map((b, i) => {
            const prev = bills[i - 1];
            const newDay = !prev || dayKey(prev.timestamp) !== dayKey(b.timestamp);
            const payer = members.find((m) => m.id === b.payerId);
            if (!payer) return null;
            return (
              <div key={b.id}>
                {newDay && <DayDivider ts={b.timestamp} />}
                <MessageBubble bill={b} person={payer} mine={b.payerId === user.id} />
              </div>
            );
          })
        )}
        <div ref={endRef} />
        <Footer />
      </main>

      {/* Floating Settlement Badge (top-left) */}
      <SettlementBadge status={settlementStatus} onClick={() => setShowSettlement(true)} />

      {/* Floating Numpad Icon (bottom-right) */}
      <NumpadIcon onClick={() => setShowNumpad(true)} accentHex={user.color} />

      {/* Settlement Overlay */}
      {showSettlement && (
        <SettlementOverlay
          user={user}
          members={members}
          transfers={transfers}
          netCents={balances}
          onClose={() => setShowSettlement(false)}
        />
      )}

      {/* Numpad Bottom Sheet */}
      {showNumpad && (
        <NumpadSheet
          user={user}
          draft={draft}
          setDraft={setDraft}
          onSend={send}
          canSend={canSend}
          onClose={() => { setShowNumpad(false); setDraft(""); }}
        />
      )}
    </div>
  );
}
