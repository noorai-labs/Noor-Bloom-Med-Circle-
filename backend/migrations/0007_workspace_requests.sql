ALTER TABLE workspace_organizations ADD COLUMN name TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS organization_admins (
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS workspace_join_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  space_id TEXT NOT NULL REFERENCES care_spaces(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  status TEXT NOT NULL CHECK(status IN ('Pending', 'Approved', 'Rejected')),
  reason TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, space_id)
);

CREATE INDEX IF NOT EXISTS workspace_join_requests_org_status
  ON workspace_join_requests(organization_id, status, updated_at);
