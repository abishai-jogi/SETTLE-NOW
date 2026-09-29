/**
 * Settlement view — the mapping from a balances derivation to one person's
 * owes/owed lists, plus the local fallback derivation.
 *
 * Regression cover for the bug where filtering on outstanding_a_to_b_paise
 * alone hid every debt whose direction ran b→a (debtor id sorts larger),
 * making both parties see "fully settled" while money was outstanding.
 *
 * Run: node settle-now-backend/test/settlementsView.test.mjs
 */
import assert from "node:assert/strict";
import { buildSettlementView } from "../../settle-now-android/settle-now/src/lib/settlementsView.js";
import { deriveBalances } from "../../settle-now-android/settle-now/src/lib/ledger.js";

let passed = 0, failed = 0;
const failures = [];
const test = (name, fn) => {
  try { fn(); passed++; } catch (err) { failed++; failures.push({ name, err }); }
};

const SMALL = "11111111-1111-4111-8111-111111111111"; // sorts first
const LARGE = "ffffffff-ffff-4fff-8fff-ffffffffffff"; // sorts last

/* ── direction a → b (the smaller id owes) ── */
test("a owes b: the debtor sees 'you owe', the creditor sees 'you're owed'", () => {
  const derivation = {
    nets: { [SMALL]: -50000, [LARGE]: 50000 },
    statuses: { [SMALL]: "owes", [LARGE]: "owed" },
    flags: { [SMALL]: {}, [LARGE]: {} },
    pairwise: [{
      a: SMALL, b: LARGE,
      owed_a_to_b_paise: 50000, owed_b_to_a_paise: 0,
      settled_ab_paise: 0, outstanding_a_to_b_paise: 50000,
    }],
  };
  const asDebtor = buildSettlementView(SMALL, derivation);
  assert.deepEqual(asDebtor.iOwe, [{ other: LARGE, amountPaise: 50000 }]);
  assert.deepEqual(asDebtor.owedToMe, []);
  assert.equal(asDebtor.status, "owes");

  const asCreditor = buildSettlementView(LARGE, derivation);
  assert.deepEqual(asCreditor.owedToMe, [{ other: SMALL, amountPaise: 50000 }]);
  assert.deepEqual(asCreditor.iOwe, []);
  assert.equal(asCreditor.status, "owed");
});

/* ── direction b → a — THE BUG: amounts live in owed_b_to_a_paise ── */
test("b owes a: both sides still see the debt (regression: used to vanish)", () => {
  const derivation = {
    nets: { [SMALL]: 50000, [LARGE]: -50000 },
    statuses: { [SMALL]: "owed", [LARGE]: "owes" },
    flags: { [SMALL]: {}, [LARGE]: {} },
    pairwise: [{
      a: SMALL, b: LARGE,
      owed_a_to_b_paise: 0, owed_b_to_a_paise: 50000,
      settled_ab_paise: 0, outstanding_a_to_b_paise: 0, // <-- the field the old filter used
    }],
  };
  const asDebtor = buildSettlementView(LARGE, derivation);
  assert.deepEqual(asDebtor.iOwe, [{ other: SMALL, amountPaise: 50000 }], "debtor must see what they owe");
  assert.equal(asDebtor.isSettled, false, "debtor must NOT be told they are settled");

  const asCreditor = buildSettlementView(SMALL, derivation);
  assert.deepEqual(asCreditor.owedToMe, [{ other: LARGE, amountPaise: 50000 }], "creditor must see what they are owed");
  assert.equal(asCreditor.isSettled, false, "creditor must NOT be told they are settled");
});

/* ── several people at once, both directions, sorted biggest first ── */
test("multiple rows: both lists are complete and sorted by amount", () => {
  const C = "77777777-7777-4777-8777-777777777777";
  const derivation = {
    nets: { [SMALL]: -30000, [LARGE]: 10000, [C]: 20000 },
    pairwise: [
      { a: SMALL, b: LARGE, owed_a_to_b_paise: 20000, owed_b_to_a_paise: 0, outstanding_a_to_b_paise: 20000 },
      { a: C, b: LARGE, owed_a_to_b_paise: 0, owed_b_to_a_paise: 10000, outstanding_a_to_b_paise: 0 },
    ],
  };
  const v = buildSettlementView(LARGE, derivation);
  assert.deepEqual(v.iOwe, [{ other: C, amountPaise: 10000 }]);
  assert.deepEqual(v.owedToMe, [{ other: SMALL, amountPaise: 20000 }]);
  assert.equal(v.netPaise, 10000);
});

