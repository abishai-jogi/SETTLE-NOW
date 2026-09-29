import assert from "node:assert/strict";
import { allocate, SPLIT_TYPES } from "../src/lib/splitEngine.js";

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push({ name, err });
  }
}

const sharesOf = (r) => r.shares.map((s) => s.share_paise);
const idsOf = (r) => r.shares.map((s) => s.user_id);
const sum = (r) => sharesOf(r).reduce((a, b) => a + b, 0);

/* ── Case 1: EQUAL 10000 / 3 → [3334, 3333, 3333], remainder to lex-first ── */
test("1. EQUAL 10000/3 → remainder to lexicographically first id", () => {
  const r = allocate({ amountPaise: 10000, userIds: ["u1", "u2", "u3"], type: "EQUAL" });
  assert.equal(r.ok, true);
  assert.deepEqual(sharesOf(r), [3334, 3333, 3333]);
  assert.deepEqual(idsOf(r), ["u1", "u2", "u3"]); // sorted
  assert.equal(sum(r), 10000);
});

/* ── Case 2: EQUAL 100 / 3 → [34, 33, 33] ────────────────────────────────── */
test("2. EQUAL 100/3 → [34, 33, 33]", () => {
  const r = allocate({ amountPaise: 100, userIds: ["u1", "u2", "u3"], type: "EQUAL" });
  assert.equal(r.ok, true);
  assert.deepEqual(sharesOf(r), [34, 33, 33]);
  assert.equal(sum(r), 100);
});

/* ── Case 3: EQUAL is order-independent ──────────────────────────────────── */
test("3. EQUAL order-independence: shuffled userIds → identical output", () => {
  const base = allocate({ amountPaise: 987654, userIds: ["u1", "u2", "u3"], type: "EQUAL" });
  for (const perm of [
    ["u3", "u2", "u1"],
    ["u2", "u3", "u1"],
    ["u1", "u3", "u2"],
  ]) {
    const r = allocate({ amountPaise: 987654, userIds: perm, type: "EQUAL" });
    assert.equal(r.ok, true);
    assert.deepEqual(r, base);
  }
});

