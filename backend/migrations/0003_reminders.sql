CREATE TABLE reminder_settings (
  user_id TEXT NOT NULL,
  space_id TEXT NOT NULL REFERENCES care_spaces(id),
  preferences TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, space_id)
);
CREATE TABLE reminder_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  space_id TEXT NOT NULL REFERENCES care_spaces(id),
  owner_tag TEXT NOT NULL,
  token TEXT,
  mode TEXT NOT NULL CHECK(mode IN ('local','server','off')),
  timezone TEXT NOT NULL,
  active_since INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX reminder_device_token ON reminder_devices(token) WHERE token IS NOT NULL;
CREATE INDEX reminder_device_space ON reminder_devices(user_id,space_id);
CREATE TABLE reminder_revoked_sessions (
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  PRIMARY KEY (user_id,session_id)
);
CREATE TABLE reminder_deliveries (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  medicine_id TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt INTEGER NOT NULL,
  ticket TEXT,
  receipt_at INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX reminder_delivery_pending ON reminder_deliveries(user_id,space_id,status,next_attempt);
