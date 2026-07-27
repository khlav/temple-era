-- Seed the two system roles that preserve current isRaidManager/isAdmin behavior exactly,
-- and backfill user_role for every currently-flagged user. Additive/idempotent — safe to
-- re-run. The legacy is_raid_manager/is_admin columns are left untouched as a rollback
-- safety net (see plan: dropped in a later, separate cleanup pass).
--
-- Admin's scopes are deliberately disjoint from Raid Manager's (Admin = userpermissions:manage only) so
-- the two system roles don't overlap. Every currently-flagged admin is also backfilled into
-- Raid Manager below so isRaidManager/isAdmin (derived from the union of a user's granted
-- scopes) both keep resolving exactly as before.

INSERT INTO "role" ("id", "name", "scopes", "is_system")
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Raid Manager',
    ARRAY['raidlog:manage','raidplan:manage','character:manage','softres:access','templar:access','api-token:access']::scope[],
    true
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Admin',
    ARRAY['userpermissions:manage']::scope[],
    true
  )
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint

INSERT INTO "user_role" ("id", "user_id", "role_id", "source")
SELECT gen_random_uuid(), "id", '00000000-0000-0000-0000-000000000001', 'manual'
FROM "auth_user"
WHERE "is_raid_manager" = true OR "is_admin" = true
ON CONFLICT ("user_id", "role_id") WHERE "source" = 'manual' DO NOTHING;
--> statement-breakpoint

INSERT INTO "user_role" ("id", "user_id", "role_id", "source")
SELECT gen_random_uuid(), "id", '00000000-0000-0000-0000-000000000002', 'manual'
FROM "auth_user"
WHERE "is_admin" = true
ON CONFLICT ("user_id", "role_id") WHERE "source" = 'manual' DO NOTHING;
