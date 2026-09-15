import { genUuid } from "./uid.js";

const MEMBERS_KEY = "settle-now.members.v3";
export const BILLS_KEY = "settle-now.bills.v3";
const USER_KEY = "settle-now.user.v2";
const LEDGERS_KEY = "settle-now.ledgers.v1";
const SETTLEMENTS_KEY = "settle-now.settlements.v1";

// API base — priority:
// 1. VITE_API_BASE env var set at build time (used for the Vercel production build)
// 2. Same-origin on localhost (Vite dev server proxies /api → localhost:4000)
// 3. Same-origin anywhere else (only works if the backend is hosted at the same domain)
const API_BASE = (() => {
  const envBase = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.VITE_API_BASE : null;
  if (envBase) return envBase.replace(/\/$/, "");
  const loc = typeof window !== "undefined" ? window.location : null;
  if (!loc) return "";
  return `${loc.protocol}//${loc.host}`;
})();

// ── Members ────────────────────────────────────────────────────────────

const validMember = (m) =>
  Boolean(
    m &&
      typeof m.id === "string" &&
      typeof m.name === "string" &&
      typeof m.color === "string" &&
      typeof m.passwordHash === "string" &&
      typeof m.salt === "string"
  );

export function loadMembers() {
  try {
    const arr = JSON.parse(localStorage.getItem(MEMBERS_KEY));
    return Array.isArray(arr) ? arr.filter(validMember) : [];
  } catch {
    return [];
  }
}

export const saveMembers = (members) =>
  localStorage.setItem(MEMBERS_KEY, JSON.stringify(members));

/**
 * True if this member record is an account created ON THIS DEVICE (has
 * credentials). Members pulled from the server (friends who joined from
 * other devices) are stored as stubs without credentials and are NOT local
 * accounts — they must never appear on the sign-in screen.
 * Also migrates pre-flag data: any member with a password hash was by
 * definition created locally.
 */
export const isLocalAccount = (m) =>
  Boolean(m && (m.isLocalAccount === true || (m.passwordHash || "").length > 0));

/** Update a member's ID (when server assigns a proper UUID for cross-device sync). */
export function updateMemberId(oldId, newId) {
  if (oldId === newId) return;
  const members = loadMembers();
  const member = members.find((m) => m.id === oldId);
  if (!member) return;
  member.id = newId;
  saveMembers(members);
  // Also update bill payerIds
  try {
    const arr = JSON.parse(localStorage.getItem(BILLS_KEY));
    if (Array.isArray(arr)) {
      for (const b of arr) {
        if (b.payerId === oldId) b.payerId = newId;
        if (Array.isArray(b.splitAmongIds)) {
          b.splitAmongIds = b.splitAmongIds.map((id) => (id === oldId ? newId : id));
        }
      }
      localStorage.setItem(BILLS_KEY, JSON.stringify(arr));
    }
  } catch { /* ok */ }
  // Update session user ID
  const savedId = loadSavedUser();
  if (savedId === oldId) saveUser(newId);
  // Update ledger member IDs
  const ledgers = loadLedgers();
  let changed = false;
  for (const l of ledgers) {
    const idx = l.memberIds.indexOf(oldId);
    if (idx >= 0) { l.memberIds[idx] = newId; changed = true; }
  }
  if (changed) saveLedgers(ledgers);
}

// ── Bills (ledger-scoped) ─────────────────────────────────────────────

export function loadBills(ledgerId) {
  try {
    const arr = JSON.parse(localStorage.getItem(BILLS_KEY));
    if (!Array.isArray(arr)) return [];
    return arr.filter((b) => {
      if (!b || typeof b.payerId !== "string" || b.ledgerId !== ledgerId) return false;
      // Coerce types — server may return strings from PostgreSQL
      if (typeof b.amount === "string") b.amount = Number(b.amount);
      if (typeof b.timestamp === "string") b.timestamp = Number(b.timestamp);
      return typeof b.amount === "number" && typeof b.timestamp === "number";
    });
  } catch {
    return [];
  }
}

export const saveBills = (bills) =>
  localStorage.setItem(BILLS_KEY, JSON.stringify(bills));

/** Append a bill to the global list (ledger-scoped via ledgerId field) AND push to server. */
export function appendBill(bill) {
  const all = loadAllBills();
  all.push(bill);
  localStorage.setItem(BILLS_KEY, JSON.stringify(all));
  // Fire-and-forget: push to server for cross-device sync
  pushBillToServer(bill).catch((err) => console.error('[appendBill] server push failed:', err.message));
}

