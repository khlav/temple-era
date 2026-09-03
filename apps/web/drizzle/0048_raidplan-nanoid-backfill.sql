-- Migrate raid_plan from a UUID primary key to a nanoid.
-- Step 2 of 3: backfill legacy_uuid + generate a nanoid-alphabet value for every existing
-- row, then propagate it to every child table's shadow FK column.
--
-- temple_nanoid_gen replicates nanoid's generator (8 chars, alphabet `A-Za-z0-9` — no
-- `-`/`_`, so an id never reads as a word-break — 62 symbols) using pgcrypto's
-- gen_random_bytes. 62 isn't a power of two, so a plain modulo would bias the last two
-- symbols; instead each byte >= 248 (62*4) is rejected and redrawn, and `% 62` on the
-- rest gives every symbol equal odds — matches this app's RAID_PLAN_ID_ALPHABET
-- (raid-plan-id.ts) and customAlphabet call (raid-plan-schema.ts).

CREATE OR REPLACE FUNCTION temple_nanoid_gen(size int DEFAULT 8) RETURNS varchar AS $$
DECLARE
  alphabet varchar := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  result varchar := '';
  b int;
  i int;
BEGIN
  FOR i IN 1..size LOOP
    LOOP
      b := get_byte(gen_random_bytes(1), 0);
      EXIT WHEN b < 248;
    END LOOP;
    result := result || substr(alphabet, (b % 62) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

UPDATE "raid_plan"
SET "legacy_uuid" = "id",
    "new_id" = temple_nanoid_gen(8)
WHERE "new_id" IS NULL;
--> statement-breakpoint

UPDATE "raid_plan_character" c SET "new_raid_plan_id" = p."new_id"
FROM "raid_plan" p WHERE c."raid_plan_id" = p."id";
--> statement-breakpoint

UPDATE "raid_plan_encounter_group" g SET "new_raid_plan_id" = p."new_id"
FROM "raid_plan" p WHERE g."raid_plan_id" = p."id";
--> statement-breakpoint

UPDATE "raid_plan_encounter" e SET "new_raid_plan_id" = p."new_id"
FROM "raid_plan" p WHERE e."raid_plan_id" = p."id";
--> statement-breakpoint

UPDATE "raid_plan_encounter_aa_slot" a SET "new_raid_plan_id" = p."new_id"
FROM "raid_plan" p WHERE a."raid_plan_id" = p."id";
--> statement-breakpoint

UPDATE "raid_plan_presence" pr SET "new_raid_plan_id" = p."new_id"
FROM "raid_plan" p WHERE pr."raid_plan_id" = p."id";
--> statement-breakpoint

DROP FUNCTION temple_nanoid_gen(int);
