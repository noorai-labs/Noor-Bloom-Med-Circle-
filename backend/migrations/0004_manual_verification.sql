CREATE TABLE verification_reviewers (
 user_id TEXT PRIMARY KEY,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE verification_applications (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('Patient','Doctor','Nurse')),
 status TEXT NOT NULL CHECK(status IN ('Submitted','Needs information','Approved','Rejected','Suspended')),
 revision INTEGER NOT NULL DEFAULT 1,
 details TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 valid_until TEXT NOT NULL DEFAULT '',
 submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,kind)
);
CREATE INDEX verification_review_queue ON verification_applications(status,updated_at,id);
CREATE TABLE verification_documents (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 name TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL,
 ready INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX verification_document_owner ON verification_documents(user_id,created_at);
CREATE TABLE verification_submission_documents (
 application_id TEXT NOT NULL REFERENCES verification_applications(id),
 submission_revision INTEGER NOT NULL,
 document_id TEXT NOT NULL REFERENCES verification_documents(id),
 PRIMARY KEY(application_id,submission_revision,document_id)
);
CREATE TABLE verification_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 application_id TEXT NOT NULL REFERENCES verification_applications(id),
 revision INTEGER NOT NULL,
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL,
 reason TEXT NOT NULL,
 identity_reference TEXT NOT NULL DEFAULT '',
 registration_reference TEXT NOT NULL DEFAULT '',
 details TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(application_id,revision)
);
