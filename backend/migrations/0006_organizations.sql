CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspace_organizations (
  space_id TEXT PRIMARY KEY REFERENCES care_spaces(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO organizations (id, name, code) VALUES
  ('org_bloom', 'MedBloom Health Network', 'BLOOM'),
  ('org_apollo', 'Apollo Clinic Network', 'APOLLO'),
  ('org_city', 'City General Hospital', 'CGH'),
  ('org_fortis', 'Fortis Care Center', 'FORTIS');
