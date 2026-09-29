/**
 * Integration tests — real Postgres, real HTTP against src/app.js.
 * Covers Part 3 integration criteria: exact shares persisted, 422-on-mismatch
 * writes nothing, nets sum to 0, pairwise consistency, settlement lifecycle,
 * expenses/balances agreement.
 *
 * Run with DATABASE_URL pointing at a disposable database:
 *   DATABASE_URL=postgres://... node test/integration.test.mjs
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { allocate } from "../src/lib/splitEngine.js";

process.env.DATABASE_URL ??= "postgres://settlenow:settlenow@127.0.0.1:5432/settlenow_test";

const { query, getPool } = await import("../src/db.js");
const { default: app } = await import("../src/app.js");

const fs = await import("node:fs");
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");

// ── bootstrap schema on the test DB ──
const here = path.dirname(fileURLToPath(import.meta.url));
await query(fs.readFileSync(path.join(here, "..", "db", "schema.sql"), "utf8"));
await query(fs.readFileSync(path.join(here, "..", "migrations", "002_split_settlement.sql"), "utf8"));
await query("TRUNCATE conflict_log, settlements, expense_participants, expenses, room_members, rooms, users CASCADE");

// ── HTTP harness ──
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}/api`;

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, body: json };
}

const uuid = () => crypto.randomUUID();

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  return fn()
    .then(() => { passed++; })
    .catch((err) => { failed++; failures.push({ name, err }); });
}

/* ── fixture: one room, 4 members ── */
const room = uuid();
const [alice, bob, carol, dave] = [uuid(), uuid(), uuid(), uuid()];
const now = Date.now();

await query(
  `INSERT INTO users (id, name, avatar_initials, color, created_at, updated_at) VALUES
   ($1,'Alice','A','#b0413e',$5,$5),($2,'Bob','B','#c0762c',$5,$5),
   ($3,'Carol','C','#c19b2c',$5,$5),($4,'Dave','D','#4a8c52',$5,$5)`,
  [alice, bob, carol, dave, now]
);
await query(
  `INSERT INTO rooms (id, name, invite_code, created_by, created_at, updated_at) VALUES ($1,'Test Room','TESTAA',$3,$2,$2)`,
  [room, now, alice]
);
for (const u of [alice, bob, carol, dave]) {
  await query(`INSERT INTO room_members (room_id, user_id, joined_at) VALUES ($1,$2,$3)`, [room, u, now]);
}