/** POST a bill to the backend for cross-device sync. */
async function pushBillToServer(bill) {
  try {
    const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(bill.ledgerId)}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expense_id: bill.id,
        paid_by: bill.payerId,
        amount: bill.amount,
        split_among: bill.splitAmongIds || [],
        description: bill.description || '',
        split_type: bill.splitType || 'EQUAL',
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('[pushBillToServer] error:', res.status, body);
    }
  } catch (err) {
    console.error('[pushBillToServer] fetch failed:', err.message);
  }
}

/** Fetch all bills for a ledger from the server (cross-device sync). */
export async function fetchBillsFromServer(ledgerId) {
  try {
    const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(ledgerId)}/expenses`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.bills) ? data.bills : null;
  } catch (err) {
    console.error('[fetchBillsFromServer] failed:', err.message);
    return null;
  }
}

/** Clear all bills for a ledger on the server. */
export async function clearBillsOnServer(ledgerId) {
  try {
    await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(ledgerId)}/expenses`, { method: 'DELETE' });
  } catch (err) {
    console.error('[clearBillsOnServer] failed:', err.message);
  }
}

export function loadAllBillsLocal() {
  try {
    const arr = JSON.parse(localStorage.getItem(BILLS_KEY));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
// Alias for backward compat
const loadAllBills = loadAllBillsLocal;

export function clearBillsForLedger(ledgerId) {
  const all = loadAllBills().filter((b) => b.ledgerId !== ledgerId);
  localStorage.setItem(BILLS_KEY, JSON.stringify(all));
}

/**
 * Remove a deleted ledger from EVERY local cache: ledgers, bills, settlements
 * and any memberships pointing at it. Called when the server reports the
 * ledger no longer exists (the creator deleted it), so it disappears on all
 * devices — not just the one that deleted it.
 */
export function purgeLedgerEverywhere(ledgerId) {
  saveLedgers(loadLedgers().filter((l) => l.id !== ledgerId));
  clearBillsForLedger(ledgerId);
  const allSettlements = loadAllSettlements().filter((s) => s.ledgerId !== ledgerId);
  localStorage.setItem(SETTLEMENTS_KEY, JSON.stringify(allSettlements));
  // Member records themselves stay — they are shared across ledgers
  // (e.g. the same household account on several ledgers).
}

// ── Settlements (recorded debt payments) ─────────────────────────────

function loadAllSettlements() {
  try {
    const arr = JSON.parse(localStorage.getItem(SETTLEMENTS_KEY));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** All recorded settlements for one ledger (local cache). */
export function loadSettlements(ledgerId) {
  return loadAllSettlements().filter((s) => s.ledgerId === ledgerId);
}

/**
 * Record a settlement: `fromUserId` paid `amount` to `toUserId`.
 * Saves locally and pushes to the server for cross-device sync (fire-and-forget).
 */
export function appendSettlement({ ledgerId, fromUserId, toUserId, amount }) {
  const settlement = {
    id: genUuid(),
    ledgerId,
    fromUserId,
    toUserId,
    amount: Math.round(amount * 100) / 100,
    timestamp: Date.now(),
  };
  const all = loadAllSettlements();
  all.push(settlement);
  localStorage.setItem(SETTLEMENTS_KEY, JSON.stringify(all));
  pushSettlementToServer(settlement).catch((err) =>
    console.error('[appendSettlement] server push failed:', err.message)
  );
  return settlement;
}

async function pushSettlementToServer(s) {
  try {
    const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(s.ledgerId)}/settlements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settlement_id: s.id,
        from_user: s.fromUserId,
        to_user: s.toUserId,
        amount: s.amount,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('[pushSettlementToServer] error:', res.status, body);
    }
  } catch (err) {
    console.error('[pushSettlementToServer] fetch failed:', err.message);
  }
}

/**
 * Merge server settlements into the local cache (cross-device sync).
 * Returns the full local list for this ledger after merging, or null on failure.
 */
export async function mergeSettlementsFromServer(ledgerId) {
  try {
    const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(ledgerId)}/settlements`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.settlements)) return null;

    const all = loadAllSettlements();
    const knownIds = new Set(all.map((s) => s.id));
    let changed = false;
    for (const srv of data.settlements) {
      if (!srv?.id || knownIds.has(srv.id)) continue;
      // Coerce types — server may return strings from PostgreSQL
      const amount = typeof srv.amount === 'string' ? Number(srv.amount) : srv.amount;
      const ts = typeof srv.timestamp === 'string' ? Number(srv.timestamp) : srv.timestamp;
      all.push({
        id: srv.id,
        ledgerId,
        fromUserId: srv.fromUserId,
        toUserId: srv.toUserId,
        amount,
        timestamp: ts,
      });
      knownIds.add(srv.id);
      changed = true;
    }
    if (changed) localStorage.setItem(SETTLEMENTS_KEY, JSON.stringify(all));
    return all.filter((s) => s.ledgerId === ledgerId);
  } catch (err) {
    console.error('[mergeSettlementsFromServer] failed:', err.message);
    return null;
  }
}

/** Remove all settlements for a ledger locally AND on the server. */
export function clearSettlementsForLedger(ledgerId) {
  const all = loadAllSettlements().filter((s) => s.ledgerId !== ledgerId);
  localStorage.setItem(SETTLEMENTS_KEY, JSON.stringify(all));
  fetch(`${API_BASE}/api/rooms/${encodeURIComponent(ledgerId)}/settlements`, { method: 'DELETE' }).catch(
    (err) => console.error('[clearSettlementsForLedger] server clear failed:', err.message)
  );
}

// ── Ledgers ────────────────────────────────────────────────────────────

const validLedger = (l) =>
  Boolean(
    l &&
      typeof l.id === "string" &&
      typeof l.name === "string" &&
      typeof l.inviteCode === "string" &&
      Array.isArray(l.memberIds)
  );

export function loadLedgers() {
  try {
    const arr = JSON.parse(localStorage.getItem(LEDGERS_KEY));
    return Array.isArray(arr) ? arr.filter(validLedger) : [];
  } catch {
    return [];
  }
}

export const saveLedgers = (ledgers) =>
  localStorage.setItem(LEDGERS_KEY, JSON.stringify(ledgers));

/**
 * Create a ledger — writes to the backend API (shared across devices)
 * and caches in localStorage for offline access.
 */
export async function createLedger(name, creatorId, creatorName) {
  try {
    const res = await fetch(`${API_BASE}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        creator_id: creatorId,
        creator_name: creatorName,
        creator_color: (loadMembers().find(m => m.id === creatorId) || {}).color || null,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("[createLedger] API error:", res.status, body);
      throw new Error(body.error || "Failed to create ledger on server");
    }

    const result = await res.json();
    const srvLedger = result.ledger;

    // Normalize to local schema
    const local = {
      id: srvLedger.id,
      name: srvLedger.name,
      inviteCode: srvLedger.invite_code,
      createdBy: srvLedger.created_by,
      createdAt: srvLedger.created_at,
      memberIds: srvLedger.member_ids,
    };

    // Cache in localStorage
    const ledgers = loadLedgers();
    if (!ledgers.some((l) => l.id === local.id)) {
      ledgers.push(local);
      saveLedgers(ledgers);
    }

    // Upsert all server members into local state (includes creator with server-assigned color)
    if (Array.isArray(result.members)) {
      upsertMembers(result.members);
    }

    return { ledger: local, dbUserId: result.db_user_id || creatorId };
  } catch (err) {
    console.error("[createLedger] Failed, falling back to local:", err.message);

    // Offline fallback — create locally (won't be visible to other devices)
    const local = {
      id: genUuid(),
      name: name.trim(),
      inviteCode: generateInviteCode(),
      createdBy: creatorId,
      createdAt: Date.now(),
      memberIds: [creatorId],
      offlineOnly: true, // never uploaded — reconciliation must not purge it
    };
    const ledgers = loadLedgers();
    ledgers.push(local);
    saveLedgers(ledgers);
    return { ledger: local, dbUserId: creatorId };
  }
}

