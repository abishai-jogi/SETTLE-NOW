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
 * Label for a calendar month given "now" — the pure, testable core of the
 * history labeling. Distance is measured in whole calendar months from the
 * current (possibly incomplete) month:
 *   0 = current month (in progress → null, never listed)
 *   1 = last completed month → "Last Month"
 *   2 → "1", 3 → "2", ... so labels auto-shift when a new month begins.
 */
export function monthLabelFor(monthDate, now = new Date()) {
  const monthsAway =
    (monthDate.getFullYear() - now.getFullYear()) * 12 +
    (monthDate.getMonth() - now.getMonth());
  if (monthsAway >= 0) return null; // current or future month → not completed
  const completedBack = -monthsAway; // 1 = last completed month
  return completedBack === 1 ? "Last Month" : String(completedBack - 1);
}

/**
 * Monthly total history: bucket bills by calendar month, sum per month,
 * and label them dynamically (most recent completed month = "Last Month",
 * older ones numbered 1, 2, 3... from the current month backwards).
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

  // One entry per bucket, labeled via monthLabelFor
  const entries = [];
  for (const [key, sum] of buckets) {
    const [year, month] = key.split("|").map(Number);
    const firstOfMonth = new Date(year, month, 1);
    const label = monthLabelFor(firstOfMonth, now);
    if (label === null) continue; // current (in-progress) or future month
    entries.push({ monthOf: firstOfMonth, key, label, total: round2(sum) });
  }

  // Newest-first
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
