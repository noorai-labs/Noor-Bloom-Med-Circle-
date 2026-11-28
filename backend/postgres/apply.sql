\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(138773102, 1);

SELECT pg_catalog.to_regclass('bloom_med.schema_migrations') IS NOT NULL AS initialized
\gset
\if :initialized
  SELECT EXISTS (
    SELECT 1 FROM bloom_med.schema_migrations
    WHERE version = 1 AND checksum = :'schema_checksum'
  ) AS current_baseline
  \gset
  \if :current_baseline
    \echo PostgreSQL baseline 1 is already applied.
  \else
    DO $$ BEGIN
      RAISE EXCEPTION 'The installed baseline differs. Add a numbered migration for schema changes.';
    END $$;
  \endif
\else
  CREATE SCHEMA bloom_med;
  SET LOCAL search_path TO bloom_med, pg_catalog;
  \ir schema.sql
  CREATE TABLE bloom_med.schema_migrations (
    version INTEGER PRIMARY KEY,
    checksum TEXT NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  INSERT INTO bloom_med.schema_migrations (version, checksum)
  VALUES (1, :'schema_checksum');
\endif

DO $$ BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'bloom_med') <> 24
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_indexes
      WHERE schemaname = 'bloom_med' AND indexname = 'appointment_active_slot'
    )
    OR (SELECT count(*) FROM bloom_med.organizations
        WHERE id IN ('org_bloom', 'org_apollo', 'org_city', 'org_fortis')) <> 4 THEN
    RAISE EXCEPTION 'PostgreSQL baseline verification failed';
  END IF;
END $$;

COMMIT;

SELECT version, applied_at
FROM bloom_med.schema_migrations
WHERE version = 1;
