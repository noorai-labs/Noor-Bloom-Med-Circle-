CREATE TABLE IF NOT EXISTS appointment_slots (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  space_id TEXT NOT NULL REFERENCES care_spaces(id),
  visit_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('Requested', 'Confirmed', 'In Progress', 'Completed', 'Cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS appointment_active_slot
  ON appointment_slots(provider_id, date, time)
  WHERE status IN ('Requested', 'Confirmed', 'In Progress');

CREATE INDEX IF NOT EXISTS appointment_slots_space_visit
  ON appointment_slots(space_id, visit_id);