/**
 * Join a ledger — queries the backend API (shared across devices)
 * and caches the result in localStorage.
 */
export async function joinLedger(inviteCode, userId, userName) {
  const code = inviteCode.trim().toUpperCase();

  try {
    const res = await fetch(`${API_BASE}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invite_code: code,
        user_id: userId,
        user_name: userName,
        user_color: (loadMembers().find(m => m.id === userId) || {}).color || null,
      }),
    });

    if (res.status === 404) {
      console.log(`[joinLedger] No ledger found for code "${code}"`);
      // If a locally cached ledger shares this code, it was deleted server-side
      // (e.g. by its admin on another device) — purge it locally too.
      // Offline-only ledgers never existed on the server, so leave them alone.
      const stale = loadLedgers().find((l) => l.inviteCode === code && !l.offlineOnly);
      if (stale) purgeLedgerEverywhere(stale.id);
      return null;
    }
    if (res.status === 405 || res.status === 501) {
      // Backend routes missing — likely the API is not deployed at this origin
      console.error(`[joinLedger] Backend API not reachable (${res.status}) — is the sync server deployed?`);
      return "unreachable";
    }
    if (res.status === 409) {
      return "full";
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("[joinLedger] API error:", res.status, body);
      throw new Error(body.error || "Failed to join ledger");
    }

    const result = await res.json();
    const srvLedger = result.ledger;

    // Normalize to local schema
    const local = {
      id: srvLedger.id,
      name: srvLedger.name,
      inviteCode: srvLedger.invite_code,
      createdBy: srvLedger.created_by,
      createdAt: srvLedger.created_at,
      memberIds: srvLedger.member_ids,
    };

    // Cache in localStorage
    const ledgers = loadLedgers();
    const existing = ledgers.findIndex((l) => l.id === local.id);
    if (existing >= 0) {
      ledgers[existing] = local;
    } else {
      ledgers.push(local);
    }
    saveLedgers(ledgers);

    // Upsert all server members into local state
    if (Array.isArray(result.members)) {
      upsertMembers(result.members);
    }

    return { ledger: local, dbUserId: result.db_user_id || userId };
  } catch (err) {
    console.error("[joinLedger] API failed:", err.message);

    // Offline fallback — check local cache only
    const ledgers = loadLedgers();
    const ledger = ledgers.find((l) => l.inviteCode === code);
    if (!ledger) return null;
    if (ledger.memberIds.includes(userId)) return { ledger, dbUserId: userId };
    if (ledger.memberIds.length >= 10) return "full";
    ledger.memberIds.push(userId);
    saveLedgers(ledgers);
    return { ledger, dbUserId: userId };
  }
}

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateInviteCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function getLedgerMembers(ledger, allMembers) {
  return allMembers.filter((m) => ledger.memberIds.includes(m.id));
}

/**
 * Refresh a ledger from the backend — fetches current members and updates localStorage.
 * Returns { members, memberIds } on success, null on failure.
 */
export async function refreshLedger(ledgerId) {
  try {
    const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(ledgerId)}`);
    if (res.status === 404) {
      // The ledger was deleted (by its admin on another device, for example).
      // Purge it everywhere locally so it disappears for this user too —
      // unless it was created offline and never uploaded (server can't know it).
      const local = loadLedgers().find((l) => l.id === ledgerId);
      if (local?.offlineOnly) return null;
      console.log(`[refreshLedger] Ledger ${ledgerId} no longer exists — removing locally`);
      purgeLedgerEverywhere(ledgerId);
      return { deleted: true };
    }
    if (!res.ok) return null;
    const data = await res.json();

    // Update the ledger's member IDs + createdBy (may be missing from older local records)
    const ledgers = loadLedgers();
    const idx = ledgers.findIndex(l => l.id === ledgerId);
    if (idx >= 0) {
      ledgers[idx].memberIds = data.member_ids || [];
      if (data.ledger && data.ledger.created_by) {
        ledgers[idx].createdBy = data.ledger.created_by;
      }
      saveLedgers(ledgers);
    }

    // Upsert all members into local state
    if (Array.isArray(data.members)) {
      upsertMembers(data.members);
    }

    return { members: data.members, memberIds: data.member_ids };
  } catch (err) {
    console.error('[refreshLedger] Failed:', err.message);
    return null;
  }
}

