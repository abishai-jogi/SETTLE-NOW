import { Router } from "express";
import { query } from "../db.js";
import crypto from "node:crypto";

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
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = COALESCE(users.color, EXCLUDED.color)`,
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

    console.log(`[rooms] Created ledger "${name}" (${ledgerId}) by ${creator_name} with code ${inviteCode}`);

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
            console.log(`[rooms/join] No ledger found for code "${code}"`);
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
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = COALESCE(users.color, EXCLUDED.color)`,
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

        res.json({
            ledger: {
                id: room.rows[0].id,
                name: room.rows[0].name,
                invite_code: room.rows[0].invite_code,
                created_at: room.rows[0].created_at,
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

// ── GET expenses for a room ────────────────────────────────────────────
router.get("/rooms/:id/expenses", async (req, res) => {
  const { id } = req.params;
  try {
    const expenses = await query(
      `SELECT e.id, e.room_id, e.paid_by, e.amount_cents, e.description,
              e.split_type, e.created_at, e.updated_at,
              u.name AS payer_name, u.color AS payer_color
       FROM expenses e
       JOIN users u ON u.id = e.paid_by
       WHERE e.room_id = $1 AND e.is_deleted = FALSE
       ORDER BY e.created_at ASC`,
      [id]
    );
    // Fetch participants for each expense
    const bills = [];
    for (const exp of expenses.rows) {
      const participants = await query(
        `SELECT ep.user_id, ep.share_cents
         FROM expense_participants ep
         WHERE ep.expense_id = $1 AND ep.is_deleted = FALSE`,
        [exp.id]
      );
      bills.push({
        id: exp.id,
        ledgerId: exp.room_id,
        payerId: exp.paid_by,
        payerName: exp.payer_name,
        payerColor: exp.payer_color,
        amount: Math.round(exp.amount_cents) / 100,
        timestamp: exp.created_at,
        splitAmongIds: participants.rows.map(p => p.user_id),
        shares: participants.rows.map(p => ({ userId: p.user_id, amount: Math.round(p.share_cents) / 100 })),
        description: exp.description || '',
        splitType: exp.split_type || 'EQUAL',
      });
    }
    res.json({ bills });
  } catch (err) {
    console.error("[rooms/expenses]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// ── POST an expense to a room ─────────────────────────────────────────
router.post("/rooms/:id/expenses", async (req, res) => {
  const { id } = req.params;
  const { expense_id, paid_by, amount, split_among, description, split_type } = req.body ?? {};
  if (!expense_id || !paid_by || !amount || !Array.isArray(split_among) || split_among.length === 0) {
    return res.status(400).json({ error: "expense_id, paid_by, amount, split_among required" });
  }
  try {
    const now = Date.now();
    const dbExpenseId = isUUID(expense_id) ? expense_id : crypto.randomUUID();
    const amountCents = Math.round(Number(amount) * 100);
    const share = Math.floor(amountCents / split_among.length);
    const remainder = amountCents % split_among.length;

    await query(
      `INSERT INTO expenses (id, room_id, paid_by, amount_cents, description, split_type, created_at, updated_at, is_deleted)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, FALSE)
       ON CONFLICT (id) DO UPDATE SET
         amount_cents = EXCLUDED.amount_cents,
         updated_at = EXCLUDED.updated_at`,
      [dbExpenseId, id, paid_by, amountCents, description || '', split_type || 'EQUAL', now]
    );

    // Insert participants
    const sorted = [...split_among].sort();
    for (let i = 0; i < sorted.length; i++) {
      const shareAmount = share + (i < remainder ? 1 : 0);
      await query(
        `INSERT INTO expense_participants (expense_id, user_id, share_cents, updated_at, is_deleted)
         VALUES ($1, $2, $3, $4, FALSE)
         ON CONFLICT (expense_id, user_id) DO UPDATE SET
           share_cents = EXCLUDED.share_cents,
           updated_at = EXCLUDED.updated_at`,
        [dbExpenseId, sorted[i], shareAmount, now]
      );
    }

    console.log(`[rooms/expenses] Expense ${dbExpenseId} added to room ${id} by ${paid_by} — ₹${amount}`);
    res.json({ ok: true, expense_id: dbExpenseId, client_id: expense_id });
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
    // Soft-delete the room
    await query(
      "UPDATE rooms SET is_deleted = TRUE, updated_at = $2 WHERE id = $1",
      [id, now]
    );
    // Soft-delete all memberships
    await query(
      "UPDATE room_members SET is_deleted = TRUE WHERE room_id = $1 AND is_deleted = FALSE",
      [id]
    );
    console.log(`[rooms] Ledger ${id} soft-deleted by ${user_id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[rooms/delete]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// ── GET balances for a room (net amounts per member) ──────────────────
router.get("/rooms/:id/balances", async (req, res) => {
  const { id } = req.params;
  try {
    const expenses = await query(
      `SELECT e.paid_by, e.amount_cents, ep.user_id, ep.share_cents
       FROM expenses e
       JOIN expense_participants ep ON ep.expense_id = e.id
       WHERE e.room_id = $1 AND e.is_deleted = FALSE AND ep.is_deleted = FALSE`,
      [id]
    );
    const balances = {};
    for (const row of expenses.rows) {
      // payer gets credited the full amount
      if (!balances[row.paid_by]) balances[row.paid_by] = 0;
      balances[row.paid_by] += row.amount_cents;
      // each participant owes their share
      if (!balances[row.user_id]) balances[row.user_id] = 0;
      balances[row.user_id] -= row.share_cents;
    }
    // Convert to rupees
    const result = {};
    for (const [userId, cents] of Object.entries(balances)) {
      result[userId] = Math.round(cents) / 100;
    }
    res.json({ balances: result });
  } catch (err) {
    console.error("[rooms/balances]", err.message);
    res.status(500).json({ error: "internal" });
  }
});

// ── DELETE (clear) all expenses in a room ──────────────────────────────
router.delete("/rooms/:id/expenses", async (req, res) => {
  const { id } = req.params;
  try {
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

export default router;
