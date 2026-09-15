const round2 = (n) => Math.round(n * 100) / 100;

/** Net balance per member within a set of bills. Positive = owed money. */
export function netBalances(bills, members) {
  const bal = Object.fromEntries(members.map((m) => [m.id, 0]));
  for (const b of bills) {
    for (const id of b.splitAmongIds) if (!(id in bal)) bal[id] = 0;
  }
  for (const b of bills) {
    const n = b.splitAmongIds.length;
    if (n === 0) continue;
    const share = b.amount / n;
    for (const id of b.splitAmongIds) bal[id] -= share;
    if (b.payerId in bal) bal[b.payerId] += b.amount;
  }
  return Object.fromEntries(Object.entries(bal).map(([id, v]) => [id, round2(v)]));
}

export function paidTotals(bills, members) {
  const t = Object.fromEntries(members.map((m) => [m.id, 0]));
  for (const b of bills) {
    if (b.payerId in t) t[b.payerId] += b.amount;
  }
  return Object.fromEntries(Object.entries(t).map(([id, v]) => [id, round2(v)]));
}

export function sumSince(bills, id, days) {
  const cut = Date.now() - days * 86400000;
  let s = 0;
  for (const b of bills) {
    if (b.payerId === id && b.timestamp >= cut) s += b.amount;
  }
  return round2(s);
}

export const groupTotal = (bills) =>
  round2(bills.reduce((a, b) => a + b.amount, 0));

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
  // Bucket by (year, month)
  const buckets = new Map();
  for (const b of bills) {
    const d = new Date(b.timestamp);
    const key = `${d.getFullYear()}|${d.getMonth()}`;
    buckets.set(key, (buckets.get(key) || 0) + b.amount);
  }

  // Keep completed months only, oldest first, so the oldest is "1" and
  // numbering increases upward (calendar-distance based, gap-safe).
  const rawEntries = [];
  for (const [key, sum] of buckets) {
    const [year, month] = key.split("|").map(Number);
    const firstOfMonth = new Date(year, month, 1);
    // monthIndexDistance(a=now, b=month): 0 = current month, positive = future
    const fromNow = monthIndexDistance(now, firstOfMonth);
    if (fromNow >= 0) continue; // current (in-progress) or future month
    rawEntries.push({ monthOf: firstOfMonth, key, total: round2(sum) });
  }
  rawEntries.sort((a, b) => a.monthOf.getTime() - b.monthOf.getTime());

  const entries = rawEntries.map((e) => ({
    ...e,
    label:
      e.monthOf.getTime() === rawEntries[rawEntries.length - 1].monthOf.getTime()
        ? "Last Month" // newest completed month
        : String(monthIndexDistance(rawEntries[0].monthOf, e.monthOf) + 1), // 1, 2, 3…
  }));

  // Newest-first for display
  entries.sort((a, b) => b.monthOf.getTime() - a.monthOf.getTime());
  return entries;
}

/**
 * Greedy debt simplification: match largest creditor with largest debtor,
 * repeat until balanced. Returns list of { from, to, amount }.
 */
export function simplifyDebts(netCents) {
  const debtors = [];
  const creditors = [];
  for (const [id, amt] of Object.entries(netCents)) {
    const cents = Math.round(amt * 100) / 100;
    if (cents < -0.005) debtors.push({ id, amount: -cents });
    else if (cents > 0.005) creditors.push({ id, amount: cents });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0,
    j = 0;
  while (i < debtors.length && j < creditors.length) {
    const payment = Math.min(debtors[i].amount, creditors[j].amount);
    if (payment > 0.005) {
      transfers.push({
        from: debtors[i].id,
        to: creditors[j].id,
        amount: round2(payment),
      });
    }
    debtors[i] = { ...debtors[i], amount: round2(debtors[i].amount - payment) };
    creditors[j] = { ...creditors[j], amount: round2(creditors[j].amount - payment) };
    if (debtors[i].amount < 0.005) i++;
    if (creditors[j].amount < 0.005) j++;
  }
  return transfers;
}