/**
 * Upsert members from server response into local member list.
 * Creates missing members, updates existing ones (name, color, ID).
 * Handles the case where the server assigned a new UUID for a local member.
 */
export function upsertMembers(serverMembers) {
  if (!Array.isArray(serverMembers) || serverMembers.length === 0) return null;
  const members = loadMembers();
  const byId = new Map(members.map(m => [m.id, m]));
  const byName = new Map(members.map(m => [m.name.toLowerCase(), m]));
  let changed = false;
  let returnedUserId = null;

  for (const srv of serverMembers) {
    const existingById = byId.get(srv.id);
    if (existingById) {
      // Update name from server, but NEVER overwrite local color —
      // the local color was assigned at signup and is the user's identity.
      if (srv.name && existingById.name !== srv.name) { existingById.name = srv.name; changed = true; }
      // Color intentionally NOT updated from server
      continue;
    }
    // Try to find by name (local member with different ID)
    const existingByName = byName.get((srv.name || '').toLowerCase());
    if (existingByName) {
      const oldId = existingByName.id;
      // Update this member's ID to match server
      existingByName.id = srv.id;
      // Color intentionally NOT updated from server — preserve local signup color
      // Update bill payerIds
      try {
        const bills = JSON.parse(localStorage.getItem(BILLS_KEY));
        if (Array.isArray(bills)) {
          for (const b of bills) {
            if (b.payerId === oldId) b.payerId = srv.id;
            if (Array.isArray(b.splitAmongIds)) b.splitAmongIds = b.splitAmongIds.map(id => id === oldId ? srv.id : id);
          }
          localStorage.setItem(BILLS_KEY, JSON.stringify(bills));
        }
      } catch { /* ok */ }
      // Update ledger member IDs
      const ledgers = loadLedgers();
      for (const l of ledgers) {
        const idx = l.memberIds.indexOf(oldId);
        if (idx >= 0) l.memberIds[idx] = srv.id;
      }
      saveLedgers(ledgers);
      // Update session if this is the current user
      if (loadSavedUser() === oldId) saveUser(srv.id);
      byId.set(srv.id, existingByName);
      byId.delete(oldId);
      changed = true;
      continue;
    }
    // Brand new member — create local record (minimal, just enough to render).
    // No passwordHash → NOT a local account (never shows on the sign-in screen).
    const newMember = {
      id: srv.id,
      name: srv.name || 'Unknown',
      color: srv.color || assignDefaultColor(members.map(m => m.color)),
      salt: '',
      passwordHash: '',
      joinedAt: Date.now(),
    };
    members.push(newMember);
    byId.set(srv.id, newMember);
    changed = true;
  }

  if (changed) saveMembers(members);
  return changed;
}

