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
