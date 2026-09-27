-- TEMPLE-137: move the read-only query timeout onto the role that actually gets it, at 120s.
--
-- 0001_custom_objects.sql (carried over from the old 0029) sets statement_timeout on
-- reports_readonly, and that setting has never once taken effect. Postgres applies an
-- `ALTER ROLE ... SET` GUC only when that role is the one the session *authenticated as*. It is
-- not inherited through role membership, and `SET ROLE` does not re-apply it either. Since 0030
-- split identity from privilege, reports_readonly is NOLOGIN — so nothing can ever authenticate
-- as it, and the setting is unreachable by construction rather than merely unused.
--
-- Templar connects as `templar`, which inherits reports_readonly's SELECT grants but none of its
-- role-level settings. Its ad hoc queries have therefore been running under the server default
-- (no statement timeout at all) for the whole life of that credential.
ALTER ROLE templar SET statement_timeout = '120s';
--> statement-breakpoint

-- Drop the inert setting instead of leaving two different numbers each appearing to govern the
-- same connections. It is unreachable (see above), so removing it changes no session's behaviour.
--
-- Note for later: a group role cannot carry statement_timeout for its members. Any future LOGIN
-- role granted reports_readonly needs its own `ALTER ROLE <role> SET statement_timeout` line, or
-- it silently gets no timeout — exactly the bug this migration fixes.
ALTER ROLE reports_readonly RESET statement_timeout;
