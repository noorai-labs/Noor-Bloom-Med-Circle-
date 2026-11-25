-- ============================================================================
-- BloomMed: Production PostgreSQL Schema Draft
-- Target: PostgreSQL 14+ / Neon / AWS RDS / Supabase
-- Migrates from Cloudflare D1 (0001_care.sql through 0006_appointment_slots.sql)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Core Care Spaces & Memberships (from 0001_care.sql)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS care_spaces (
  id VARCHAR(64) PRIMARY KEY,
  state JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id VARCHAR(64) NOT NULL,
  space_id VARCHAR(64) NOT NULL REFERENCES care_spaces(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('Patient', 'Family', 'Doctor', 'Nurse', 'Admin')),
  provider_id VARCHAR(64) NOT NULL DEFAULT '',
  records_access BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, space_id)
);

CREATE INDEX IF NOT EXISTS memberships_space_idx ON memberships(space_id);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id);

CREATE TABLE IF NOT EXISTS attachments (
  id VARCHAR(64) PRIMARY KEY,
  space_id VARCHAR(64) NOT NULL REFERENCES care_spaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  mime VARCHAR(128) NOT NULL,
  size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS attachments_space_idx ON attachments(space_id);

-- ----------------------------------------------------------------------------
-- 2. Audit Trails & Record Versioning (from 0002_records.sql)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS security_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id VARCHAR(64) NOT NULL,
  space_id VARCHAR(64),
  action VARCHAR(128) NOT NULL,
  target_id VARCHAR(128),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS audit_space_id_idx ON security_audit(space_id, id);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON security_audit(actor_id);

CREATE TABLE IF NOT EXISTS record_versions (
  space_id VARCHAR(64) NOT NULL REFERENCES care_spaces(id) ON DELETE CASCADE,
  record_id VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL,
  metadata JSONB NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (space_id, record_id, version)
);

CREATE INDEX IF NOT EXISTS record_versions_space_record_idx ON record_versions(space_id, record_id);

-- ----------------------------------------------------------------------------
-- 3. Medicine Reminders (from 0003_reminders.sql)
-- (Note: Durable Object internal SQLite is excluded; these tables manage API sync)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reminder_settings (
  user_id VARCHAR(64) NOT NULL,
  space_id VARCHAR(64) NOT NULL REFERENCES care_spaces(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, space_id)
);

CREATE TABLE IF NOT EXISTS reminder_devices (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  space_id VARCHAR(64) NOT NULL REFERENCES care_spaces(id) ON DELETE CASCADE,
  owner_tag VARCHAR(64) NOT NULL,
  token TEXT,
  mode VARCHAR(16) NOT NULL CHECK (mode IN ('local', 'server', 'off')),
  timezone VARCHAR(64) NOT NULL,
  active_since BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS reminder_device_token_idx ON reminder_devices(token) WHERE token IS NOT NULL;
CREATE INDEX IF NOT EXISTS reminder_device_space_idx ON reminder_devices(user_id, space_id);

CREATE TABLE IF NOT EXISTS reminder_revoked_sessions (
  user_id VARCHAR(64) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (user_id, session_id)
);

CREATE TABLE IF NOT EXISTS reminder_deliveries (
  id VARCHAR(64) PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  space_id VARCHAR(64) NOT NULL,
  medicine_id VARCHAR(64) NOT NULL,
  due_at BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt BIGINT NOT NULL,
  ticket TEXT,
  receipt_at BIGINT,
  error TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS reminder_delivery_pending_idx ON reminder_deliveries(user_id, space_id, status, next_attempt);

-- ----------------------------------------------------------------------------
-- 4. Professional Verification (from 0004_manual_verification.sql)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS verification_reviewers (
  user_id VARCHAR(64) PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS verification_applications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('Patient', 'Doctor', 'Nurse')),
  status VARCHAR(32) NOT NULL CHECK (status IN ('Submitted', 'Needs information', 'Approved', 'Rejected', 'Suspended')),
  revision INTEGER NOT NULL DEFAULT 1,
  details JSONB NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  valid_until VARCHAR(32) NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, kind)
);

CREATE INDEX IF NOT EXISTS verification_review_queue_idx ON verification_applications(status, updated_at, id);

CREATE TABLE IF NOT EXISTS verification_documents (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  mime VARCHAR(128) NOT NULL,
  size BIGINT NOT NULL,
  ready BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS verification_document_owner_idx ON verification_documents(user_id, created_at);

CREATE TABLE IF NOT EXISTS verification_submission_documents (
  application_id VARCHAR(64) NOT NULL REFERENCES verification_applications(id) ON DELETE CASCADE,
  submission_revision INTEGER NOT NULL,
  document_id VARCHAR(64) NOT NULL REFERENCES verification_documents(id) ON DELETE CASCADE,
  PRIMARY KEY (application_id, submission_revision, document_id)
);

CREATE TABLE IF NOT EXISTS verification_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id VARCHAR(64) NOT NULL REFERENCES verification_applications(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  reason TEXT NOT NULL,
  identity_reference VARCHAR(128) NOT NULL DEFAULT '',
  registration_reference VARCHAR(128) NOT NULL DEFAULT '',
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (application_id, revision)
);

-- ----------------------------------------------------------------------------
-- 5. Consultation Video Calls (from 0005_consultation_calls.sql)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS consultation_calls (
  space_id VARCHAR(64) NOT NULL REFERENCES care_spaces(id) ON DELETE CASCADE,
  visit_id VARCHAR(64) NOT NULL,
  room_id VARCHAR(128) NOT NULL UNIQUE,
  schedule_key VARCHAR(128) NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closing', 'closed')),
  ends_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  last_checked BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (space_id, visit_id)
);

CREATE INDEX IF NOT EXISTS consultation_call_expiry_idx ON consultation_calls(state, ends_at);

CREATE TABLE IF NOT EXISTS consultation_call_participants (
  room_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  identity VARCHAR(128) NOT NULL,
  last_issued BIGINT NOT NULL,
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS consultation_call_session_idx ON consultation_call_participants(user_id, session_id);

CREATE TABLE IF NOT EXISTS consultation_call_slots (
  slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 3),
  room_id VARCHAR(128) NOT NULL UNIQUE,
  reserved_at BIGINT NOT NULL
);

-- ----------------------------------------------------------------------------
-- 6. Appointment Slot Invariants & Concurrency (from 0006_appointment_slots.sql)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS appointment_slots (
  id VARCHAR(128) PRIMARY KEY,
  provider_id VARCHAR(64) NOT NULL,
  date VARCHAR(16) NOT NULL,
  time VARCHAR(16) NOT NULL,
  space_id VARCHAR(64) NOT NULL REFERENCES care_spaces(id) ON DELETE CASCADE,
  visit_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('Requested', 'Confirmed', 'In Progress', 'Completed', 'Cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Active appointment slot unique partial index:
-- Guarantees at database-level that no care professional can have overlapping active bookings
CREATE UNIQUE INDEX IF NOT EXISTS appointment_active_slot
  ON appointment_slots(provider_id, date, time)
  WHERE status IN ('Requested', 'Confirmed', 'In Progress');

CREATE INDEX IF NOT EXISTS appointment_slots_space_visit_idx
  ON appointment_slots(space_id, visit_id);

CREATE TABLE IF NOT EXISTS completed_operations (
  space_id VARCHAR(64) NOT NULL REFERENCES care_spaces(id) ON DELETE CASCADE,
  operation_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (space_id, operation_id)
);
