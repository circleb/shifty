-- Times are stored as Unix seconds (UTC). The sheet's tz is used for display and for generating slots.

CREATE TABLE IF NOT EXISTS sheets (
  id          TEXT PRIMARY KEY,          -- public id in the share link
  admin_token TEXT NOT NULL UNIQUE,      -- secret in the admin link
  title       TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  tz          TEXT NOT NULL,
  ranges_json TEXT NOT NULL,             -- the ranges the admin entered, kept for reference
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS slots (
  id        TEXT PRIMARY KEY,
  sheet_id  TEXT NOT NULL REFERENCES sheets(id),
  starts_at INTEGER NOT NULL,
  ends_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_slots_sheet ON slots (sheet_id, starts_at);

-- One claim per slot. The UNIQUE constraint on slot_id is what prevents double-booking.
CREATE TABLE IF NOT EXISTS claims (
  id                TEXT PRIMARY KEY,
  slot_id           TEXT NOT NULL UNIQUE REFERENCES slots(id),
  name              TEXT NOT NULL,
  email             TEXT,
  remind_before_min INTEGER NOT NULL DEFAULT 0,   -- 0 = none, 120 = 2 hours, 1440 = 1 day
  cancel_token      TEXT NOT NULL UNIQUE,
  reminded_at       INTEGER,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_claims_reminders ON claims (reminded_at, remind_before_min);