/* ── no data at all must not claim a debt, and must flag hasData=false ── */
test("missing derivation is reported as no data, not as a fabricated balance", () => {
  for (const input of [null, undefined, {}, { nets: {} }]) {
    const v = buildSettlementView(SMALL, input);
    assert.equal(v.hasData, false);
    assert.deepEqual(v.iOwe, []);
    assert.deepEqual(v.owedToMe, []);
  }
});

/* ── pending flag comes from the server flags ── */
test("partially_settled is surfaced from the derivation flags", () => {
  const derivation = {
    nets: { [SMALL]: -50000 },
    flags: { [SMALL]: { partially_settled: true } },
    pairwise: [{
      a: SMALL, b: LARGE, owed_a_to_b_paise: 50000, owed_b_to_a_paise: 0, outstanding_a_to_b_paise: 50000,
    }],
  };
  assert.equal(buildSettlementView(SMALL, derivation).partiallySettled, true);
  assert.equal(buildSettlementView(LARGE, derivation).partiallySettled, false);
});

/* ── the local fallback must agree with the server's shape ── */
test("local fallback derivation shows debts the same way the server does", () => {
  // Zoe (larger id) paid, Amy (smaller id) participates → b→a direction
  const bills = [{
    id: "b1",
    ledgerId: "L",
    payerId: LARGE,
    amount_paise: 100000,
    splitType: "EQUAL",
    payerParticipates: true,
    splitAmongIds: [SMALL, LARGE],
    shares_paise: [{ user_id: SMALL, share_paise: 50000 }, { user_id: LARGE, share_paise: 50000 }],
    timestamp: Date.now(),
  }];
  const members = [{ id: SMALL }, { id: LARGE }];
  const derivation = deriveBalances(bills, members, []);

  const debtor = buildSettlementView(SMALL, derivation);
  assert.deepEqual(debtor.iOwe, [{ other: LARGE, amountPaise: 50000 }], "Amy owes Zoe ₹500");
  assert.equal(debtor.status, "owes");

  const creditor = buildSettlementView(LARGE, derivation);
  assert.deepEqual(creditor.owedToMe, [{ other: SMALL, amountPaise: 50000 }], "Zoe is owed ₹500");

  // nets must still cancel to zero
  assert.equal(derivation.nets[SMALL] + derivation.nets[LARGE], 0);
});

/* ── a settlement clears the fallback debt ── */
test("local fallback applies settlements (and ignores VOID ones)", () => {
  const bills = [{
    id: "b1", ledgerId: "L", payerId: LARGE, amount_paise: 100000,
    splitAmongIds: [SMALL, LARGE],
    shares_paise: [{ user_id: SMALL, share_paise: 50000 }, { user_id: LARGE, share_paise: 50000 }],
    timestamp: Date.now(),
  }];
  const members = [{ id: SMALL }, { id: LARGE }];

  const withPaid = deriveBalances(bills, members, [
    { fromUserId: SMALL, toUserId: LARGE, amount_paise: 50000, status: "COMPLETED" },
  ]);
  assert.equal(buildSettlementView(SMALL, withPaid).isSettled, true, "debt is cleared");

  const withVoid = deriveBalances(bills, members, [
    { fromUserId: SMALL, toUserId: LARGE, amount_paise: 50000, status: "VOID" },
  ]);
  assert.equal(buildSettlementView(SMALL, withVoid).isSettled, false, "VOID must not clear a debt");

  const pending = deriveBalances(bills, members, [
    { fromUserId: SMALL, toUserId: LARGE, amount_paise: 20000, status: "PENDING" },
  ]);
  const v = buildSettlementView(SMALL, pending);
  assert.equal(v.isSettled, false, "still outstanding after a partial payment");
  assert.equal(v.netPaise, -30000, "PENDING reduces the balance");
  assert.equal(v.partiallySettled, true, "PENDING marks the debt as settling");
  assert.equal(buildSettlementView(LARGE, pending).partiallySettled, true, "both sides are settling");
});

console.log(`\nsettlementsView tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) {
    console.error(`\n✗ ${f.name}`);
    console.error(f.err.message);
  }
  process.exit(1);
}
