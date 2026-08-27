# Settle Now — Sync Backend (Phase 2/3)

Node.js + Express + PostgreSQL. Stateless REST sync: clients drain their local outbox via push, then pull changes newer than their per-entity cursors.

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

### POST /api/sync/push

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
