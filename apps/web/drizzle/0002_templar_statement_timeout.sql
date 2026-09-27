-- TEMPLE-137: forward patch for databases that already ran the pre-squash 0029/0030 chain.
--
-- 0001_custom_objects.sql now states the intended final shape directly — statement_timeout on
-- `templar`, nothing on reports_readonly — so a database built from zero comes out correct and both
-- statements below are no-ops for it.
--
-- Deployed databases cannot get it that way. Drizzle applies only migrations whose journal `when`
-- exceeds the newest `created_at` in drizzle.__drizzle_migrations, and never re-reads or re-hashes
-- an already-applied file. prod and stg sit far above 0001's `when`, so editing 0001 is invisible to
-- them: they still carry the original inert `reports_readonly = 30s` and an unset `templar`. This
-- file has a `when` above their watermark, which is what lets it reach them.
--
-- Why the original setting was inert: Postgres applies an `ALTER ROLE ... SET` GUC only to the role
-- a session authenticates as. It is not inherited through role membership, and `SET ROLE` does not
-- re-apply it. reports_readonly has been NOLOGIN since 0030 split identity from privilege, so
-- nothing could ever authenticate as it. Templar connects as `templar`, inheriting the SELECT grants
-- but none of the role-level settings — leaving its ad hoc queries with no statement timeout at all.
ALTER ROLE templar SET statement_timeout = '120s';
--> statement-breakpoint

-- Clears the real, inert value on prod and stg. No-op from zero, since 0001 no longer sets it.
ALTER ROLE reports_readonly RESET statement_timeout;