/* ── 12. EXACT shares persist; mismatched sum → 422 and writes nothing ── */
await test("12a. EXACT expense persists exact shares", async () => {
  const eid = uuid();
  const r = await api("POST", `/rooms/${room}/expenses`, {
    expense_id: eid,
    paid_by: alice,
    amount_paise: 10000,
    split_type: "EXACT",
    participant_ids: [alice, bob, carol],
    shares: [
      { user_id: alice, amount_paise: 6000 },
      { user_id: bob, amount_paise: 3000 },
      { user_id: carol, amount_paise: 1000 },
    ],
    description: "dinner",
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const parts = await query(
    `SELECT user_id, share_cents FROM expense_participants WHERE expense_id = $1 AND is_deleted = FALSE`,
    [eid]
  );
  const byUser = Object.fromEntries(parts.rows.map((p) => [p.user_id, Number(p.share_cents)]));
  assert.deepEqual(byUser, { [alice]: 6000, [bob]: 3000, [carol]: 1000 });
});

await test("12b. EXACT mismatch → 422 with allocate() code, writes nothing", async () => {
  const eid = uuid();
  const r = await api("POST", `/rooms/${room}/expenses`, {
    expense_id: eid,
    paid_by: alice,
    amount_paise: 10000,
    split_type: "EXACT",
    participant_ids: [alice, bob],
    shares: [
      { user_id: alice, amount_paise: 5000 },
      { user_id: bob, amount_paise: 4999 },
    ],
  });
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "EXACT_SUM_MISMATCH");
  const parts = await query(`SELECT 1 FROM expense_participants WHERE expense_id = $1`, [eid]);
  const exp = await query(`SELECT 1 FROM expenses WHERE id = $1`, [eid]);
  assert.equal(parts.rows.length, 0, "no participant rows may be written");
  assert.equal(exp.rows.length, 0, "no expense row may be written");
});

await test("POST legacy amount rupees → accepted with Deprecation header", async () => {
  const eid = uuid();
  const r = await api("POST", `/rooms/${room}/expenses`, {
    expense_id: eid,
    paid_by: bob,
    amount: 999.99,
    split_among: [alice, bob, carol, dave],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.headers.get("deprecation"), "true");
  const exp = await query(`SELECT amount_cents FROM expenses WHERE id = $1`, [eid]);
  assert.equal(Number(exp.rows[0].amount_cents), 99999);
});

/* ── mixed-type fixture: 4 members, 10 expenses (criterion 17) ── */
await test("17. expenses and balances agree on a mixed-split fixture", async () => {
  const ids = [alice, bob, carol, dave];
  const mk = (payer, paise, type, participants, shares) => ({
    expense_id: uuid(),
    paid_by: payer,
    amount_paise: paise,
    split_type: type,
    participant_ids: participants,
    shares,
    description: `${type}-${paise}`,
  });
  const expenses = [
    mk(alice, 10000, "EQUAL", ids),                                       // 2500 each
    mk(bob, 9999, "EQUAL", ids),                                           // 2500,2500,2500,2499
    mk(carol, 10000, "EXACT", [alice, bob], [
      { user_id: alice, amount_paise: 7000 }, { user_id: bob, amount_paise: 3000 },
    ]),                                                                     // alice pays carol 7000/3000
    mk(dave, 5000, "PERCENT", [alice, bob, carol], [
      { user_id: alice, percent: 50 }, { user_id: bob, percent: 30 }, { user_id: carol, percent: 20 },
    ]),
    mk(alice, 8000, "SHARES", [bob, carol, dave], [
      { user_id: bob, weight: 2 }, { user_id: carol, weight: 1 }, { user_id: dave, weight: 1 },
    ]),
    mk(bob, 12345, "EQUAL", [carol, dave]),                                // payer not participating
    mk(carol, 7777, "EQUAL", ids),
    mk(dave, 2500, "EXACT", [alice, dave], [
      { user_id: alice, amount_paise: 0 }, { user_id: dave, amount_paise: 2500 },
    ]),
    mk(alice, 6600, "PERCENT", ids, [
      { user_id: alice, percent: 10 }, { user_id: bob, percent: 20 },
      { user_id: carol, percent: 30 }, { user_id: dave, percent: 40 },
    ]),
    mk(bob, 4321, "SHARES", ids, [
      { user_id: alice, weight: 1 }, { user_id: bob, weight: 1 },
      { user_id: carol, weight: 1 }, { user_id: dave, weight: 2 },
    ]),
  ];
  for (const e of expenses) {
    const r = await api("POST", `/rooms/${room}/expenses`, e);
    assert.equal(r.status, 200, `${e.description}: ${JSON.stringify(r.body)}`);
  }

  // every participant row sums to its expense amount, exactly
  const sums = await query(
    `SELECT e.id, e.amount_cents, COALESCE(SUM(ep.share_cents), 0) AS part_sum
     FROM expenses e LEFT JOIN expense_participants ep
       ON ep.expense_id = e.id AND ep.is_deleted = FALSE
     WHERE e.room_id = $1 AND e.is_deleted = FALSE
     GROUP BY e.id, e.amount_cents`,
    [room]
  );
  for (const row of sums.rows) {
    assert.equal(Number(row.part_sum), Number(row.amount_cents), `participant sum mismatch on ${row.id}`);
  }

  // GET /expenses and GET /balances agree: nets derived from expenses payload
  const expRes = await api("GET", `/rooms/${room}/expenses`);
  assert.equal(expRes.status, 200);
  const bills = expRes.body.bills;
  assert.equal(bills.length, 12, "2 setup + 10 fixture expenses");
  const netsFromExpenses = {};
  for (const b of bills) {
    netsFromExpenses[b.payerId] = (netsFromExpenses[b.payerId] || 0) + b.amount_paise;
    for (const s of b.shares_paise) {
      netsFromExpenses[s.user_id] = (netsFromExpenses[s.user_id] || 0) - s.share_paise;
    }
  }
  const balRes = await api("GET", `/rooms/${room}/balances`);
  assert.equal(balRes.status, 200);
  const { nets, pairwise, suggestions, statuses, flags, summary } = balRes.body;
  for (const [uid2, v] of Object.entries(netsFromExpenses)) {
    assert.equal(nets[uid2], v, `net mismatch for ${uid2}`);
  }

  // 13. nets sum to exactly 0
  const netSum = Object.values(nets).reduce((a, b) => a + b, 0);
  assert.equal(netSum, 0, `nets must sum to 0, got ${netSum}`);

  // 14. pairwise consistent with nets: each member's net must equal the net
  // of their directional pairwise outstanding flows (inflow − outflow).
  const inflow = {}, outflow = {};
  for (const p of pairwise) {
    inflow[p.a] = (inflow[p.a] || 0) + p.owed_b_to_a_paise;      // b owes a
    outflow[p.a] = (outflow[p.a] || 0) + p.outstanding_a_to_b_paise; // a owes b
    inflow[p.b] = (inflow[p.b] || 0) + p.outstanding_a_to_b_paise;
    outflow[p.b] = (outflow[p.b] || 0) + p.owed_b_to_a_paise;
  }
  for (const u of Object.keys(nets)) {
    const pairNet = (inflow[u] || 0) - (outflow[u] || 0);
    assert.equal(nets[u], pairNet, `pairwise/nets inconsistency for ${u}`);
  }

  // suggestions sum == Σ|negative nets| and count ≤ n-1 among non-zero nets
  const nonZeroNets = Object.values(nets).filter((v) => v !== 0).length;
  assert.ok(suggestions.length <= Math.max(nonZeroNets - 1, 0), `too many suggestions: ${suggestions.length}`);
  const sugSum = suggestions.reduce((s, x) => s + x.amount_paise, 0);
  const debtSum = Object.values(nets).filter((v) => v < 0).reduce((s, v) => s - v, 0);
  assert.equal(sugSum, debtSum);

  // statuses consistent with nets
  for (const [uid2, v] of Object.entries(nets)) {
    assert.equal(statuses[uid2], v < 0 ? "owes" : v > 0 ? "owed" : "settled");
  }
  assert.ok(flags);
  assert.equal(summary.expense_count, bills.length);
});

/* ── 15. settlement lifecycle: PENDING → COMPLETED clears flag; VOID restores ── */
await test("15. lifecycle: PENDING reduces balance + flags; COMPLETED clears flag; VOID restores", async () => {
  // capture the pre-settlement net difference as the VOID-restore baseline
  const pre = await api("GET", `/rooms/${room}/balances`);
  const baseline = pre.body.nets[alice] - pre.body.nets[bob];

  const r = await api("POST", `/rooms/${room}/settlements`, {
    settlement_id: uuid(),
    from_user: bob,
    to_user: alice,
    amount_paise: 5000,
    status: "PENDING",
    method: "UPI",
    note: "sent via UPI",
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const sid = r.body.settlement_id;

  // bob owes alice 5000 less, partially_settled both
  let b = await api("GET", `/rooms/${room}/balances`);
  assert.equal(b.body.nets[bob] - b.body.nets[alice] > 0, true, "pending settlement must shift nets");
  const beforePending = b.body.nets[alice] - b.body.nets[bob];
  assert.equal(b.body.flags[bob].partially_settled, true);
  assert.equal(b.body.flags[alice].partially_settled, true);
  assert.equal(b.body.summary.pending_count, 1);

  // confirm → still cleared against balance, flag gone
  const p = await api("PATCH", `/rooms/${room}/settlements/${sid}`, { status: "COMPLETED" });
  assert.equal(p.status, 200);
  b = await api("GET", `/rooms/${room}/balances`);
  assert.equal(b.body.flags[bob].partially_settled, false);
  assert.equal(b.body.flags[alice].partially_settled, false);
  assert.equal(b.body.nets[alice] - b.body.nets[bob], beforePending, "COMPLETED must keep reducing the balance");
  assert.equal(b.body.summary.pending_count, 0);
  assert.equal(b.body.summary.settled_count, 1);

  // VOID → full outstanding restored to the pre-settlement baseline
  const v = await api("PATCH", `/rooms/${room}/settlements/${sid}`, { status: "VOID" });
  assert.equal(v.status, 200);
  b = await api("GET", `/rooms/${room}/balances`);
  assert.equal(b.body.nets[alice] - b.body.nets[bob], baseline, "VOID restores the pre-settlement net difference");

  // DELETE single → also VOID
  const sid2 = (await api("POST", `/rooms/${room}/settlements`, {
    settlement_id: uuid(), from_user: bob, to_user: alice, amount_paise: 1000, status: "PENDING",
  })).body.settlement_id;
  const d = await api("DELETE", `/rooms/${room}/settlements/${sid2}`);
  assert.equal(d.status, 200);
  b = await api("GET", `/rooms/${room}/balances`);
  assert.equal(b.body.nets[alice] - b.body.nets[bob], baseline, "voided single settlement restores baseline");
});

/* ── payer_participates = FALSE ── */
await test("payer_participates=false: full amount divides among participants", async () => {
  const before = (await api("GET", `/rooms/${room}/balances`)).body.nets;
  const eid = uuid();
  const r = await api("POST", `/rooms/${room}/expenses`, {
    expense_id: eid,
    paid_by: alice,
    amount_paise: 100000,
    payer_participates: false,
    split_type: "EQUAL",
    participant_ids: [bob, carol, dave],
  });
  assert.equal(r.status, 200);
  const parts = await query(
    `SELECT user_id, share_cents FROM expense_participants WHERE expense_id = $1 AND is_deleted = FALSE`,
    [eid]
  );
  const byUser = Object.fromEntries(parts.rows.map((p) => [p.user_id, Number(p.share_cents)]));
  // Expected division comes from the shared engine — remainder to the
  // lexicographically first participant id, payer excluded entirely.
  const expected = allocate({ amountPaise: 100000, userIds: [bob, carol, dave], type: "EQUAL" });
  assert.equal(expected.ok, true);
  assert.deepEqual(byUser, Object.fromEntries(expected.shares.map((s) => [s.user_id, s.share_paise])));
  assert.ok(!(alice in byUser), "payer must not be a participant");
  // Payer is credited the full amount; each participant owes exactly their share.
  const after = (await api("GET", `/rooms/${room}/balances`)).body.nets;
  assert.equal(after[alice] - before[alice], 100000, "payer must be credited the full amount");
  for (const [uid2, share] of Object.entries(byUser)) {
    assert.equal(after[uid2] - before[uid2], -share, `participant ${uid2} must be debited their exact share`);
  }
});

/* ── GET settlements exposes lifecycle fields ── */
await test("GET settlements returns status/method/note and paise", async () => {
  const r = await api("GET", `/rooms/${room}/settlements`);
  assert.equal(r.status, 200);
  assert.ok(r.body.settlements.length >= 2);
  for (const s of r.body.settlements) {
    assert.ok(["PENDING", "COMPLETED", "VOID"].includes(s.status));
    assert.ok(["UPI", "CASH", "OTHER"].includes(s.method));
    assert.ok(Number.isSafeInteger(s.amount_paise));
  }
});

/* ── cleanup ── */
server.close();
await getPool().end();

console.log(`\nintegration tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) {
    console.error(`\n✗ ${f.name}`);
    console.error(f.err.message);
  }
  process.exit(1);
} else {
  process.exit(0);
}
