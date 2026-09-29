# Settle Now — Backend

Node.js + Express + PostgreSQL. Single REST surface (`src/routes/rooms.js`):
rooms, expenses (EQUAL/EXACT/PERCENT/SHARES via the shared `src/lib/splitEngine.js`,
integer paise), server-authoritative balances (`nets`, `pairwise`, `suggestions`,
`statuses`, `flags`), and settlements with a real lifecycle (PENDING/COMPLETED/VOID).

The former cursor-based `/api/sync/push` + `/api/sync/pull` routes were removed —
no client ever called them (verified: no fetch to either path existed in any
frontend). The `conflict_log` table remains in the schema but is no longer
written to; dropping it is a separate decision.

## Money representation

All API amounts are **integer paise** (`amount_paise`, `share_paise`,
`net_paise` …). Legacy `amount` (rupee float) inputs are still accepted on
`POST /rooms/:id/expenses` and `POST /rooms/:id/settlements` for one release
and answered with a `Deprecation` header.

## Run

```bash
createdb settlenow                      # or use an existing database
psql -d settlenow -f db/schema.sql
cp .env.example .env                    # adjust DATABASE_URL if needed
npm install
npm start                               # http://localhost:4000
```

`GET /health` → `{ ok: true }`

## API

### POST /api/rooms/:id/expenses

```jsonc
{
  "expense_id": "uuid",          // client-generated; idempotent upsert
  "paid_by": "uuid",
  "amount_paise": 125000,        // ₹1250.00 in paise (integer)
  "payer_participates": true,    // false → full amount divided among participants
  "split_type": "EQUAL",         // EQUAL | EXACT | PERCENT | SHARES
  "participant_ids": ["uuid"],   // used by EQUAL
  "shares": [                    // used by EXACT / PERCENT / SHARES
    { "user_id": "uuid", "amount_paise": 62500 },   // EXACT: must sum to amount_paise
    { "user_id": "uuid", "percent": 40 },           // PERCENT: scaled to the amount
    { "user_id": "uuid", "weight": 2 }              // SHARES: weight-based
  ],
  "description": "Hotel room"
}
```

All division is delegated to the shared `allocate()` in `src/lib/splitEngine.js`.
Rejections answer `422` with `{ error: code, code, message }` (e.g.
`EXACT_SUM_MISMATCH`, `NO_PARTICIPANTS`, `ZERO_AMOUNT`) and write nothing.

### GET /api/rooms/:id/balances

The **only** source of truth for balances — the client never recomputes them.

```jsonc
{
  "summary": { "total_paise": 0, "expense_count": 0, "settled_count": 0, "pending_count": 0 },
  "nets":     { "<userId>": 0 },        // integer paise, + = owed money; Σ nets == 0 always
  "statuses": { "<userId>": "settled" }, // owes | owed | settled
  "flags":    { "<userId>": { "partially_settled": false } },
  "pairwise": [ { "a": "…", "b": "…", "owed_a_to_b_paise": 0, "settled_ab_paise": 0, "outstanding_a_to_b_paise": 0 } ],
  "suggestions": [ { "from": "…", "to": "…", "amount_paise": 0 } ]
}
```

### POST /api/rooms/:id/settlements

```jsonc
{
  "settlement_id": "uuid",
  "from_user": "uuid", "to_user": "uuid",
  "amount_paise": 50000,
  "status": "PENDING",           // default COMPLETED
  "method": "UPI",               // UPI | CASH | OTHER (default OTHER)
  "note": "for the taxi"
}
```

Lifecycle: `PATCH /api/rooms/:id/settlements/:sid` with `{ "status": "COMPLETED" | "VOID" }`
transitions a PENDING settlement; `DELETE /api/rooms/:id/settlements/:sid` voids one
(soft). The bulk `DELETE /api/rooms/:id/settlements` (reset action) is unchanged.

Legacy docs from the removed sync surface are retained below for reference.

---

### POST /api/sync/push (REMOVED)

The cursor-based sync surface was deleted; see the header note above.

```jsonc
{
  "operations": [
    {
      "entity_type": "expense",          // user | room | room_member | expense | expense_participant | settlement
      "entity_id": "uuid",
      "operation": "create",             // create | update | delete (delete = is_deleted flag upsert)
      "payload": { "id": "uuid", "...": "..." }
    }
  ]
}
```

Response: `{ server_time_ms, results: [{ entity_type, entity_id, status }] }`
Statuses: `applied` · `conflict_lww` (a same-or-newer version existed; the losing write was recorded server-side in `conflict_log` and `winner_updated_at` is returned) · `rejected` (unknown type/bad payload) · `error`.

Semantics:
- Idempotent upserts keyed by UUID (composite keys for `room_members`, `expense_participants`)
- Last-write-wins on `updated_at` (`WHERE table.updated_at <= EXCLUDED.updated_at`); displaced writes go to `conflict_log`, never silently dropped
- An `expense` payload with `participant_ids[]` auto-expands into equal-split `expense_participants` rows using the same remainder-to-sorted-ids rule as the Android client

### POST /api/rooms/join

```jsonc
{ "invite_code": "AB3C5D", "user_id": "uuid", "user_name": "Sam", "avatar_initials": "S" }
```

The one online-required flow. Looks up the room by code, upserts the joining user, enforces the 10-member cap, and creates the membership. Returns `{ room: { id, name }, members: [...] }`. Errors: `404 room_not_found`, `409 room_full`.

### POST /api/sync/pull

```jsonc
{
  "my_user_id": "uuid",
  "cursors": { "users": 0, "rooms": 0, "room_members": 0, "expenses": 0, "expense_participants": 0, "settlements": 0 }
}
```

Response: `{ server_time_ms, changes: { users: [...], rooms: [...], ... } }`

All rows are scoped to rooms the caller belongs to; each list contains only rows whose cursor column (`updated_at`, `joined_at` for members) is greater than the client's cursor, oldest first, capped per batch.
