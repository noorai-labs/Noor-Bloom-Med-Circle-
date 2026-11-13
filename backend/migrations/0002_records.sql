CREATE TABLE security_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  space_id TEXT,
  action TEXT NOT NULL,
  target_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX audit_space ON security_audit(space_id,id);
CREATE TABLE record_versions (
  space_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  metadata TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(space_id,record_id,version)
);
ALTER TABLE memberships ADD COLUMN records_access INTEGER NOT NULL DEFAULT 0;
