import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dayKey, dayLabel } from "../lib/format.js";
import { formatPaise } from "../lib/money.js";
import { sumSince, deriveBalances } from "../lib/ledger.js";
import { buildSettlementView } from "../lib/settlementsView.js";
import {
  appendBill,
  appendSettlement,
  cachedBalances,
  clearBillsForLedger,
  clearBillsOnServer,
  fetchBalancesFromServer,
  loadSettlements,
  mergeSettlementsFromServer,
} from "../lib/storage.js";
import { genUuid } from "../lib/uid.js";
import MessageBubble from "./MessageBubble.jsx";
import SettlementBadge from "./SettlementBadge.jsx";
import SettlementOverlay from "./SettlementOverlay.jsx";
import ExpenseSheet from "./ExpenseSheet.jsx";
import NumpadIcon from "./NumpadIcon.jsx";
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

const SPLIT_LABEL = {
  EQUAL: null,
  EXACT: "exact split",
  PERCENT: "percent split",
  SHARES: "weighted split",
};

const payerLabel = (bill, payerParticipates) => {
  if (payerParticipates) return SPLIT_LABEL[bill.splitType || "EQUAL"];
  return SPLIT_LABEL[bill.splitType || "EQUAL"]
    ? `${SPLIT_LABEL[bill.splitType || "EQUAL"]} · payer excluded`
    : "payer not splitting";
};

/* ── Main ChatScreen ─────────────────────────────────────────────────── */
export default function ChatScreen({ user, members, ledger, bills, onRefreshBills, onBack, onLogout, onClear, onMonthlyTotals, onMonthlyHistory }) {
  const [showSettlement, setShowSettlement] = useState(false);
  const [showExpenseSheet, setShowExpenseSheet] = useState(false);
  const [settlements, setSettlements] = useState(() => loadSettlements(ledger.id));
  const [serverBalances, setServerBalances] = useState(() => cachedBalances(ledger.id));
  const endRef = useRef(null);

  const monthlyAvg = sumSince(bills, user.id, 30);

  // ── Server-authoritative status, with an honest offline fallback. ──
  // serverBalances.nets / statuses / flags / pairwise come from
  // GET /balances (integer paise) and are adopted verbatim. If the server is
  // unreachable we derive the SAME shape locally from cached bills, so the
  // screen never claims "fully settled" just because a request failed.
  const loadBalances = useCallback(async () => {
    const derivation = await fetchBalancesFromServer(ledger.id);
    if (derivation) setServerBalances(derivation);
  }, [ledger.id]);

  useEffect(() => {
    setSettlements(loadSettlements(ledger.id));
    setServerBalances(cachedBalances(ledger.id));
    loadBalances();
  }, [ledger.id, loadBalances]);

  const derivation = useMemo(
    () => serverBalances ?? deriveBalances(bills, members, settlements),
    [serverBalances, bills, members, settlements]
  );
  const view = buildSettlementView(user.id, derivation);
  const net = view.netPaise; // integer paise
  const balance = net / 100; // display boundary only
  const status = view.status;
  const partiallySettled = view.partiallySettled;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bills.length]);

  // Pull settlements recorded on other devices (merged into local cache)
  useEffect(() => {
    let alive = true;
    mergeSettlementsFromServer(ledger.id).then((merged) => {
      if (alive && merged) setSettlements(merged);
    });
    return () => {
      alive = false;
    };
  }, [ledger.id]);

  // Refresh the server derivation whenever the ledger content changes
  // (bills list length or settlements list length moved).
  useEffect(() => {
    loadBalances();
  }, [bills.length, settlements.length, loadBalances]);

  // Record a debt payment: paise in, lifecycle state on the wire
  const recordSettlement = ({ from, to, amountPaise, status: st }) => {
    if (!(amountPaise > 0)) return;
    appendSettlement({
      ledgerId: ledger.id,
      fromUserId: from,
      toUserId: to,
      amountPaise,
      status: st || "COMPLETED",
    });
    setSettlements(loadSettlements(ledger.id));
    onRefreshBills();
  };

  const send = (billSpec) => {
    appendBill({
      id: genUuid(),
      ledgerId: ledger.id,
      payerId: user.id,
      timestamp: Date.now(),
      description: "",
      ...billSpec,
    });
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
              {/* Balance banner — server-derived, integer paise underneath */}
              {balance > 0 ? (
                <span className="rounded-full border border-sage/50 bg-sage/10 px-4 py-1.5 text-sm tabular-nums text-sage">
                  You get back {formatPaise(net)}
                </span>
              ) : balance < 0 ? (
                <span className="rounded-full border border-wine/50 bg-wine/10 px-4 py-1.5 text-sm tabular-nums text-wine">
                  You owe {formatPaise(-net)}
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

      {/* Scrollable chat area */}
      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-24 pt-2">
        {bills.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <p className="font-display text-2xl text-charcoal/70">An empty ledger.</p>
            <div className="gold-hairline my-4 w-32" />
            <p className="max-w-xs text-sm italic leading-relaxed text-faded">
              Tap the numpad icon below to record the first payment — choose who's
              splitting and how (equal, exact, percent or shares).
            </p>
          </div>
        ) : (
          bills.map((b, i) => {
            const prev = bills[i - 1];
            const newDay = !prev || dayKey(prev.timestamp) !== dayKey(b.timestamp);
            const payer = members.find((m) => m.id === b.payerId);
            if (!payer) return null;
            const participates = b.payerParticipates ?? b.payer_participates ?? true;
            return (
              <div key={b.id}>
                {newDay && <DayDivider ts={b.timestamp} />}
                <MessageBubble
                  bill={b}
                  person={payer}
                  mine={b.payerId === user.id}
                  splitLabel={payerLabel(b, participates)}
                />
              </div>
            );
          })
        )}
        <div ref={endRef} />
        <Footer />
      </main>

      {/* Floating Settlement Badge (top-left) — server statuses + flags */}
      <SettlementBadge
        status={status}
        partiallySettled={partiallySettled}
        onClick={() => setShowSettlement(true)}
      />

      {/* Floating Numpad Icon (bottom-right) */}
      <NumpadIcon onClick={() => setShowExpenseSheet(true)} accentHex={user.color} />

      {/* Settlement Overlay — every owe and owed in one list */}
      {showSettlement && (
        <SettlementOverlay
          user={user}
          members={members}
          balances={derivation}
          onClose={() => setShowSettlement(false)}
          onRecordSettlement={recordSettlement}
        />
      )}

      {/* Add-expense bottom sheet with split modes */}
      {showExpenseSheet && (
        <ExpenseSheet
          user={user}
          members={members}
          onSend={(billSpec) => {
            send(billSpec);
            setShowExpenseSheet(false);
          }}
          onClose={() => setShowExpenseSheet(false)}
        />
      )}
    </div>
  );
}
