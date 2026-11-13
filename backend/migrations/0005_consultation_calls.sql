CREATE TABLE consultation_calls (
 space_id TEXT NOT NULL REFERENCES care_spaces(id),
 visit_id TEXT NOT NULL,
 room_id TEXT NOT NULL UNIQUE,
 schedule_key TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','closing','closed')),
 ends_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 last_checked INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(space_id,visit_id)
);
CREATE TABLE consultation_call_participants (
 room_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 session_id TEXT NOT NULL,
 identity TEXT NOT NULL,
 last_issued INTEGER NOT NULL,
 PRIMARY KEY(room_id,user_id)
);
CREATE INDEX consultation_call_expiry ON consultation_calls(state,ends_at);
CREATE INDEX consultation_call_session ON consultation_call_participants(user_id,session_id);
CREATE TABLE consultation_call_slots (
 slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 3),
 room_id TEXT NOT NULL UNIQUE,
 reserved_at INTEGER NOT NULL
);
