import { Router } from "express";
import { query } from "../db.js";

const router = Router();

const ENTITY_TYPES = new Set([
    "user",
    "room",
    "room_member",
    "expense",
    "expense_participant",
    "settlement",
]);

// ---------------------------------------------------------------------------
// PUSH — drain a device's outbox. Every operation is an idempotent upsert with
// last-write-wins on updated_at. Phase 3 will log losing writes to
// conflict_log instead of silently dropping them.
// ---------------------------------------------------------------------------

function upsertFor(entityType, payload) {
    const now = payload.updated_at ?? Date.now();
    switch (entityType) {
        case "user":
            return {
                sql: `INSERT INTO users (id, name, avatar_initials, color, password_hash, salt, created_at, updated_at, is_deleted)
                      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                      ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        avatar_initials = EXCLUDED.avatar_initials,
                        color = EXCLUDED.color,
                        password_hash = EXCLUDED.password_hash,
                        salt = EXCLUDED.salt,
                        created_at = EXCLUDED.created_at,
                        updated_at = EXCLUDED.updated_at,
                        is_deleted = EXCLUDED.is_deleted
                      WHERE users.updated_at <= EXCLUDED.updated_at`,
                params: [
                    payload.id, payload.name, payload.avatar_initials,
                    payload.color ?? "#3a3733", payload.password_hash ?? "", payload.salt ?? "",
                    payload.created_at, now, !!payload.is_deleted,
                ],
            };
        case "room":
            return {
                sql: `INSERT INTO rooms (id, name, invite_code, created_by, created_at, updated_at, is_deleted)
                      VALUES ($1,$2,$3,$4,$5,$6,$7)
                      ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        invite_code = EXCLUDED.invite_code,
                        created_by = EXCLUDED.created_by,
                        created_at = EXCLUDED.created_at,
                        updated_at = EXCLUDED.updated_at,
                        is_deleted = EXCLUDED.is_deleted
                      WHERE rooms.updated_at <= EXCLUDED.updated_at`,
                params: [payload.id, payload.name, payload.invite_code, payload.created_by, payload.created_at, now, !!payload.is_deleted],
            };
        case "room_member":
            return {
                sql: `INSERT INTO room_members (room_id, user_id, joined_at, is_deleted)
                      VALUES ($1,$2,$3,$4)
                      ON CONFLICT (room_id, user_id) DO UPDATE SET
                        joined_at = EXCLUDED.joined_at,
                        is_deleted = EXCLUDED.is_deleted`,
                params: [payload.room_id, payload.user_id, payload.joined_at, !!payload.is_deleted],
            };
        case "expense":
            return {
                sql: `INSERT INTO expenses (id, room_id, paid_by, amount_cents, description, split_type, created_at, updated_at, is_deleted)
                      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                      ON CONFLICT (id) DO UPDATE SET
                        room_id = EXCLUDED.room_id,
                        paid_by = EXCLUDED.paid_by,
                        amount_cents = EXCLUDED.amount_cents,
                        description = EXCLUDED.description,
                        split_type = EXCLUDED.split_type,
                        created_at = EXCLUDED.created_at,
                        updated_at = EXCLUDED.updated_at,
                        is_deleted = EXCLUDED.is_deleted
                      WHERE expenses.updated_at <= EXCLUDED.updated_at`,
                params: [
                    payload.id, payload.room_id, payload.paid_by, payload.amount_cents,
                    payload.description ?? "", payload.split_type ?? "EQUAL",
                    payload.created_at, now, !!payload.is_deleted,
                ],
            };
        case "expense_participant":
            return {
                sql: `INSERT INTO expense_participants (expense_id, user_id, share_cents, updated_at, is_deleted)
                      VALUES ($1,$2,$3,$4,$5)
                      ON CONFLICT (expense_id, user_id) DO UPDATE SET
                        share_cents = EXCLUDED.share_cents,
                        updated_at = EXCLUDED.updated_at,
                        is_deleted = EXCLUDED.is_deleted
                      WHERE expense_participants.updated_at <= EXCLUDED.updated_at`,
                params: [payload.expense_id, payload.user_id, payload.share_cents, now, !!payload.is_deleted],
            };
        case "settlement":
            return {
                sql: `INSERT INTO settlements (id, room_id, from_user, to_user, amount_cents, created_at, updated_at, is_deleted)
                      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                      ON CONFLICT (id) DO UPDATE SET
                        room_id = EXCLUDED.room_id,
                        from_user = EXCLUDED.from_user,
                        to_user = EXCLUDED.to_user,
                        amount_cents = EXCLUDED.amount_cents,
                        created_at = EXCLUDED.created_at,
                        updated_at = EXCLUDED.updated_at,
                        is_deleted = EXCLUDED.is_deleted
                      WHERE settlements.updated_at <= EXCLUDED.updated_at`,
                params: [
                    payload.id, payload.room_id, payload.from_user, payload.to_user,
                    payload.amount_cents, payload.created_at, now, !!payload.is_deleted,
                ],
            };
        default:
            return null;
    }
}

