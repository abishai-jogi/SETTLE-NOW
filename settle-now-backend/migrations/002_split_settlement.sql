-- Migration 002 — Split modes + settlement lifecycle (PhonePe Split model)
--
-- Idempotent: safe to run repeatedly. The backend also runs db/schema.sql on
-- boot, but CREATE TABLE IF NOT EXISTS cannot add columns to existing tables,
-- so this migration is what upgrades a live database in place.
--
-- Existing expense rows are all implicitly EQUAL splits with the payer
-- participating, which is exactly the DEFAULT of both new columns —
-- no backfill of historical data is required.
--
-- Existing settlement rows are all confirmed payments, which is exactly the
-- DEFAULT status 'COMPLETED' — no backfill required there either.

-- ── 1. Expenses: payer participation flag ────────────────────────────────
-- TRUE  → the payer is included in participant_ids (historic behaviour).
-- FALSE → the payer fronted the money but is NOT part of the split; the full
--         amount_cents is divided among the listed participants only.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS payer_participates BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 2. Expenses: enforce the split-mode enum ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_split_type_chk'
  ) THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_split_type_chk
        CHECK (split_type IN ('EQUAL', 'EXACT', 'PERCENT', 'SHARES'));
  END IF;
END $$;

-- ── 3. Settlements: real lifecycle ────────────────────────────────────────
-- PENDING   — payment initiated, not confirmed; still counts against the
--             balance but renders as "awaiting confirmation".
-- COMPLETED — confirmed; clears the debt. (Default → historic rows correct.)
-- VOID      — cancelled/wrong entry; excluded from all balance maths.
ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN IF NOT EXISTS method      TEXT NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS note        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS settled_at  BIGINT,
  ADD COLUMN IF NOT EXISTS created_by  UUID REFERENCES users(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlements_status_chk'
  ) THEN
    ALTER TABLE settlements
      ADD CONSTRAINT settlements_status_chk
        CHECK (status IN ('PENDING', 'COMPLETED', 'VOID'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlements_method_chk'
  ) THEN
    ALTER TABLE settlements
      ADD CONSTRAINT settlements_method_chk
        CHECK (method IN ('UPI', 'CASH', 'OTHER'));
  END IF;
END $$;
