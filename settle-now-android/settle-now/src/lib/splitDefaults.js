import { allocate } from "./splitEngine.js";

/**
 * Default split values, so nobody has to type a number just to record a bill.
 *
 *  SHARES  → every participant starts at weight 1
 *  PERCENT → an even 100% (33.33 / 33.33 / 33.34) summing to exactly 100
 *  EXACT   → an even division of the amount that already adds up exactly
 *
 * Values are produced by the same engine the server uses, so a freshly
 * seeded split is always valid and can be recorded without edits.
 */
export function defaultValues(mode, ids, amountPaise) {
  if (mode === "SHARES") return Object.fromEntries(ids.map((id) => [id, "1"]));

  if (mode === "PERCENT") {
    const n = ids.length;
    if (!n) return {};
    const base = Math.floor(10000 / n); // hundredths of a percent
    let rem = 10000 - base * n;
    return Object.fromEntries(
      ids.map((id) => {
        const v = base + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
        return [id, String(v / 100)];
      })
    );
  }

  if (mode === "EXACT") {
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !ids.length) return {};
    const r = allocate({ amountPaise, userIds: ids, type: "EQUAL" });
    if (!r.ok) return {};
    return Object.fromEntries(r.shares.map((s) => [s.user_id, String(s.share_paise / 100)]));
  }

  return {};
}
