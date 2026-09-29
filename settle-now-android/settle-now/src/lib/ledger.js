import { toPaise } from "./money.js";
import { allocate } from "./splitEngine.js";

/**
 * Ledger math — integer paise everywhere.
 *
 * All functions keep their historical signatures (rupee amounts in/out) so
 * StatsDrawer.jsx and MonthlyHistory.jsx keep working unchanged; internally
 * every calculation runs on integer paise via the shared splitEngine, so no
 * float arithmetic ever participates in a balance.
 *
 * Bills may arrive in either shape:
 *   - legacy: { amount } rupee float, always EQUAL across splitAmongIds
 *   - new:    { amount_paise, splitType, shares_paise[], payerParticipates }
 * Both are normalized here — the rest of the app never sees the difference.
 */

/** Normalize any bill shape → integer-paise bill with resolved shares. */
export function normalizeBill(b) {
  const amount_paise =
    typeof b.amount_paise === "number"
      ? b.amount_paise
      : toPaise(b.amount ?? 0);
  if (!Number.isSafeInteger(amount_paise) || amount_paise < 0) return null;
  const splitType = b.splitType || b.split_type || "EQUAL";
  const payerParticipates = b.payerParticipates ?? b.payer_participates ?? true;
  let participants = Array.isArray(b.splitAmongIds)
    ? b.splitAmongIds
    : Array.isArray(b.split_among)
      ? b.split_among
      : [];
  // Resolved shares: from the server when present, else derive locally
  // through the same engine the server uses.
  let shares;
  if (Array.isArray(b.shares_paise) && b.shares_paise.length > 0) {
    shares = b.shares_paise.map((s) => ({ user_id: s.user_id, share_paise: s.share_paise }));
  } else if (Array.isArray(b.shares) && b.shares.length > 0 && splitType !== "EQUAL") {
    shares = b.shares.map((s) => ({ user_id: s.userId ?? s.user_id, share_paise: toPaise(s.amount ?? 0) }));
  } else {
    const r = allocate({ amountPaise: amount_paise, userIds: participants, type: splitType });
    if (!r.ok) return null;
    shares = r.shares;
  }
  return {
    ...b,
    amount_paise,
    splitType,
    payerParticipates,
    splitAmongIds: shares.map((s) => s.user_id),
    shares_paise: shares,
  };
}

/**
 * Net balance per member in RUPEES (public signature preserved) — computed
 * entirely in integer paise. Positive = owed money.
 * PENDING and COMPLETED settlements reduce the balance; VOID does not.
 */
export function netBalances(bills, members, settlements = []) {
  const bal = {};
  for (const m of members) if (!(m.id in bal)) bal[m.id] = 0;
  for (const raw of bills) {
    const b = normalizeBill(raw);
    if (!b) continue;
    for (const s of b.shares_paise) {
      if (!(s.user_id in bal)) bal[s.user_id] = 0;
      bal[s.user_id] -= s.share_paise;
    }
    if (b.payerId in bal) bal[b.payerId] += b.amount_paise;
  }
  for (const s of settlements) {
    if (s.status === "VOID") continue;
    const paise = typeof s.amount_paise === "number" ? s.amount_paise : toPaise(s.amount ?? 0);
    if (!(s.fromUserId in bal)) bal[s.fromUserId] = 0;
    if (!(s.toUserId in bal)) bal[s.toUserId] = 0;
    bal[s.fromUserId] += paise; // payer's debt decreases
    bal[s.toUserId] -= paise;   // receiver is owed less
  }
  // Paise → rupees only at the return boundary (display formatting).
  return Object.fromEntries(Object.entries(bal).map(([id, p]) => [id, p / 100]));
}

/** Total paid per member (rupees out, paise in). */
export function paidTotals(bills, members) {
  const t = {};
  for (const m of members) t[m.id] = 0;
  for (const raw of bills) {
    const b = normalizeBill(raw);
    if (b && b.payerId in t) t[b.payerId] += b.amount_paise;
  }
  return Object.fromEntries(Object.entries(t).map(([id, p]) => [id, p / 100]));
}

export function sumSince(bills, id, days) {
  const cut = Date.now() - days * 86400000;
  let s = 0;
  for (const raw of bills) {
    const b = normalizeBill(raw);
    if (b && b.payerId === id && b.timestamp >= cut) s += b.amount_paise;
  }
  return s / 100;
}

export const groupTotal = (bills) =>
  bills.reduce((a, raw) => a + (normalizeBill(raw)?.amount_paise ?? 0), 0) / 100;

/**
 * Whole calendar months from month a to month b (b - a).
 * Negative = b is before a (a newer than b).
 */