// Assign a color not already in use from the palette
const COLOR_PALETTE = [
  '#b0413e', '#c0762c', '#c19b2c', '#4a8c52', '#2f8f83',
  '#38699f', '#52589f', '#7b4b94', '#b85c79', '#7a5230',
  '#6f7a2e', '#3a3733',
];
function assignDefaultColor(takenColors) {
  const available = COLOR_PALETTE.filter(c => !takenColors.includes(c));
  if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

export async function refreshLedgerListMeta() {
  try {
    const ledgers = loadLedgers();
    let changed = false;
    for (const l of ledgers) {
      if (l.createdBy) continue; // already have it
      try {
        const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(l.id)}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.ledger && data.ledger.created_by) {
          l.createdBy = data.ledger.created_by;
          changed = true;
        }
      } catch { /* skip */ }
    }
    if (changed) saveLedgers(ledgers);
  } catch { /* ok */ }
}

/**
 * Server-truth reconciliation: for every locally cached ledger, ask the server
 * whether it still exists and whether this user is still a member. Ledgers
 * deleted by their admin (or memberships revoked) are purged locally so they
 * disappear on every device, not just the one that performed the delete.
 * Returns true if anything changed locally.
 */
export async function reconcileLedgersWithServer(userId) {
  let changed = false;
  const ledgers = loadLedgers();
  for (const l of ledgers) {
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(l.id)}`);
      if (res.status === 404) {
        if (!l.offlineOnly) {
          // Skip offline-only ledgers: the server never knew them, so 404 is
          // expected and does NOT mean they were deleted.
          purgeLedgerEverywhere(l.id);
          changed = true;
        }
        continue;
      }
      if (!res.ok) continue; // server unreachable / transient — keep local copy
      const data = await res.json();
      const memberIds = Array.isArray(data.member_ids) ? data.member_ids : [];
      if (!memberIds.includes(userId)) {
        // This account was removed from the ledger — drop it locally.
        purgeLedgerEverywhere(l.id);
        changed = true;
      }
    } catch { /* server unreachable — keep local copy */ }
  }
  return changed;
}

// ── Delete Ledger (creator only, soft delete) ──────────────────────────

/** Delete a ledger on the server (soft delete). Only the creator can do this. */
export async function deleteLedger(ledgerId, userId) {
  // Always remove from local state first (offline-first)
  purgeLedgerEverywhere(ledgerId);

  try {
    // Ask the server to delete. The backend enforces creator-only using the
    // real created_by it has on file — the client's user_id is just a claim.
    const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(ledgerId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('[deleteLedger] API error:', res.status, body);
      // Server rejected but local delete succeeded — still report ok
      return { ok: true };
    }
    return { ok: true };
  } catch (err) {
    console.error('[deleteLedger] server error (local delete succeeded):', err.message);
    // Server unreachable but local delete succeeded
    return { ok: true };
  }
}

/** Fetch net balances for a ledger from the server (for delete warning). */
export async function fetchBalances(ledgerId) {
  try {
    const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(ledgerId)}/balances`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.balances || null;
  } catch (err) {
    console.error('[fetchBalances] failed:', err.message);
    return null;
  }
}

// ── Session ────────────────────────────────────────────────────────────

export function loadSavedUser() {
  const id = localStorage.getItem(USER_KEY);
  return typeof id === "string" && id !== "" ? id : null;
}

export const saveUser = (id) => localStorage.setItem(USER_KEY, id);

export const clearUser = () => localStorage.removeItem(USER_KEY);
