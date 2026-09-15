-- Settle Now server schema. Timestamps are epoch milliseconds (BIGINT) to match
-- the Android clients exactly, so sync cursors are directly comparable.

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY,
    name            TEXT NOT NULL,
    avatar_initials TEXT NOT NULL DEFAULT '?',
    color           TEXT NOT NULL DEFAULT '#3a3733',
    password_hash   TEXT NOT NULL DEFAULT '',
    salt            TEXT NOT NULL DEFAULT '',
    created_at      BIGINT NOT NULL,
    updated_at      BIGINT NOT NULL,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS rooms (
    id          UUID PRIMARY KEY,
    name        TEXT NOT NULL,
    invite_code TEXT NOT NULL,
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  BIGINT NOT NULL,
    updated_at  BIGINT NOT NULL,
    is_deleted  BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_rooms_invite_code ON rooms (invite_code);
CREATE INDEX IF NOT EXISTS idx_rooms_updated_at ON rooms (updated_at);

CREATE TABLE IF NOT EXISTS room_members (
    room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id),
    joined_at  BIGINT NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members (user_id);

CREATE TABLE IF NOT EXISTS expenses (
    id          UUID PRIMARY KEY,
    room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    paid_by     UUID NOT NULL REFERENCES users(id),
    amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
    description TEXT NOT NULL DEFAULT '',
    split_type  TEXT NOT NULL DEFAULT 'EQUAL',
    created_at  BIGINT NOT NULL,
    updated_at  BIGINT NOT NULL,
    is_deleted  BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_expenses_room ON expenses (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_updated_at ON expenses (updated_at);

CREATE TABLE IF NOT EXISTS expense_participants (
    expense_id  UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id),
    share_cents BIGINT NOT NULL CHECK (share_cents >= 0),
    updated_at  BIGINT NOT NULL,
    is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (expense_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_expense_participants_user ON expense_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_expense_participants_updated_at ON expense_participants (updated_at);

CREATE TABLE IF NOT EXISTS settlements (
    id           UUID PRIMARY KEY,
    room_id      UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    from_user    UUID NOT NULL REFERENCES users(id),
    to_user      UUID NOT NULL REFERENCES users(id),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    created_at   BIGINT NOT NULL,
    updated_at   BIGINT NOT NULL,
    is_deleted   BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_settlements_room ON settlements (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_updated_at ON settlements (updated_at);

-- Losing writes under last-write-wins are recorded here instead of vanishing,
-- mirroring the device-local conflict_log.
CREATE TABLE IF NOT EXISTS conflict_log (
    id                BIGSERIAL PRIMARY KEY,
    entity_type       TEXT NOT NULL,
    entity_id         TEXT NOT NULL,
    loser_operation   TEXT NOT NULL DEFAULT 'update',
    loser_payload     JSONB NOT NULL,
    loser_updated_at  BIGINT,
    winner_updated_at BIGINT,
    logged_at         BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conflict_log_entity ON conflict_log (entity_type, entity_id);