function monthIndexDistance(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * Monthly total history: bucket bills by calendar month, sum per month,
 * and label them dynamically — oldest completed month shown = "1",
 * increasing upward, last completed month = "Last Month".
 *
 * Returns entries newest-first: [{ monthOf, label, total }].
 * Only completed months that actually have expenses are included.
 */
export function monthlyHistory(bills, now = new Date()) {
  const buckets = new Map();
  for (const raw of bills) {
    const b = normalizeBill(raw);
    if (!b) continue;
    const d = new Date(b.timestamp);
    const key = `${d.getFullYear()}|${d.getMonth()}`;
    buckets.set(key, (buckets.get(key) || 0) + b.amount_paise);
  }

  // Keep completed months only, oldest first, so the oldest is "1" and
  // numbering increases upward (calendar-distance based, gap-safe).
  const rawEntries = [];
  for (const [key, sumPaise] of buckets) {
    const [year, month] = key.split("|").map(Number);
    const firstOfMonth = new Date(year, month, 1);
    const fromNow = monthIndexDistance(now, firstOfMonth);
    if (fromNow >= 0) continue; // current (in-progress) or future month
    rawEntries.push({ monthOf: firstOfMonth, key, totalPaise: sumPaise });
  }
  rawEntries.sort((a, b) => a.monthOf.getTime() - b.monthOf.getTime());

  const entries = rawEntries.map((e) => ({
    ...e,
    total: e.totalPaise / 100, // display boundary
    label:
      e.monthOf.getTime() === rawEntries[rawEntries.length - 1].monthOf.getTime()
        ? "Last Month"
        : String(monthIndexDistance(rawEntries[0].monthOf, e.monthOf) + 1),
  }));

  entries.sort((a, b) => b.monthOf.getTime() - a.monthOf.getTime());
  return entries;
}

/**
 * Local fallback derivation — the same SHAPE the server returns
 * ({ nets, statuses, flags, pairwise }) in integer paise.
 *
 * The server stays the source of truth whenever it is reachable. This exists
 * so the settlement screen can never show a confident "you're fully settled"
 * just because a request failed: a local-first app must still show the debts
 * it knows about while offline. Deliberately mirrors the server's rules —
 * pairwise rows per unordered pair with `a` = lexicographically smaller id,
 * PENDING and COMPLETED settlements reduce the balance, VOID does not.
 */
export function deriveBalances(bills, members, settlements = []) {
  const nets = {};
  const bump = (map, key, v) => { map[key] = (map[key] || 0) + v; };

  const owedPair = {};   // "participant|payer" → that participant owes the payer
  const settledPair = {}; // "from|to"        → settled that way
  const pendingTouch = new Set();

  for (const raw of bills) {
    const b = normalizeBill(raw);
    if (!b) continue;
    if (!(b.payerId in nets)) nets[b.payerId] = 0;
    nets[b.payerId] += b.amount_paise;
    for (const s of b.shares_paise) {
      if (!(s.user_id in nets)) nets[s.user_id] = 0;
      nets[s.user_id] -= s.share_paise;
      if (s.user_id !== b.payerId) bump(owedPair, `${s.user_id}|${b.payerId}`, s.share_paise);
    }
  }

  for (const s of settlements) {
    const status = (s.status || "COMPLETED").toUpperCase();
    if (status === "VOID") continue;
    const paise = typeof s.amount_paise === "number" ? s.amount_paise : toPaise(s.amount ?? 0);
    if (!Number.isSafeInteger(paise)) continue;
    if (!(s.fromUserId in nets)) nets[s.fromUserId] = 0;
    if (!(s.toUserId in nets)) nets[s.toUserId] = 0;
    nets[s.fromUserId] += paise;
    nets[s.toUserId] -= paise;
    if (status === "PENDING") {
      pendingTouch.add(s.fromUserId);
      pendingTouch.add(s.toUserId);
    }
    bump(settledPair, `${s.fromUserId}|${s.toUserId}`, paise);
  }

  const ids = new Set(members.map((m) => m.id));
  for (const id of Object.keys(nets)) ids.add(id);
  for (const k of [...Object.keys(owedPair), ...Object.keys(settledPair)]) {
    const [a, b] = k.split("|");
    ids.add(a);
    ids.add(b);
  }
  const list = [...ids].sort();

  const pairwise = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const ab = owedPair[`${a}|${b}`] || 0;
      const ba = owedPair[`${b}|${a}`] || 0;
      const sAB = settledPair[`${a}|${b}`] || 0;
      const sBA = settledPair[`${b}|${a}`] || 0;
      const direction = (ab - ba) - (sAB - sBA);
      pairwise.push({
        a,
        b,
        owed_a_to_b_paise: Math.max(direction, 0),
        owed_b_to_a_paise: Math.max(-direction, 0),
        settled_ab_paise: Math.max(sAB - sBA, 0),
        outstanding_a_to_b_paise: Math.max(direction, 0),
      });
    }
  }

  const statuses = {};
  const flags = {};
  for (const [id, net] of Object.entries(nets)) {
    statuses[id] = net < 0 ? "owes" : net > 0 ? "owed" : "settled";
    flags[id] = { partially_settled: net !== 0 && pendingTouch.has(id) };
  }

  return { nets, pairwise, statuses, flags };
}

/**
 * Greedy debt simplification in integer paise. Deterministic: debtors and
 * creditors are sorted by amount descending, tie-break user_id ascending.
 * Accepts either a paise map or a rupee map (legacy callers) — values are
 * auto-detected when a map entry carries a non-integer value.
 */
export function simplifyDebts(netPaise) {
  const entries = Object.entries(netPaise).map(([id, v]) => {
    const n = Number(v);
    return { id, paise: Number.isSafeInteger(n) ? n : Math.round(n * 100) };
  });
  const debtors = [];
  const creditors = [];
  for (const { id, paise } of entries) {
    if (paise < 0) debtors.push({ id, paise: -paise });
    else if (paise > 0) creditors.push({ id, paise });
  }
  debtors.sort((a, b) => b.paise - a.paise || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  creditors.sort((a, b) => b.paise - a.paise || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const payment = Math.min(debtors[i].paise, creditors[j].paise);
    if (payment > 0) {
      transfers.push({
        from: debtors[i].id,
        to: creditors[j].id,
        amount: payment / 100, // display boundary
        amount_paise: payment,
      });
    }
    debtors[i].paise -= payment;
    creditors[j].paise -= payment;
    if (debtors[i].paise === 0) i++;
    if (creditors[j].paise === 0) j++;
  }
  return transfers;
}
