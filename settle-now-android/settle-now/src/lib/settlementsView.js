/**
 * Settlement view — turns a balances derivation (server or local fallback)
 * into what one person needs to see.
 *
 * WHY THIS EXISTS: pairwise rows are stored per unordered pair with `a` = the
 * lexicographically smaller id. The money can run EITHER way:
 *   a owes b  → outstanding_a_to_b_paise > 0, owed_b_to_a_paise = 0
 *   b owes a  → outstanding_a_to_b_paise = 0, owed_b_to_a_paise > 0
 * Filtering on a single direction field silently hides half the debts, so
 * both directions are mapped explicitly here and covered by tests.
 *
 * Pure + dependency-free so the mapping can be unit-tested directly.
 */

/**
 * @param {string} userId
 * @param {object|null} derivation  { nets, pairwise, statuses, flags }
 * @returns {{
 *   hasData: boolean,
 *   netPaise: number,
 *   status: "settled" | "owes" | "owed",
 *   partiallySettled: boolean,
 *   iOwe: Array<{ other: string, amountPaise: number }>,
 *   owedToMe: Array<{ other: string, amountPaise: number }>,
 *   isSettled: boolean
 * }}
 */
export function buildSettlementView(userId, derivation) {
  const empty = {
    hasData: false,
    netPaise: 0,
    status: "settled",
    partiallySettled: false,
    iOwe: [],
    owedToMe: [],
    isSettled: true,
  };
  if (!derivation || !Array.isArray(derivation.pairwise) || !derivation.nets) return empty;

  const num = (v) => (Number.isSafeInteger(v) ? v : 0);
  const iOwe = [];
  const owedToMe = [];

  for (const p of derivation.pairwise) {
    // The two fields are complementary (one is max(d,0), the other max(-d,0)),
    // so exactly one of these can be non-zero for any single row.
    const amountForA = num(p.outstanding_a_to_b_paise); // a owes b
    const amountForB = num(p.owed_b_to_a_paise);       // b owes a

    if (p.a === userId) {
      // I am `a` — the counterparty is always `b`, in either direction.
      if (amountForA > 0) iOwe.push({ other: p.b, amountPaise: amountForA });
      if (amountForB > 0) owedToMe.push({ other: p.b, amountPaise: amountForB });
    } else if (p.b === userId) {
      // I am `b` — the counterparty is always `a`, in either direction.
      if (amountForB > 0) iOwe.push({ other: p.a, amountPaise: amountForB });
      if (amountForA > 0) owedToMe.push({ other: p.a, amountPaise: amountForA });
    }
  }

  const bySize = (x, y) => y.amountPaise - x.amountPaise;
  iOwe.sort(bySize);
  owedToMe.sort(bySize);

  const netPaise = num(derivation.nets[userId]) || 0;
  const status = derivation.statuses?.[userId]
    || (netPaise < 0 ? "owes" : netPaise > 0 ? "owed" : "settled");
  const partiallySettled = Boolean(derivation.flags?.[userId]?.partially_settled);

  return {
    hasData: true,
    netPaise,
    status,
    partiallySettled,
    iOwe,
    owedToMe,
    isSettled: iOwe.length === 0 && owedToMe.length === 0,
  };
}
