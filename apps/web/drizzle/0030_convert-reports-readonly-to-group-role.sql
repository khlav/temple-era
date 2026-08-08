-- Splits identity from privilege: reports_readonly becomes a pure NOLOGIN privilege-holding
-- role (all its SELECT grants from 0029 are untouched), and a separate LOGIN role — templar —
-- is granted membership in it. Templar connects as itself, not as reports_readonly directly, so
-- a future second consumer of the same reporting scope gets its own LOGIN role and its own
-- audit trail instead of sharing this credential.
ALTER ROLE reports_readonly NOLOGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'templar') THEN
    CREATE ROLE templar LOGIN;
  END IF;
END
$$;

COMMENT ON ROLE templar IS
  'Login identity for the Templar Discord bot''s ad hoc SQL query feature. Privileges come
  entirely from membership in reports_readonly (see 0029_add-templar-readonly-role.sql).';

-- Default INHERIT means templar automatically has reports_readonly's grants without SET ROLE.
GRANT reports_readonly TO templar;
