-- Runs once on first volume initialization (Postgres docker-entrypoint-initdb.d).
-- Creates the dedicated test database so `npm test` does not wipe the dev data in `bonial_locations`.
CREATE DATABASE bonial_locations_test;
