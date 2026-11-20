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

INSERT OR IGNORE INTO appointment_slots (id, provider_id, date, time, space_id, visit_id, status)
SELECT
  'slot_' || care_spaces.id || '_' || json_extract(value, '$.id'),
  json_extract(value, '$.providerId'),
  json_extract(value, '$.date'),
  json_extract(value, '$.time'),
  care_spaces.id,
  json_extract(value, '$.id'),
  json_extract(value, '$.status')
FROM care_spaces, json_each(care_spaces.state, '$.visits')
WHERE json_extract(value, '$.id') IS NOT NULL
  AND json_extract(value, '$.providerId') IS NOT NULL
  AND json_extract(value, '$.date') IS NOT NULL
  AND json_extract(value, '$.time') IS NOT NULL
  AND json_extract(value, '$.status') IS NOT NULL;
