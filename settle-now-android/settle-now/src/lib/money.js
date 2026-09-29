/**
 * Money helpers — integer paise everywhere.
 *
 * Backend twin: settle-now-backend/src/lib/money.js (toPaise is identical).
 * RULE: no float arithmetic in the money path. Rupee floats may appear only
 * at the display boundary (formatPaise) or the legacy-input boundary (toPaise),
 * and never escape back into calculations.
 */

import { money } from "./format.js";

/**
 * Parse a rupee amount (number or string) into integer paise.
 * Strings with more than 2 decimal places are rejected.
 * Returns NaN for anything unparseable/negative.
 */
export function toPaise(rupees) {
  if (typeof rupees === "string") {
    const s = rupees.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
    const [int, dec = ""] = s.split(".");
    const paise = Number(int) * 100 + Number((dec + "00").slice(0, 2) || "0");
    return Number.isSafeInteger(paise) ? paise : NaN;
  }
  if (typeof rupees === "number" && Number.isFinite(rupees)) {
    if (rupees < 0) return NaN;
    const paise = Math.round(rupees * 100);
    return Number.isSafeInteger(paise) ? paise : NaN;
  }
  return NaN;
}

/**
 * Format integer paise for display. The single sanctioned float boundary:
 * delegates to the existing money() renderer in format.js (unchanged),
 * dividing by 100 immediately before display only.
 */
export function formatPaise(paise) {
  return money(paise / 100);
}