const SINGLE_PK_TABLES = {
    user: "users",
    room: "rooms",
    expense: "expenses",
    settlement: "settlements",
};

async function logConflict(entityType, entityId, operation, payload, loserUpdatedAt) {
    const winner = await query(
        `SELECT updated_at FROM ${SINGLE_PK_TABLES[entityType]} WHERE id = $1`,
        [payload.id]
    );
    const winnerUpdatedAt = winner.rows[0]?.updated_at ?? null;
    await query(
        `INSERT INTO conflict_log
             (entity_type, entity_id, loser_operation, loser_payload,
              loser_updated_at, winner_updated_at, logged_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
            entityType, entityId, operation ?? "update", JSON.stringify(payload),
            loserUpdatedAt ?? null, winnerUpdatedAt, Date.now(),
        ]
    );
    return winnerUpdatedAt;
}

router.post("/sync/push", async (req, res) => {
    const operations = req.body?.operations;
    if (!Array.isArray(operations)) {
        return res.status(400).json({ error: "operations array required" });
    }

    const results = [];
    for (const op of operations) {
        try {
            if (!ENTITY_TYPES.has(op.entity_type) || !op.payload) {
                results.push({ entity_type: op.entity_type, entity_id: op.entity_id, status: "rejected" });
                continue;
            }

            let payload = op.payload;
            if (typeof payload === "string") payload = JSON.parse(payload);

            // expense create payloads: prefer explicit shares[] (custom/percentage),
            // fall back to participant_ids[] expanded as an equal split.
            if (op.entity_type === "expense") {
                if (Array.isArray(payload.shares) && payload.shares.length > 0) {
                    for (const share of payload.shares) {
                        const row = upsertFor("expense_participant", {
                            expense_id: payload.id,
                            user_id: share.user_id,
                            share_cents: Number(share.share_cents),
                            updated_at: payload.updated_at,
                        });
                        await query(row.sql, row.params);
                    }
                } else if (Array.isArray(payload.participant_ids)) {
                    const total = Number(payload.participant_ids.length);
                    const amountCents = Number(payload.amount_cents ?? 0);
                    const base = Math.floor(amountCents / total);
                    const remainder = amountCents % total;
                    const ids = [...payload.participant_ids].sort();
                    for (let i = 0; i < ids.length; i++) {
                        const share = base + (i < remainder ? 1 : 0);
                        const row = upsertFor("expense_participant", {
                            expense_id: payload.id,
                            user_id: ids[i],
                            share_cents: share,
                            updated_at: payload.updated_at,
                        });
                        await query(row.sql, row.params);
                    }
                }
            }

            const stmt = upsertFor(op.entity_type, payload);
            if (!stmt) {
                results.push({ entity_type: op.entity_type, entity_id: op.entity_id, status: "rejected" });
                continue;
            }

            const { rowCount } = await query(stmt.sql, stmt.params);
            if (rowCount > 0 || !(op.entity_type in SINGLE_PK_TABLES)) {
                results.push({ entity_type: op.entity_type, entity_id: op.entity_id, status: "applied" });
                continue;
            }

            // LWW loss: an equal-or-newer version already exists server-side.
            // Record the losing write instead of dropping it silently.
            const winnerUpdatedAt = await logConflict(
                op.entity_type, op.entity_id, op.operation, payload, payload.updated_at
            );
            results.push({
                entity_type: op.entity_type,
                entity_id: op.entity_id,
                status: "conflict_lww",
                winner_updated_at: winnerUpdatedAt,
            });
        } catch (err) {
            console.error("[push] op failed", op?.entity_type, err.message);
            results.push({ entity_type: op.entity_type, entity_id: op.entity_id, status: "error" });
        }
    }
    res.json({ server_time_ms: Date.now(), results });
});

// NOTE: /rooms/join endpoint has been moved to routes/rooms.js
// with proper UUID generation for cross-device compatibility.

// ---------------------------------------------------------------------------
// PULL — per-entity-type cursor sync. Client sends its cursors; server returns
// everything newer, oldest first.
// ---------------------------------------------------------------------------

const PULL_QUERIES = {
    users: {
        sql: "SELECT id, name, avatar_initials, color, password_hash, salt, created_at, updated_at, is_deleted FROM users WHERE updated_at > $1 ORDER BY updated_at ASC LIMIT 1000",
        scoped: false,
    },
    rooms: {
        sql: `SELECT r.* FROM rooms r
              WHERE r.updated_at > $1
                AND (r.created_by = $2 OR EXISTS (
                    SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = $2))
              ORDER BY r.updated_at ASC LIMIT 1000`,
        scoped: true,
    },
    room_members: {
        sql: `SELECT rm.room_id, rm.user_id, rm.joined_at, rm.is_deleted FROM room_members rm
              WHERE rm.joined_at > $1 AND rm.room_id IN (
                    SELECT room_id FROM room_members WHERE user_id = $2)
              ORDER BY rm.joined_at ASC LIMIT 1000`,
        scoped: true,
    },
    expenses: {
        sql: `SELECT e.* FROM expenses e
              WHERE e.updated_at > $1 AND e.room_id IN (
                    SELECT room_id FROM room_members WHERE user_id = $2)
              ORDER BY e.updated_at ASC LIMIT 1000`,
        scoped: true,
    },
    expense_participants: {
        sql: `SELECT ep.expense_id, ep.user_id, ep.share_cents, ep.updated_at, ep.is_deleted
              FROM expense_participants ep
              JOIN expenses e ON e.id = ep.expense_id
              WHERE ep.updated_at > $1 AND e.room_id IN (
                    SELECT room_id FROM room_members WHERE user_id = $2)
              ORDER BY ep.updated_at ASC LIMIT 2000`,
        scoped: true,
    },
    settlements: {
        sql: `SELECT s.* FROM settlements s
              WHERE s.updated_at > $1 AND s.room_id IN (
                    SELECT room_id FROM room_members WHERE user_id = $2)
              ORDER BY s.updated_at ASC LIMIT 1000`,
        scoped: true,
    },
};

router.post("/sync/pull", async (req, res) => {
    const cursors = req.body?.cursors ?? {};
    const myUserId = req.body?.my_user_id ?? null;
    if (!myUserId) return res.status(400).json({ error: "my_user_id required" });

    const changes = {};
    for (const [key, def] of Object.entries(PULL_QUERIES)) {
        const since = Number(cursors[key] ?? 0);
        try {
            const params = def.scoped ? [since, myUserId] : [since];
            const { rows } = await query(def.sql, params);
            changes[key] = rows;
        } catch (err) {
            console.error("[pull]", key, err.message);
            changes[key] = [];
        }
    }

    res.json({ server_time_ms: Date.now(), changes });
});

export default router;