/* ── Case 4: EQUAL 0 paise → rejected ZERO_AMOUNT ────────────────────────── */
test("4. EQUAL 0 paise → rejected ZERO_AMOUNT", () => {
  const r = allocate({ amountPaise: 0, userIds: ["u1", "u2"], type: "EQUAL" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "ZERO_AMOUNT");
});

/* ── Case 5: EXACT summing to 10000 accepted verbatim ────────────────────── */
test("5. EXACT summing to 10000 → accepted verbatim", () => {
  const r = allocate({
    amountPaise: 10000,
    userIds: ["u1", "u2"],
    type: "EXACT",
    shares: [
      { user_id: "u1", amount_paise: 7777 },
      { user_id: "u2", amount_paise: 2223 },
    ],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(sharesOf(r), [7777, 2223]);
});

/* ── Case 6: EXACT summing to 9999 → rejected ────────────────────────────── */
test("6. EXACT summing to 9999 → rejected EXACT_SUM_MISMATCH", () => {
  const r = allocate({
    amountPaise: 10000,
    userIds: ["u1", "u2"],
    type: "EXACT",
    shares: [
      { user_id: "u1", amount_paise: 7777 },
      { user_id: "u2", amount_paise: 2222 },
    ],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "EXACT_SUM_MISMATCH");
});

/* ── Case 7: PERCENT 33/33/34 of 10000 → [3300, 3300, 3400] ─────────────── */
test("7. PERCENT 33/33/34 of 10000 → [3300, 3300, 3400]", () => {
  const r = allocate({
    amountPaise: 10000,
    userIds: ["u1", "u2", "u3"],
    type: "PERCENT",
    shares: [
      { user_id: "u1", percent: 33 },
      { user_id: "u2", percent: 33 },
      { user_id: "u3", percent: 34 },
    ],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(sharesOf(r), [3300, 3300, 3400]);
  assert.equal(sum(r), 10000);
});

/* ── Case 8: PERCENT 50/50 of 9999 → [5000, 4999] — odd paise not lost ──── */
test("8. PERCENT 50/50 of 9999 → [5000, 4999]", () => {
  const r = allocate({
    amountPaise: 9999,
    userIds: ["u1", "u2"],
    type: "PERCENT",
    shares: [
      { user_id: "u1", percent: 50 },
      { user_id: "u2", percent: 50 },
    ],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(sharesOf(r), [5000, 4999]); // tie broken by lex user_id
  assert.equal(sum(r), 9999);
});

/* ── Case 9: SHARES 1/2/1 of 10000 → [2500, 5000, 2500] ─────────────────── */
test("9. SHARES 1/2/1 of 10000 → [2500, 5000, 2500]", () => {
  const r = allocate({
    amountPaise: 10000,
    userIds: ["u1", "u2", "u3"],
    type: "SHARES",
    shares: [
      { user_id: "u1", weight: 1 },
      { user_id: "u2", weight: 2 },
      { user_id: "u3", weight: 1 },
    ],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(sharesOf(r), [2500, 5000, 2500]);
});

/* ── Case 10: 500-case randomised sweep — sum invariant + safe integers ─── */
test("10. randomised sweep (500 cases): sum invariant 100%, all safe ints", () => {
  let seed = 0x2f6e2b1;
  const rand = () => {
    // xorshift — deterministic
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 0x100000000;
  };
  const alphabet = "abcdefgh1234567890-";
  const randId = (i) => {
    let s = "";
    for (let k = 0; k < 12; k++) s += alphabet[Math.floor(rand() * alphabet.length)];
    return `${s}-${i}`;
  };

  for (let c = 0; c < 500; c++) {
    const amountPaise = Math.floor(rand() * 10_000_000) + 1; // 1..10^7
    const n = 1 + Math.floor(rand() * 12); // 1..12
    const userIds = Array.from({ length: n }, (_, i) => randId(i));
    const type = SPLIT_TYPES[Math.floor(rand() * 4)];
    let shares;
    if (type === "EXACT") {
      // build a payload guaranteed to sum correctly via EQUAL then perturb 50%
      const eq = allocate({ amountPaise, userIds, type: "EQUAL" });
      if (!eq.ok) throw new Error(`fixture gen failed: ${eq.message}`);
      shares = eq.shares.map(({ user_id, share_paise }) => ({ user_id, amount_paise: share_paise }));
      if (rand() < 0.5) shares[Math.floor(rand() * shares.length)].amount_paise = Math.max(0, shares[0].amount_paise - 1);
    } else if (type === "PERCENT") {
      shares = userIds.map((user_id) => ({ user_id, percent: rand() * 100 }));
    } else if (type === "SHARES") {
      shares = userIds.map((user_id) => ({ user_id, weight: 0.1 + rand() * 10 }));
    }
    const r = allocate({ amountPaise, userIds, type, shares });

    if (type === "EXACT" && r.ok === false) {
      assert.equal(r.code, "EXACT_SUM_MISMATCH");
      continue; // deliberately-mismatched EXACT fixtures are the only allowed failures
    }
    assert.equal(r.ok, true, `case ${c} ${type} failed: ${r.message}`);
    assert.equal(sum(r), amountPaise, `case ${c} ${type}: sum invariant violated`);
    for (const s of r.shares) {
      assert.ok(Number.isSafeInteger(s.share_paise), `case ${c}: share not a safe integer`);
      assert.ok(s.share_paise >= 0, `case ${c}: negative share`);
    }
  }
});

/* ── Case 11: determinism — same input 100× → byte-identical ────────────── */
test("11. determinism: same input run 100× produces identical output", () => {
  const input = {
    amountPaise: 9_123_456,
    userIds: ["user-b", "user-a", "user-c", "user-d", "user-e", "user-f", "user-g"],
    type: "PERCENT",
    shares: [
      { user_id: "user-a", percent: 12.5 },
      { user_id: "user-b", percent: 0.1 },
      { user_id: "user-c", percent: 33.33 },
      { user_id: "user-d", percent: 33.33 },
      { user_id: "user-e", percent: 10 },
      { user_id: "user-f", percent: 9.99 },
      { user_id: "user-g", percent: 0.75 },
    ],
  };
  const first = JSON.stringify(allocate(input));
  for (let i = 0; i < 100; i++) {
    assert.equal(JSON.stringify(allocate(input)), first, "output diverged on repeat");
  }
});

/* ── Additional invariants beyond the brief ──────────────────────────────── */
test("EXACT: zero shares allowed if they sum correctly", () => {
  const r = allocate({
    amountPaise: 100,
    userIds: ["a", "b", "c"],
    type: "EXACT",
    shares: [
      { user_id: "a", amount_paise: 100 },
      { user_id: "b", amount_paise: 0 },
      { user_id: "c", amount_paise: 0 },
    ],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(sharesOf(r), [100, 0, 0]);
});

test("no participants → NO_PARTICIPANTS", () => {
  const r = allocate({ amountPaise: 100, userIds: [], type: "EQUAL" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "NO_PARTICIPANTS");
});

test("duplicate participant → DUPLICATE_USER", () => {
  const r = allocate({ amountPaise: 100, userIds: ["a", "a"], type: "EQUAL" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "DUPLICATE_USER");
});

test("invalid split type → INVALID_SPLIT_TYPE", () => {
  const r = allocate({ amountPaise: 100, userIds: ["a"], type: "WEIRD" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "INVALID_SPLIT_TYPE");
});

test("participant missing from shares[] → rejected", () => {
  const r = allocate({
    amountPaise: 1000,
    userIds: ["a", "b"],
    type: "PERCENT",
    shares: [{ user_id: "a", percent: 100 }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "MISSING_SHARE_FOR_PARTICIPANT");
});

test("PERCENT totals ≠ 100 still scale to the amount", () => {
  const r = allocate({
    amountPaise: 10000,
    userIds: ["a", "b"],
    type: "PERCENT",
    shares: [
      { user_id: "a", percent: 60 },
      { user_id: "b", percent: 60 },
    ],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(sharesOf(r), [5000, 5000]);
  assert.equal(sum(r), 10000);
});

test("payer not participating is just a participant list change", () => {
  // ₹1000 (100000p) split between 4 others, payer pays all
  const r = allocate({ amountPaise: 100000, userIds: ["p2", "p3", "p4", "p5"], type: "EQUAL" });
  assert.equal(r.ok, true);
  assert.equal(sum(r), 100000);
  assert.deepEqual(sharesOf(r), [25000, 25000, 25000, 25000]);
});

/* ── summary ─────────────────────────────────────────────────────────────── */
console.log(`\nsplitEngine tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) {
    console.error(`\n✗ ${f.name}`);
    console.error(f.err.message);
    if (f.err.stack) console.error(f.err.stack.split("\n")[1]);
  }
  process.exit(1);
}
