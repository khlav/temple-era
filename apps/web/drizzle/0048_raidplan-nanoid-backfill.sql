-- Migrate raid_plan from a UUID primary key to a nanoid.
-- Step 2 of 3: backfill legacy_uuid + generate a nanoid-alphabet value for every existing
-- row, then propagate it to every child table's shadow FK column.
--
-- temple_nanoid_gen replicates nanoid's generator (8 chars, alphabet `A-Za-z0-9_-`,
-- 64 symbols) using pgcrypto's gen_random_bytes: masking each random byte
-- to its low 6 bits (`& 63`) indexes uniformly into the 64-char alphabet with zero bias,
-- since 64 is a power of two — the same trick nanoid's own generator uses.

CREATE OR REPLACE FUNCTION temple_nanoid_gen(size int DEFAULT 8) RETURNS varchar AS $$
DECLARE
  alphabet varchar := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  bytes bytea := gen_random_bytes(size);
  result varchar := '';
  i int;
BEGIN
  FOR i IN 0..size - 1 LOOP
    result := result || substr(alphabet, (get_byte(bytes, i) & 63) + 1, 1);
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
