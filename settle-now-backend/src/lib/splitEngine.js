/**
 * Settle Now split engine — THE single implementation of expense division.
 *
 * Dependency-free ESM so both the backend (settle-now-backend/src/lib) and the
 * client (settle-now-android/settle-now/src/lib) import byte-identical copies.
 * Keep the two files verbatim-identical.
 *
 * All money is integer paise. No floating-point arithmetic participates in any
 * calculation: quotas are computed as integer rationals (numerator/denominator)
 * and leftovers are distributed with the largest-remainder (Hare quota) method.
 *
 * Hard invariant: for every successful call, the returned shares sum exactly to
 * amountPaise, and every share is a safe integer >= 0.
 */

export const SPLIT_TYPES = ["EQUAL", "EXACT", "PERCENT", "SHARES"];

const fail = (code, message) => ({ ok: false, code, message });

const isNonNegSafeInt = (n) =>
  Number.isSafeInteger(n) && n >= 0;

/**
 * @param {number} amountPaise  total, integer paise, >= 0
 * @param {string[]} userIds    participants, non-empty
 * @param {'EQUAL'|'EXACT'|'PERCENT'|'SHARES'} type
 * @param {Array<{user_id: string, amount_paise?: number, percent?: number, weight?: number}>} [shares]
 * @returns {{ok: true, shares: Array<{user_id: string, share_paise: number}>}
 *          | {ok: false, code: string, message: string}}
 */
export function allocate({ amountPaise, userIds, type = "EQUAL", shares }) {
  // ── input validation ────────────────────────────────────────────────────
  if (!isNonNegSafeInt(amountPaise)) return fail("INVALID_AMOUNT", "amount must be a non-negative safe integer (paise)");
  if (!Array.isArray(userIds) || userIds.length === 0) return fail("NO_PARTICIPANTS", "at least one participant is required");
  const seen = new Set();
  for (const id of userIds) {
    if (typeof id !== "string" || id.length === 0) return fail("INVALID_PARTICIPANT", "participant ids must be non-empty strings");
    if (seen.has(id)) return fail("DUPLICATE_USER", `duplicate participant: ${id}`);
    seen.add(id);
  }

  // Zero-amount expenses carry no information — reject (documented default).
  if (amountPaise === 0) return fail("ZERO_AMOUNT", "zero-amount expenses are not recorded");

  const t = typeof type === "string" ? type.toUpperCase() : "";
  if (!SPLIT_TYPES.includes(t)) return fail("INVALID_SPLIT_TYPE", `split_type must be one of ${SPLIT_TYPES.join(", ")}`);

  const sortedIds = [...userIds].sort();

  // ── EQUAL — current production rule, preserved exactly ─────────────────
  if (t === "EQUAL") {
    const n = sortedIds.length;
    const base = Math.floor(amountPaise / n);
    const remainder = amountPaise % n;
    const out = sortedIds.map((user_id, i) => ({
      user_id,
      share_paise: base + (i < remainder ? 1 : 0),
    }));
    return { ok: true, shares: out };
  }

  // All remaining modes are driven by the shares[] payload.
  if (!Array.isArray(shares) || shares.length === 0) {
    return fail("NO_SHARES", `split_type ${t} requires a shares[] payload`);
  }

  // Exactly one entry per participant — the mode payload IS the participation list.
  const shareIds = [];
  const byId = new Map();
  for (const s of shares) {
    if (!s || typeof s.user_id !== "string" || s.user_id.length === 0) {
      return fail("INVALID_SHARE", "each share needs a user_id");
    }
    if (byId.has(s.user_id)) return fail("DUPLICATE_USER", `duplicate share for user: ${s.user_id}`);
    if (!userIds.includes(s.user_id)) {
      return fail("SHARE_USER_NOT_PARTICIPANT", `share user ${s.user_id} is not in participant list`);
    }
    shareIds.push(s.user_id);
    byId.set(s.user_id, s);
  }
  if (shareIds.length !== userIds.length) {
    return fail("MISSING_SHARE_FOR_PARTICIPANT", "every participant needs an entry in shares[] for this split type");
  }

  // ── EXACT — shares must sum to the amount verbatim ─────────────────────
  if (t === "EXACT") {
    let sum = 0;
    const parts = [];
    for (const id of shareIds) {
      const v = byId.get(id).amount_paise;
      if (!isNonNegSafeInt(v)) return fail("INVALID_SHARE", "EXACT shares need integer amount_paise >= 0");
      sum += v;
      parts.push({ user_id: id, share_paise: v });
    }
    if (sum !== amountPaise) {
      return fail("EXACT_SUM_MISMATCH", `EXACT shares sum to ${sum} but the expense is ${amountPaise} paise`);
    }
    return { ok: true, shares: parts };
  }

  // ── PERCENT / SHARES — largest-remainder (Hare quota) over integer rationals
  //
  // Quotas are NORMALIZED by the sum of numerators (quota_i = amount * num_i / Σnum),
  // so percents totalling ≠ 100 scale proportionally to the amount and the
  // leftover after flooring is always < n participants — the classic Hare
  // regime. No float arithmetic anywhere.
  let numerators; // integer, scaled units
  if (t === "PERCENT") {
    numerators = [];
    for (const id of shareIds) {
      const p = byId.get(id).percent;
      if (typeof p !== "number" || !Number.isFinite(p) || p < 0) {
        return fail("INVALID_SHARE", "PERCENT shares need a percent >= 0");
      }
      // Accept decimal percents (33.33) by scaling ×100 and rounding.
      numerators.push(Math.round(p * 100));
    }
  } else {
    // SHARES — decimal weights (1.5) scale to 1/1000 units.
    numerators = [];
    for (const id of shareIds) {
      const w = byId.get(id).weight;
      if (typeof w !== "number" || !Number.isFinite(w) || w < 0) {
        return fail("INVALID_SHARE", "SHARES weights need a weight >= 0");
      }
      numerators.push(Math.round(w * 1000));
    }
  }

  const denominator = numerators.reduce((a, b) => a + b, 0);
  if (denominator <= 0) {
    return fail("INVALID_SHARE", t === "PERCENT" ? "total percent must be positive" : "total weight must be positive");
  }

  // floor(quota_i) via integer division
  const base = numerators.map((num) => Math.floor((amountPaise * num) / denominator));
  let leftover = amountPaise;
  for (const b of base) leftover -= b;
  // leftover ∈ [0, n) by construction (Σquota == amountPaise exactly).

  // Fractional remainder of each quota: (amountPaise * num_i) % denominator.
  // Distribute leftover 1 paise at a time, largest fractional remainder first;
  // tie-break by lexicographic user_id so the result is deterministic.
  const order = shareIds
    .map((user_id, i) => ({
      user_id,
      i,
      rem: (amountPaise * numerators[i]) % denominator,
    }))
    .sort((x, y) => y.rem - x.rem || (x.user_id < y.user_id ? -1 : x.user_id > y.user_id ? 1 : 0));

  const extra = new Map();
  for (let k = 0; k < order.length && leftover > 0; k++, leftover--) {
    extra.set(order[k].user_id, (extra.get(order[k].user_id) || 0) + 1);
  }

  const sharesOut = shareIds.map((user_id, i) => ({
    user_id,
    share_paise: base[i] + (extra.get(user_id) || 0),
  }));

  // Self-check of the hard invariant (defensive; should be impossible to trip).
  const sum = sharesOut.reduce((s, x) => s + x.share_paise, 0);
  if (sum !== amountPaise) return fail("INTERNAL_SUM_MISMATCH", "internal allocation error — invariant violated");

  return { ok: true, shares: sharesOut };
}
