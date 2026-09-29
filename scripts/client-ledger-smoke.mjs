/**
 * Client-side money-path smoke test: imports the actual client ledger.js +
 * money.js (pure modules) and exercises the integer-paise rewrite.
 * Run from repo root: node scripts/client-ledger-smoke.mjs
 */
import assert from "node:assert/strict";
import { netBalances, simplifyDebts, groupTotal, monthlyHistory, normalizeBill } from "../settle-now-android/settle-now/src/lib/ledger.js";
import { toPaise } from "../settle-now-android/settle-now/src/lib/money.js";
import { allocate } from "../settle-now-android/settle-now/src/lib/splitEngine.js";

// ── toPaise ──
assert.equal(toPaise(100), 10000);
assert.equal(toPaise("1250.50"), 125050);
assert.equal(toPaise("1250.500"), NaN); // >2 decimals rejected
assert.equal(toPaise("1250.5"), 125050);
assert.equal(toPaise(99.99), 9999);
assert.equal(toPaise(-5), NaN);

// ── normalizeBill: legacy float bill ──
const legacy = { amount: 100, splitAmongIds: ["u2", "u1", "u3"], payerId: "u1", timestamp: Date.now() };
const nb = normalizeBill(legacy);
assert.equal(nb.amount_paise, 10000);
assert.deepEqual(nb.shares_paise, [
  { user_id: "u1", share_paise: 3334 },
  { user_id: "u2", share_paise: 3333 },
  { user_id: "u3", share_paise: 3333 },
]);

// ── netBalances: legacy float bills → exact integer result ──
const members = [{ id: "u1" }, { id: "u2" }, { id: "u3" }];
const bills = [
  { amount: 100, splitAmongIds: ["u1", "u2", "u3"], payerId: "u1", timestamp: Date.now() },
  { amount: 99.99, splitAmongIds: ["u1", "u2"], payerId: "u2", timestamp: Date.now() },
];
const nets = netBalances(bills, members);
// u1 owes their share of u2's ₹99.99 expense: 9999 paise EQUAL 2-way →
// remainder paise goes to the lexicographically first id (u1) → 5000/4999.
assert.equal(netBalances([{ amount: 99.99, splitAmongIds: ["u1", "u2"], payerId: "u2", timestamp: Date.now() }], [{ id: "u1" }, { id: "u2" }])["u1"], -50);

// exact reconciliation: total nets must cancel to 0
const netSum = Object.values(nets).reduce((a, b) => a + b, 0);
assert.ok(Math.abs(netSum) < 1e-9, `nets must cancel, got ${netSum}`);

// ── netBalances with settlements (paise shape) ──
// u2 pays u1 ₹50 toward u1's positive net (u1 is owed money) → u1's net falls.
const withSettle = netBalances(bills, members, [
  { fromUserId: "u2", toUserId: "u1", amount_paise: 5000 },
]);
assert.equal(withSettle["u1"], nets["u1"] - 50, "settlement must reduce the receiver's net");

// VOID settlements are ignored
const withVoid = netBalances(bills, members, [
  { fromUserId: "u2", toUserId: "u1", amount_paise: 5000, status: "VOID" },
]);
assert.deepEqual(withVoid, nets);

// ── new-shape bill: EXACT + payer excluded (server always sends shares_paise) ──
const exactBill = {
  amount_paise: 100000,
  splitType: "EXACT",
  payerParticipates: false,
  payerId: "u1",
  splitAmongIds: ["u2", "u3"],
  shares_paise: [{ user_id: "u2", share_paise: 60000 }, { user_id: "u3", share_paise: 40000 }],
  timestamp: Date.now(),
};
const nb2 = normalizeBill(exactBill);
assert.equal(nb2.amount_paise, 100000);
assert.ok(!nb2.shares_paise.some((s) => s.user_id === "u1"));
const nets2 = netBalances([exactBill], members);
assert.equal(nets2["u1"], 1000); // credited full ₹1000
assert.equal(nets2["u2"] + nets2["u3"], -1000); // exactly their shares

// EXACT bill with NO shares payload is rejected (null), matching the engine
assert.equal(normalizeBill({ amount_paise: 100000, splitType: "EXACT", splitAmongIds: ["u2"], payerId: "u1", timestamp: Date.now() }), null);

// ── simplifyDebts: deterministic, ≤ n-1 transfers, exact sums ──
const netPaise = { a: -300, b: 200, c: 100 };
const transfers = simplifyDebts(netPaise);
assert.ok(transfers.length <= 2, "at most n-1 transfers");
const totalMoved = transfers.reduce((s, t) => s + t.amount_paise, 0);
assert.equal(totalMoved, 300);
// same input → same output (determinism)
assert.deepEqual(simplifyDebts(netPaise), transfers);

// ── groupTotal / monthlyHistory in paise ──
assert.equal(groupTotal(bills), 199.99);
const now = new Date();
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15).getTime();
const hist = monthlyHistory([{ amount: 250.5, splitAmongIds: ["u1"], payerId: "u1", timestamp: lastMonth }]);
assert.equal(hist.length, 1);
assert.equal(hist[0].label, "Last Month");
assert.equal(hist[0].total, 250.5);

// ── allocate accessible from the client copy ──
assert.equal(allocate({ amountPaise: 100, userIds: ["a", "b", "c"] }).ok, true);

// ── Bill normalisation: shares must resolve for every shape a bill can take
//    on the wire or in localStorage, and must always add up to the amount.
test_shares_resolve_for_every_shape();
function test_shares_resolve_for_every_shape() {
  const ids = ["a", "b", "c"];

  // server-shaped EQUAL bill (shares_paise present)
  const equal = normalizeBill({
    amount_paise: 10000, splitType: "EQUAL", payerId: "a",
    splitAmongIds: ids, timestamp: Date.now(),
  });
  assert.equal(sumShares(equal), 10000);

  // legacy rupee-float bill (no paise, no shares) — sheet must still resolve
  const legacy = normalizeBill({
    amount: 100, splitAmongIds: ids, payerId: "a", timestamp: Date.now(),
  });
  assert.equal(legacy.amount_paise, 10000);
  assert.equal(sumShares(legacy), 10000);

  // EXACT, PERCENT and SHARES with the server's resolved shares
  for (const [type, shares] of [
    ["EXACT", [{ user_id: "a", share_paise: 5000 }, { user_id: "b", share_paise: 3000 }, { user_id: "c", share_paise: 2000 }]],
    ["PERCENT", [{ user_id: "a", share_paise: 3300 }, { user_id: "b", share_paise: 3300 }, { user_id: "c", share_paise: 3400 }]],
    ["SHARES", [{ user_id: "a", share_paise: 2500 }, { user_id: "b", share_paise: 5000 }, { user_id: "c", share_paise: 2500 }]],
  ]) {
    const b = normalizeBill({
      amount_paise: 10000, splitType: type, payerId: "a",
      splitAmongIds: ids, shares_paise: shares, timestamp: Date.now(),
    });
    assert.equal(sumShares(b), 10000, `${type} shares must add up to the amount`);
  }

  // payer excluded: the payer's own row is simply absent
  const excluded = normalizeBill({
    amount_paise: 100000, splitType: "EQUAL", payerId: "a", payerParticipates: false,
    splitAmongIds: ["b", "c"], timestamp: Date.now(),
  });
  assert.ok(!excluded.shares_paise.some((s) => s.user_id === "a"), "payer must not be listed");
  assert.equal(sumShares(excluded), 100000);
}

function sumShares(b) {
  return b.shares_paise.reduce((s, x) => s + x.share_paise, 0);
}

console.log("client money-path smoke: all assertions passed");
