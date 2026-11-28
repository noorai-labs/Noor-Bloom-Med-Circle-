\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA :"validation_schema";
SET LOCAL search_path TO :"validation_schema", pg_catalog;
\ir schema.sql
\ir schema.sql

INSERT INTO care_spaces (id, state) VALUES ('fixture-patient', '{}');
INSERT INTO workspace_organizations (space_id, organization_id)
VALUES ('fixture-patient', 'org_bloom');
INSERT INTO workspace_join_requests (id, user_id, space_id, organization_id, status)
VALUES ('fixture-request', 'fixture-doctor', 'fixture-patient', 'org_bloom', 'Pending');
INSERT INTO appointment_slots (id, provider_id, date, time, space_id, visit_id, status)
VALUES ('fixture-slot', 'fixture-doctor', '2026-01-01', '09:00', 'fixture-patient', 'fixture-visit', 'Confirmed');

DO $$
BEGIN
  IF (SELECT attempt FROM workspace_join_requests WHERE id = 'fixture-request') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Workspace request attempt must default to 1';
  END IF;

  BEGIN
    INSERT INTO appointment_slots (id, provider_id, date, time, space_id, visit_id, status)
    VALUES ('duplicate-slot', 'fixture-doctor', '2026-01-01', '09:00', 'fixture-patient', 'another-visit', 'Requested');
    RAISE EXCEPTION 'Duplicate active appointment slot was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$$;

ROLLBACK;

SELECT NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = :'validation_schema'
) AS validation_rolled_back
\gset
\if :validation_rolled_back
  \echo PostgreSQL schema and fixture validation passed.
\else
  \echo PostgreSQL validation schema was not rolled back.
  SELECT 1 / 0;
\endif
