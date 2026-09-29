/**
 * Default split values — the "nobody should have to type a number to record
 * a bill" behaviour. Imports the real client module.
 * Run: node settle-now-backend/test/splitDefaults.test.mjs
 */
import assert from "node:assert/strict";
import { defaultValues } from "../../settle-now-android/settle-now/src/lib/splitDefaults.js";
import { toPaise } from "../../settle-now-android/settle-now/src/lib/money.js";
import { allocate } from "../../settle-now-android/settle-now/src/lib/splitEngine.js";

let passed = 0, failed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; } catch (err) { failed++; failures.push({ name, err }); }
};

// SHARES: everyone starts at 1
test("SHARES defaults every participant to 1", () => {
  const v = defaultValues("SHARES", ["a", "b", "c", "d"], 100000);
  assert.deepEqual(v, { a: "1", b: "1", c: "1", d: "1" });
});

// PERCENT: even 100% that sums to exactly 100
test("PERCENT defaults are even and sum to exactly 100", () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const ids = Array.from({ length: n }, (_, i) => `u${i}`);
    const v = defaultValues("PERCENT", ids, 100000);
    const sum = Object.values(v).reduce((s, x) => s + Number(x), 0);
    assert.equal(Math.round(sum * 100) / 100, 100, `n=${n} must total 100`);
  }
  const three = defaultValues("PERCENT", ["a", "b", "c"], 100000);
  // leftover hundredth goes to the first participant — the same "remainder to
  // the first id" convention the EQUAL rule uses, so the whole app agrees.
  assert.deepEqual(three, { a: "33.34", b: "33.33", c: "33.33" });
  assert.equal(Math.round(Object.values(three).reduce((s, x) => s + Number(x), 0) * 100) / 100, 100);
});

// EXACT: even division that already adds up to the amount exactly
test("EXACT defaults are valid immediately (no editing needed)", () => {
  for (const [amountPaise, n] of [[100000, 3], [99999, 3], [100, 3], [1, 1], [12345, 7], [1, 4], [9999999, 12]]) {
    const ids = Array.from({ length: n }, (_, i) => `u${i}`);
    const v = defaultValues("EXACT", ids, amountPaise);
    const sum = Object.values(v).reduce((s, x) => s + (toPaise(x) || 0), 0);
    assert.equal(sum, amountPaise, `${amountPaise}p across ${n} must sum exactly`);
    // and the engine accepts it as-is
    const r = allocate({
      amountPaise,
      userIds: ids,
      type: "EXACT",
      shares: Object.entries(v).map(([user_id, amount_paise]) => ({ user_id, amount_paise: toPaise(amount_paise) })),
    });
    assert.equal(r.ok, true, `engine must accept the defaults: ${r.message}`);
  }
});

// Safe with empty input / bad amounts
test("defaults handle empty and invalid input without throwing", () => {
  assert.deepEqual(defaultValues("SHARES", [], 0), {});
  assert.deepEqual(defaultValues("PERCENT", [], 0), {});
  assert.deepEqual(defaultValues("EXACT", [], 0), {});
  assert.deepEqual(defaultValues("EXACT", ["a"], 0), {});
  assert.deepEqual(defaultValues("EQUAL", ["a"], 100), {});
});

console.log(`\nsplitDefaults tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) {
    console.error(`\n✗ ${f.name}`);
    console.error(f.err.message);
  }
  process.exit(1);
}
