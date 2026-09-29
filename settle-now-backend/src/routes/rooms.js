import { Router } from "express";
import { query, withTransaction } from "../db.js";
import { allocate } from "../lib/splitEngine.js";
import { toPaise } from "../lib/money.js";
import crypto from "node:crypto";
const { randomUUID } = crypto;

const router = Router();

function isUUID(str) {
    return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// Palette matching the client's config/people.js
const PALETTE = [
    '#b0413e', '#c0762c', '#c19b2c', '#4a8c52', '#2f8f83',
    '#38699f', '#52589f', '#7b4b94', '#b85c79', '#7a5230',
    '#6f7a2e', '#3a3733',
];

function assignColor(takenColors) {
    const available = PALETTE.filter(c => !takenColors.includes(c));
    if (available.length > 0) {
        return available[Math.floor(Math.random() * available.length)];
    }
    // Fallback: random from full palette
    return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

async function getTakenColors(excludeUserId) {
    const result = await query('SELECT color FROM users WHERE is_deleted = FALSE AND id != $1', [excludeUserId || '']);
    return result.rows.map(r => r.color).filter(Boolean);
}

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateInviteCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// ── CREATE a new ledger (room) ────────────────────────────────────────
router.post("/rooms/create", async (req, res) => {
  const { name, creator_id, creator_name, creator_color } = req.body ?? {};
  if (!name || !creator_id) {
    return res.status(400).json({ error: "name and creator_id required" });
  }

  try {
    const now = Date.now();
    const ledgerId = crypto.randomUUID();
    const inviteCode = generateInviteCode();

    // Upsert the creator as a user (generate a proper UUID if needed)
    const dbUserId = isUUID(creator_id) ? creator_id : crypto.randomUUID();
    // Use client's color if provided, otherwise assign one
    let userColor = creator_color || null;
    if (!userColor) {
      const takenColors = await getTakenColors(dbUserId);
      userColor = assignColor(takenColors);
    }
    await query(
      `INSERT INTO users (id, name, color, created_at, updated_at, is_deleted)
       VALUES ($1, $2, $3, $4, $4, FALSE)
       ON CONFLICT (id) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, ''), users.name), color = COALESCE(users.color, EXCLUDED.color)`,
      [dbUserId, creator_name ?? "", userColor, now]
    );

    // Create the room
    await query(
      `INSERT INTO rooms (id, name, invite_code, created_by, created_at, updated_at, is_deleted)
       VALUES ($1, $2, $3, $4, $5, $5, FALSE)`,
      [ledgerId, name.trim(), inviteCode, dbUserId, now]
    );

    // Add the creator as a member
    await query(
      `INSERT INTO room_members (room_id, user_id, joined_at, is_deleted)
       VALUES ($1, $2, $3, FALSE)
       ON CONFLICT (room_id, user_id) DO UPDATE SET is_deleted = FALSE`,
      [ledgerId, dbUserId, now]
    );

    console.log(`[rooms/create] Created ledger "${name}" (${ledgerId}) by ${creator_name} with code ${inviteCode}`);

    res.json({
      ledger: {
        id: ledgerId,
        name: name.trim(),
        invite_code: inviteCode,
        created_by: dbUserId,
        created_at: now,
        member_ids: [dbUserId],
      },
      members: [{ id: dbUserId, name: creator_name ?? '', color: userColor }],
      db_user_id: dbUserId,
    });
  } catch (err) {
    console.error("[rooms/create]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// ── JOIN an existing ledger by invite code ─────────────────────────────
router.post("/rooms/join", async (req, res) => {
    const { invite_code, user_id, user_name, user_color } = req.body ?? {};
    if (!invite_code || !user_id) {
        return res.status(400).json({ error: "invite_code and user_id required" });
    }

    try {
        const code = String(invite_code).trim().toUpperCase();
        console.log(`[rooms/join] Looking up code "${code}" for user ${user_name} (${user_id})`);

        // Generate proper UUID BEFORE any DB queries (non-UUID client IDs like "m-abc" fail against UUID columns)
        const dbUserId = isUUID(user_id) ? user_id : crypto.randomUUID();

        const room = await query(
            "SELECT id, name, invite_code, created_at FROM rooms WHERE invite_code = $1 AND is_deleted = FALSE LIMIT 1",
            [code]
        );

        if (!room.rows.length) {
            // Debug: log all active invite codes to help diagnose "not found" errors
            const allCodes = await query("SELECT id, invite_code, name, created_at FROM rooms WHERE is_deleted = FALSE ORDER BY created_at DESC LIMIT 20");
            console.log(`[rooms/join] No ledger found for code "${code}"`);
            if (allCodes.rows.length > 0) {
                console.log(`[rooms/join] Active codes in DB: ${allCodes.rows.map(r => `${r.invite_code}(${r.name})`).join(', ')}`);
            } else {
                console.log(`[rooms/join] WARNING: No active rooms in database at all!`);
            }
            return res.status(404).json({ error: "room_not_found" });
        }

        const roomId = room.rows[0].id;
        const now = Date.now();

        // Upsert the joining user — use client's color if provided, otherwise assign one
        let userColor = user_color || null;
        if (!userColor) {
          const takenColors = await getTakenColors(dbUserId);
          userColor = assignColor(takenColors);
        }
        await query(
            `INSERT INTO users (id, name, color, created_at, updated_at, is_deleted)
             VALUES ($1, $2, $3, $4, $4, FALSE)
             ON CONFLICT (id) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, ''), users.name), color = COALESCE(users.color, EXCLUDED.color)`,
            [dbUserId, user_name ?? "", userColor, now]
        );

        // Check existing membership (now using the valid UUID)
        const existing = await query(
            "SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 AND is_deleted = FALSE LIMIT 1",
            [roomId, dbUserId]
        );

        if (!existing.rows.length) {
            // Check cap
            const count = await query(
                "SELECT COUNT(*)::int AS n FROM room_members WHERE room_id = $1 AND is_deleted = FALSE",
                [roomId]
            );
            if (count.rows[0].n >= 10) {
                return res.status(409).json({ error: "room_full" });
            }

            // Add membership
            await query(
                `INSERT INTO room_members (room_id, user_id, joined_at, is_deleted)
                 VALUES ($1, $2, $3, FALSE)
                 ON CONFLICT (room_id, user_id) DO UPDATE SET is_deleted = FALSE`,
                [roomId, dbUserId, now]
            );

            console.log(`[rooms/join] ${user_name} joined ledger "${room.rows[0].name}" (${roomId}) [db_id=${dbUserId}]`);
        } else {
            console.log(`[rooms/join] ${user_name} is already a member of ${roomId} [db_id=${dbUserId}]`);
        }

        // Fetch all current members with their colors
        const members = await query(
            `SELECT u.id, u.name, u.color FROM users u
             JOIN room_members rm ON rm.user_id = u.id
             WHERE rm.room_id = $1 AND rm.is_deleted = FALSE
             ORDER BY rm.joined_at ASC`,
            [roomId]
        );

        // Fetch the creator's ID to include in the response
        const creatorResult = await query(
            "SELECT created_by FROM rooms WHERE id = $1",
            [roomId]
        );

        res.json({
            ledger: {
                id: room.rows[0].id,
                name: room.rows[0].name,
                invite_code: room.rows[0].invite_code,
                created_at: room.rows[0].created_at,
                created_by: creatorResult.rows[0]?.created_by ?? null,
                member_ids: members.rows.map((m) => m.id),
            },
            members: members.rows,
            db_user_id: dbUserId,
        });
    } catch (err) {
        console.error("[rooms/join]", err.message);
        res.status(500).json({ error: "internal" });
    }
});

// ── GET a ledger by ID — returns current members (for sync/refresh) ──
router.get("/rooms/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const room = await query(
      "SELECT id, name, invite_code, created_by, created_at FROM rooms WHERE id = $1 AND is_deleted = FALSE LIMIT 1",
      [id]
    );
    if (!room.rows.length) {
      // Also covered: rooms that were soft-deleted — clients treat any 404
      // here as "this ledger no longer exists" and remove it locally.
      return res.status(404).json({ error: "room_not_found" });
    }
    const roomId = room.rows[0].id;
    const members = await query(
      `SELECT u.id, u.name, u.color FROM users u
       JOIN room_members rm ON rm.user_id = u.id
       WHERE rm.room_id = $1 AND rm.is_deleted = FALSE
       ORDER BY rm.joined_at ASC`,
      [roomId]
    );
    res.json({
      ledger: {
        id: room.rows[0].id,
        name: room.rows[0].name,
        invite_code: room.rows[0].invite_code,
        created_by: room.rows[0].created_by,
        created_at: room.rows[0].created_at,
      },
      members: members.rows,
      member_ids: members.rows.map(m => m.id),
    });
  } catch (err) {
    console.error("[rooms/:id]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// ── GET a ledger by invite code (read-only lookup) ─────────────────────
router.get("/rooms/lookup/:code", async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  try {
    const room = await query(
      "SELECT id, name, invite_code FROM rooms WHERE invite_code = $1 AND is_deleted = FALSE LIMIT 1",
      [code]
    );
    if (!room.rows.length) {
      return res.status(404).json({ error: "room_not_found" });
    }
    res.json({ ledger: room.rows[0] });
  } catch (err) {
    console.error("[rooms/lookup]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// ── GET expenses for a room ──────────────────────────────────────────
// Returns split metadata (split_type, payer_participates) and the RESOLVED
// per-user shares so clients never re-derive them.
router.get("/rooms/:id/expenses", async (req, res) => {
  const { id } = req.params;
  try {
    const roomCheck = await query(
      "SELECT 1 FROM rooms WHERE id = $1 AND is_deleted = FALSE LIMIT 1",
      [id]
    );
    if (!roomCheck.rows.length) {
      return res.status(404).json({ error: "room_not_found" });
    }
    const expenses = await query(
      `SELECT e.id, e.room_id, e.paid_by, e.amount_cents, e.description,
              e.split_type, e.payer_participates, e.created_at, e.updated_at,
              u.name AS payer_name, u.color AS payer_color
       FROM expenses e
       JOIN users u ON u.id = e.paid_by
       WHERE e.room_id = $1 AND e.is_deleted = FALSE
       ORDER BY e.created_at ASC`,
      [id]
    );
    const participantRows = await query(
      `SELECT ep.expense_id, ep.user_id, ep.share_cents
       FROM expense_participants ep
       JOIN expenses e ON e.id = ep.expense_id
       WHERE e.room_id = $1 AND ep.is_deleted = FALSE AND e.is_deleted = FALSE
       ORDER BY ep.user_id ASC`,
      [id]
    );
    const byExpense = new Map();
    for (const p of participantRows.rows) {
      if (!byExpense.has(p.expense_id)) byExpense.set(p.expense_id, []);
      byExpense.get(p.expense_id).push(p);
    }
    const bills = expenses.rows.map((exp) => {
      const parts = byExpense.get(exp.id) || [];
      return {
        id: exp.id,
        ledgerId: exp.room_id,
        payerId: exp.paid_by,
        payerName: exp.payer_name,
        payerColor: exp.payer_color,
        // integer paise is canonical on the wire
        amount_paise: Number(exp.amount_cents),
        // rupee float kept only as a legacy display convenience
        amount: Number(exp.amount_cents) / 100,
        timestamp: Number(exp.created_at),
        splitType: exp.split_type || 'EQUAL',
        split_type: exp.split_type || 'EQUAL',
        payerParticipates: exp.payer_participates !== false,
        payer_participates: exp.payer_participates !== false,
        description: exp.description || '',
        splitAmongIds: parts.map((p) => p.user_id),
        split_among: parts.map((p) => p.user_id),
        // resolved integer shares — canonical; clients must not re-derive
        shares_paise: parts.map((p) => ({ user_id: p.user_id, share_paise: Number(p.share_cents) })),
        // legacy rupee shares for old renderers
        shares: parts.map((p) => ({ userId: p.user_id, amount: Number(p.share_cents) / 100 })),
      };
    });
    res.json({ bills });
  } catch (err) {
    console.error("[rooms/expenses]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// ── POST an expense to a room ─────────────────────────────────────────
// Integer paise in. All division is delegated to the shared allocate() —
// this file contains no splitting math of its own. Rejections from allocate()
// answer 422 { error, code, message } and write NOTHING (transactional).
// Legacy `amount` (rupee float) is back-accepted for one release with a
// Deprecation header so in-flight clients keep working.
router.post("/rooms/:id/expenses", async (req, res) => {
  const { id } = req.params;
  const {
    expense_id, paid_by, amount, amount_paise,
    split_among, participant_ids, shares,
    description, split_type, payer_participates,
  } = req.body ?? {};

  if (!expense_id || !paid_by) {
    return res.status(400).json({ error: "expense_id and paid_by required" });
  }

  // ── amount resolution: amount_paise (canonical) or legacy amount rupees ──
  let amountPaise;
  let deprecated = false;
  if (amount_paise !== undefined && amount_paise !== null) {
    amountPaise = Number(amount_paise);
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
      return res.status(422).json({ error: "INVALID_AMOUNT", code: "INVALID_AMOUNT", message: "amount_paise must be a non-negative safe integer" });
    }
  } else if (amount !== undefined && amount !== null) {
    amountPaise = toPaise(amount); // handles numbers AND "1250.50" strings
    deprecated = true;
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
      return res.status(422).json({ error: "INVALID_AMOUNT", code: "INVALID_AMOUNT", message: "amount must be a positive rupee number with at most 2 decimals" });
    }
  } else {
    return res.status(400).json({ error: "amount_paise (or legacy amount) required" });
  }

  // ── participants: participant_ids (canonical) or legacy split_among ────
  const participants = participant_ids ?? split_among;
  if (!Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: "participant_ids (or split_among) required" });
  }

  try {
    const roomCheck = await query(
      "SELECT 1 FROM rooms WHERE id = $1 AND is_deleted = FALSE LIMIT 1",
      [id]
    );
    if (!roomCheck.rows.length) {
      return res.status(404).json({ error: "room_not_found" });
    }
    const now = Date.now();
    const dbExpenseId = isUUID(expense_id) ? expense_id : crypto.randomUUID();
    const type = typeof split_type === "string" ? split_type.toUpperCase() : "EQUAL";
    // payer_participates: explicit toggle, defaults TRUE (historic behaviour).
    // When FALSE the payer fronted the money but is not part of the split —
    // allocate() never sees them; the full amount divides among participants.
    const payerIn = payer_participates !== false;

    // ── THE split decision: one call, one implementation ──
    const allocation = allocate({
      amountPaise,
      userIds: participants,
      type,
      shares: Array.isArray(shares)
        ? shares.map((s) => ({
            user_id: s.user_id,
            amount_paise: Number(s.amount_paise),
            percent: s.percent !== undefined ? Number(s.percent) : undefined,
            weight: s.weight !== undefined ? Number(s.weight) : undefined,
          }))
        : undefined,
    });
    if (!allocation.ok) {
      return res.status(422).json({
        error: allocation.code,
        code: allocation.code,
        message: allocation.message,
      });
    }

    // Transaction: a rejected/failed write must leave no partial rows.
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO expenses (id, room_id, paid_by, amount_cents, description, split_type, payer_participates, created_at, updated_at, is_deleted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, FALSE)
         ON CONFLICT (id) DO UPDATE SET
           amount_cents = EXCLUDED.amount_cents,
           description = EXCLUDED.description,
           split_type = EXCLUDED.split_type,
           payer_participates = EXCLUDED.payer_participates,
           updated_at = EXCLUDED.updated_at`,
        [dbExpenseId, id, paid_by, amountPaise, description || '', type, payerIn, now]
      );

      // Replace participants with the allocated shares.
      await client.query(
        `UPDATE expense_participants SET is_deleted = TRUE, updated_at = $2
         WHERE expense_id = $1 AND is_deleted = FALSE`,
        [dbExpenseId, now]
      );
      for (const s of allocation.shares) {
        await client.query(
          `INSERT INTO expense_participants (expense_id, user_id, share_cents, updated_at, is_deleted)
           VALUES ($1, $2, $3, $4, FALSE)
           ON CONFLICT (expense_id, user_id) DO UPDATE SET
             share_cents = EXCLUDED.share_cents,
             updated_at = EXCLUDED.updated_at,
             is_deleted = FALSE`,
          [dbExpenseId, s.user_id, s.share_paise, now]
        );
      }
    });

    if (deprecated) res.setHeader("Deprecation", "true");
    if (deprecated) res.setHeader("Sunset", "Sat, 31 Oct 2026 00:00:00 GMT");
    console.log(`[rooms/expenses] Expense ${dbExpenseId} added to room ${id} by ${paid_by} — ${(amountPaise / 100).toFixed(2)} (${type}${payerIn ? "" : ", payer excluded"})`);
    res.json({ ok: true, expense_id: dbExpenseId, client_id: expense_id, split_type: type, shares: allocation.shares });
  } catch (err) {
    console.error("[rooms/expenses/create]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// ── DELETE a ledger (soft delete, creator/admin only) ────────────────────
router.delete("/rooms/:id", async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body ?? {};
  if (!user_id) {
    return res.status(400).json({ error: "user_id required" });
  }
  try {
    const room = await query(
      "SELECT id, created_by FROM rooms WHERE id = $1 AND is_deleted = FALSE LIMIT 1",
      [id]
    );
    if (!room.rows.length) {
      return res.status(404).json({ error: "room_not_found" });
    }
    // Enforce creator-only on the backend
    if (room.rows[0].created_by !== user_id) {
      return res.status(403).json({ error: "only the ledger creator can delete it" });
    }
    const now = Date.now();
    // Soft-delete the room itself
    await query(
      "UPDATE rooms SET is_deleted = TRUE, updated_at = $2 WHERE id = $1",
      [id, now]
    );
    // Soft-delete ALL room content so every device's next sync reflects the deletion
    await query(
      "UPDATE expenses SET is_deleted = TRUE, updated_at = $2 WHERE room_id = $1 AND is_deleted = FALSE",
      [id, now]
    );
    await query(
      `UPDATE expense_participants ep SET is_deleted = TRUE, updated_at = $2
       FROM expenses e WHERE ep.expense_id = e.id AND e.room_id = $1 AND ep.is_deleted = FALSE`,
      [id, now]
    );
    await query(
      "UPDATE settlements SET is_deleted = TRUE, updated_at = $2 WHERE room_id = $1 AND is_deleted = FALSE",
      [id, now]
    );
    await query(
      "UPDATE room_members SET is_deleted = TRUE WHERE room_id = $1 AND is_deleted = FALSE",
      [id]
    );
    console.log(`[rooms] Ledger ${id} soft-deleted (with all expenses/settlements/memberships) by ${user_id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[rooms/delete]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// ── GET balances for a room — THE server-authoritative derivation ─────
// Integer paise end to end. One query; nets always sum to exactly 0.
// Note: `nets` (legacy alias `balances`, rupees) is still returned so the
// pre-existing delete-warning client keeps working.
router.get("/rooms/:id/balances", async (req, res) => {
  const { id } = req.params;
  try {
    const roomCheck = await query(
      "SELECT 1 FROM rooms WHERE id = $1 AND is_deleted = FALSE LIMIT 1",
      [id]
    );
    if (!roomCheck.rows.length) {
      return res.status(404).json({ error: "room_not_found" });
    }

    // ONE balance-derivation query: payer credited the full amount,
    // each participant debited their resolved share.
    const ledgerRows = await query(
      `
      -- expense legs (positive = the room paid this member)
      SELECT e.paid_by AS user_id, e.amount_cents::bigint AS paise, 'expense' AS leg
      FROM expenses e
      WHERE e.room_id = $1 AND e.is_deleted = FALSE
      UNION ALL
      SELECT ep.user_id, -ep.share_cents::bigint AS paise, 'share' AS leg
      FROM expenses e
      JOIN expense_participants ep ON ep.expense_id = e.id
      WHERE e.room_id = $1 AND e.is_deleted = FALSE AND ep.is_deleted = FALSE
      UNION ALL
      -- settlement legs: PENDING and COMPLETED reduce the outstanding balance;
      -- VOID is excluded from all balance maths.
      SELECT s.from_user, s.amount_cents::bigint AS paise, 'settle' AS leg
      FROM settlements s
      WHERE s.room_id = $1 AND s.is_deleted = FALSE AND s.status IN ('PENDING','COMPLETED')
      UNION ALL
      SELECT s.to_user, -s.amount_cents::bigint AS paise, 'settle' AS leg
      FROM settlements s
      WHERE s.room_id = $1 AND s.is_deleted = FALSE AND s.status IN ('PENDING','COMPLETED')
      `,
      [id]
    );

    const settlementsRows = await query(
      `SELECT s.from_user, s.to_user, s.amount_cents, s.status
       FROM settlements s
       WHERE s.room_id = $1 AND s.is_deleted = FALSE AND s.status IN ('PENDING','COMPLETED')`,
      [id]
    );

    // ── nets (integer paise, + = owed money) ──
    const nets = {};
    for (const r of ledgerRows.rows) {
      nets[r.user_id] = (nets[r.user_id] || 0) + Number(r.paise);
    }

    // ── pairwise: owed[a→b] = Σ share of a in expenses paid by b
    //            settled[a→b] = Σ settlements a paid to b (PENDING+COMPLETED)
    //            outstanding = owed - settled (0 when b "owes" a instead)
    const owedPair = {};   // key "a|b": a owes b
    const settledPair = {};
    const bump = (map, a, b, v) => {
      const k = `${a}|${b}`;
      map[k] = (map[k] || 0) + v;
    };

    const expenseRows = await query(
      `SELECT e.paid_by, ep.user_id, ep.share_cents
       FROM expenses e
       JOIN expense_participants ep ON ep.expense_id = e.id
       WHERE e.room_id = $1 AND e.is_deleted = FALSE AND ep.is_deleted = FALSE`,
      [id]
    );
    for (const r of expenseRows.rows) {
      if (r.paid_by === r.user_id) continue; // payer's own share — not a pair debt
      bump(owedPair, r.user_id, r.paid_by, Number(r.share_cents));
    }
    for (const s of settlementsRows.rows) {
      bump(settledPair, s.from_user, s.to_user, Number(s.amount_cents));
    }

    const membersInvolved = new Set();
    for (const r of ledgerRows.rows) membersInvolved.add(r.user_id);
    for (const k of Object.keys(owedPair)) for (const u of k.split("|")) membersInvolved.add(u);
    for (const k of Object.keys(settledPair)) for (const u of k.split("|")) membersInvolved.add(u);
    const memberList = [...membersInvolved].sort();

    const pairwise = [];
    for (let i = 0; i < memberList.length; i++) {
      for (let j = i + 1; j < memberList.length; j++) {
        const a = memberList[i];
        const b = memberList[j];
        const ab = owedPair[`${a}|${b}`] || 0; // a owes b (from b's expenses)
        const ba = owedPair[`${b}|${a}`] || 0; // b owes a
        const settledAB = settledPair[`${a}|${b}`] || 0;
        const settledBA = settledPair[`${b}|${a}`] || 0;
        // net direction after netting mutual debts and mutual settlements
        const owedNet = ab - ba;
        const settledNet = settledAB - settledBA;
        const direction = owedNet - settledNet; // >0 → a owes b net
        pairwise.push({
          a,
          b,
          owed_a_to_b_paise: Math.max(direction, 0),
          owed_b_to_a_paise: Math.max(-direction, 0),
          settled_ab_paise: settledNet >= 0 ? settledNet : 0,
          outstanding_a_to_b_paise: Math.max(direction, 0),
        });
      }
    }

    // ── pending settlements per member → partially_settled flag ──
    const pendingRows = await query(
      `SELECT from_user, to_user FROM settlements
       WHERE room_id = $1 AND is_deleted = FALSE AND status = 'PENDING'`,
      [id]
    );
    const pendingMembers = new Set();
    for (const s of pendingRows.rows) {
      pendingMembers.add(s.from_user);
      pendingMembers.add(s.to_user);
    }

    // ── statuses + flags per member ──
    const statuses = {};
    const flags = {};
    for (const [userId, net] of Object.entries(nets)) {
      statuses[userId] = net < 0 ? "owes" : net > 0 ? "owed" : "settled";
      flags[userId] = { partially_settled: net !== 0 && pendingMembers.has(userId) };
    }

    // ── suggestions: deterministic greedy simplification (same rule as client) ──
    const debtors = [];
    const creditors = [];
    for (const [userId, net] of Object.entries(nets)) {
      if (net < 0) debtors.push({ id: userId, amount: -net });
      else if (net > 0) creditors.push({ id: userId, amount: net });
    }
    debtors.sort((x, y) => y.amount - x.amount || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    creditors.sort((x, y) => y.amount - x.amount || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const suggestions = [];
    let di = 0, ci = 0;
    while (di < debtors.length && ci < creditors.length) {
      const pay = Math.min(debtors[di].amount, creditors[ci].amount);
      if (pay > 0) suggestions.push({ from: debtors[di].id, to: creditors[ci].id, amount_paise: pay });
      debtors[di].amount -= pay;
      creditors[ci].amount -= pay;
      if (debtors[di].amount === 0) di++;
      if (creditors[ci].amount === 0) ci++;
    }

    // ── summary ──
    const totalRow = await query(
      `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total, COUNT(*)::int AS n
       FROM expenses WHERE room_id = $1 AND is_deleted = FALSE`,
      [id]
    );
    const summary = {
      total_paise: Number(totalRow.rows[0]?.total ?? 0),
      expense_count: Number(totalRow.rows[0]?.n ?? 0),
      settled_count: 0,
      pending_count: pendingRows.rows.length,
    };
    const completedCount = await query(
      `SELECT COUNT(*)::int AS n FROM settlements
       WHERE room_id = $1 AND is_deleted = FALSE AND status = 'COMPLETED'`,
      [id]
    );
    summary.settled_count = Number(completedCount.rows[0]?.n ?? 0);

    // Legacy alias: rupee floats for the old delete-warning client.
    const legacyBalances = {};
    for (const [userId, paise] of Object.entries(nets)) {
      legacyBalances[userId] = paise / 100;
    }

    res.json({
      summary,
      nets,
      statuses,
      flags,
      pairwise,
      suggestions,
      balances: legacyBalances, // legacy: rupee floats, do not compute from
    });
  } catch (err) {
    console.error("[rooms/balances]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// ── DELETE (clear) all expenses in a room ──────────────────────────────
router.delete("/rooms/:id/expenses", async (req, res) => {
  const { id } = req.params;
  try {
    const roomCheck = await query(
      "SELECT 1 FROM rooms WHERE id = $1 AND is_deleted = FALSE LIMIT 1",
      [id]
    );
    if (!roomCheck.rows.length) {
      return res.status(404).json({ error: "room_not_found" });
    }
    const now = Date.now();
    await query(
      `UPDATE expenses SET is_deleted = TRUE, updated_at = $2 WHERE room_id = $1 AND is_deleted = FALSE`,
      [id, now]
    );
    console.log(`[rooms/expenses] Cleared all expenses in room ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[rooms/expenses/clear]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// ── Settlements (recorded debt payments between members) ────────────────

// GET all settlements for a room (with lifecycle fields)
router.get("/rooms/:id/settlements", async (req, res) => {
  const { id } = req.params;
  try {
    const roomCheck = await query(
      "SELECT 1 FROM rooms WHERE id = $1 AND is_deleted = FALSE LIMIT 1",
      [id]
    );
    if (!roomCheck.rows.length) {
      return res.status(404).json({ error: "room_not_found" });
    }
    const rows = await query(
      `SELECT id, room_id, from_user, to_user, amount_cents, status, method, note, settled_at, created_by, created_at
       FROM settlements
       WHERE room_id = $1 AND is_deleted = FALSE
       ORDER BY created_at ASC`,
      [id]
    );
    res.json({
      settlements: rows.rows.map((r) => ({
        id: r.id,
        fromUserId: r.from_user,
        toUserId: r.to_user,
        // integer paise is canonical
        amount_paise: Number(r.amount_cents),
        // legacy rupee amount for old renderers
        amount: Number(r.amount_cents) / 100,
        status: r.status || 'COMPLETED',
        method: r.method || 'OTHER',
        note: r.note || '',
        settledAt: r.settled_at ? Number(r.settled_at) : null,
        createdBy: r.created_by || null,
        timestamp: Number(r.created_at),
      })),
    });
  } catch (err) {
    console.error("[rooms/settlements/list]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// POST a settlement — from_user paid to_user the given amount.
// status PENDING = payment initiated, still counts against the balance;
// COMPLETED (default) = confirmed, clears the debt.
router.post("/rooms/:id/settlements", async (req, res) => {
  const { id } = req.params;
  const {
    settlement_id, from_user, to_user, amount, amount_paise,
    status, method, note, created_by,
  } = req.body ?? {};

  let amountPaise;
  let deprecated = false;
  if (amount_paise !== undefined && amount_paise !== null) {
    amountPaise = Number(amount_paise);
  } else if (amount !== undefined && amount !== null) {
    amountPaise = toPaise(amount);
    deprecated = true;
  } else {
    amountPaise = NaN;
  }
  if (!from_user || !to_user || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    return res.status(400).json({ error: "from_user, to_user and positive amount_paise required" });
  }

  const VALID_STATUS = new Set(["PENDING", "COMPLETED"]);
  const VALID_METHOD = new Set(["UPI", "CASH", "OTHER"]);
  const st = typeof status === "string" ? status.toUpperCase() : "COMPLETED";
  const me = typeof method === "string" ? method.toUpperCase() : "OTHER";
  if (!VALID_STATUS.has(st)) {
    return res.status(422).json({ error: "INVALID_STATUS", code: "INVALID_STATUS", message: "status must be PENDING or COMPLETED on create" });
  }
  if (!VALID_METHOD.has(me)) {
    return res.status(422).json({ error: "INVALID_METHOD", code: "INVALID_METHOD", message: "method must be UPI, CASH or OTHER" });
  }

  try {
    const room = await query(
      "SELECT id FROM rooms WHERE id = $1 AND is_deleted = FALSE LIMIT 1",
      [id]
    );
    if (!room.rows.length) {
      return res.status(404).json({ error: "room_not_found" });
    }
    const now = Date.now();
    const dbId = isUUID(settlement_id) ? settlement_id : randomUUID();
    await query(
      `INSERT INTO settlements (id, room_id, from_user, to_user, amount_cents, status, method, note, settled_at, created_by, created_at, updated_at, is_deleted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,FALSE)
       ON CONFLICT (id) DO UPDATE SET
         amount_cents = EXCLUDED.amount_cents,
         status = EXCLUDED.status,
         method = EXCLUDED.method,
         note = EXCLUDED.note,
         settled_at = EXCLUDED.settled_at,
         updated_at = EXCLUDED.updated_at`,
      [dbId, id, from_user, to_user, amountPaise, st, me, note || "", st === "COMPLETED" ? now : null, created_by || null, now]
    );
    if (deprecated) res.setHeader("Deprecation", "true");
    console.log(`[rooms/settlements] ${from_user} paid ${to_user} ${(amountPaise / 100).toFixed(2)} in room ${id} [${st}/${me}]`);
    res.json({ ok: true, settlement_id: dbId, status: st, method: me });
  } catch (err) {
    console.error("[rooms/settlements/create]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// PATCH a settlement lifecycle transition: PENDING → COMPLETED | VOID.
// COMPLETED marks it confirmed; VOID excludes it from all balance maths.
router.patch("/rooms/:id/settlements/:sid", async (req, res) => {
  const { id, sid } = req.params;
  const { status } = req.body ?? {};
  const st = typeof status === "string" ? status.toUpperCase() : "";
  if (!["COMPLETED", "VOID", "PENDING"].includes(st)) {
    return res.status(422).json({ error: "INVALID_STATUS", code: "INVALID_STATUS", message: "status must be COMPLETED, VOID or PENDING" });
  }
  try {
    const room = await query(
      "SELECT 1 FROM rooms WHERE id = $1 AND is_deleted = FALSE LIMIT 1",
      [id]
    );
    if (!room.rows.length) return res.status(404).json({ error: "room_not_found" });

    const existing = await query(
      "SELECT id, status FROM settlements WHERE id = $1 AND room_id = $2 AND is_deleted = FALSE LIMIT 1",
      [sid, id]
    );
    if (!existing.rows.length) return res.status(404).json({ error: "settlement_not_found" });

    const now = Date.now();
    const updated = await query(
      `UPDATE settlements
       SET status = $3,
           settled_at = CASE WHEN $3 = 'COMPLETED' THEN COALESCE(settled_at, $4) ELSE settled_at END,
           updated_at = $4
       WHERE id = $1 AND room_id = $2
       RETURNING id, status`,
      [sid, id, st, now]
    );
    console.log(`[rooms/settlements] ${sid} → ${st} in room ${id}`);
    res.json({ ok: true, settlement_id: updated.rows[0].id, status: updated.rows[0].status });
  } catch (err) {
    console.error("[rooms/settlements/patch]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// DELETE (soft-void) a single settlement — audit trail retained, excluded
// from all balance maths. The bulk DELETE /rooms/:id/settlements (reset) stays.
router.delete("/rooms/:id/settlements/:sid", async (req, res) => {
  const { id, sid } = req.params;
  try {
    const room = await query(
      "SELECT 1 FROM rooms WHERE id = $1 AND is_deleted = FALSE LIMIT 1",
      [id]
    );
    if (!room.rows.length) return res.status(404).json({ error: "room_not_found" });
    const updated = await query(
      `UPDATE settlements SET status = 'VOID', updated_at = $3
       WHERE id = $1 AND room_id = $2 AND is_deleted = FALSE
       RETURNING id`,
      [sid, id, Date.now()]
    );
    if (!updated.rows.length) return res.status(404).json({ error: "settlement_not_found" });
    console.log(`[rooms/settlements] ${sid} VOIDED in room ${id}`);
    res.json({ ok: true, settlement_id: sid, status: "VOID" });
  } catch (err) {
    console.error("[rooms/settlements/delete-one]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// DELETE (soft) all settlements in a room
router.delete("/rooms/:id/settlements", async (req, res) => {
  const { id } = req.params;
  try {
    const roomCheck = await query(
      "SELECT 1 FROM rooms WHERE id = $1 AND is_deleted = FALSE LIMIT 1",
      [id]
    );
    if (!roomCheck.rows.length) {
      return res.status(404).json({ error: "room_not_found" });
    }
    const now = Date.now();
    await query(
      `UPDATE settlements SET is_deleted = TRUE, updated_at = $2 WHERE room_id = $1 AND is_deleted = FALSE`,
      [id, now]
    );
    console.log(`[rooms/settlements] Cleared all settlements in room ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[rooms/settlements/clear]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// ── ONE-TIME production data wipe (temporary — remove after use) ───────
// Guarded by WIPE_TOKEN env var; truncates all app data tables in FK-safe order.
router.post("/admin/wipe", async (req, res) => {
  const token = req.get("x-wipe-token") || req.body?.token;
  const expected = process.env.WIPE_TOKEN;
  if (!expected || token !== expected) {
    return res.status(403).json({ error: "forbidden" });
  }
  try {
    await query("TRUNCATE conflict_log, settlements, expense_participants, expenses, room_members, rooms, users CASCADE");
    console.log("[admin/wipe] ALL production data truncated by token holder");
    res.json({ ok: true, wiped: true, at: Date.now() });
  } catch (err) {
    console.error("[admin/wipe]", err.message);
    res.status(500).json({ error: "internal", detail: err.message });
  }
});

export default router;
