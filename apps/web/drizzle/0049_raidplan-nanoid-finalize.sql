-- Migrate raid_plan from a UUID primary key to a nanoid.
-- Step 3 of 3: drop the old uuid columns (CASCADE removes their now-stale PK/FK/index
-- objects along with them — no need to know exact constraint names), rename the
-- nanoid-populated shadow columns into place, and recreate the PK/FK/index objects that
-- CASCADE dropped, matching the names drizzle-kit would generate for the final schema.

ALTER TABLE "raid_plan" DROP COLUMN "id" CASCADE;
--> statement-breakpoint
ALTER TABLE "raid_plan_character" DROP COLUMN "raid_plan_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_group" DROP COLUMN "raid_plan_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter" DROP COLUMN "raid_plan_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_aa_slot" DROP COLUMN "raid_plan_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "raid_plan_presence" DROP COLUMN "raid_plan_id" CASCADE;
--> statement-breakpoint

ALTER TABLE "raid_plan" RENAME COLUMN "new_id" TO "id";
--> statement-breakpoint
ALTER TABLE "raid_plan_character" RENAME COLUMN "new_raid_plan_id" TO "raid_plan_id";
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_group" RENAME COLUMN "new_raid_plan_id" TO "raid_plan_id";
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter" RENAME COLUMN "new_raid_plan_id" TO "raid_plan_id";
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_aa_slot" RENAME COLUMN "new_raid_plan_id" TO "raid_plan_id";
--> statement-breakpoint
ALTER TABLE "raid_plan_presence" RENAME COLUMN "new_raid_plan_id" TO "raid_plan_id";
--> statement-breakpoint

ALTER TABLE "raid_plan" ALTER COLUMN "id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "raid_plan" ADD CONSTRAINT "raid_plan_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "raid_plan__legacy_uuid_idx" ON "raid_plan" ("legacy_uuid");
--> statement-breakpoint

ALTER TABLE "raid_plan_character" ALTER COLUMN "raid_plan_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "raid_plan_character" ADD CONSTRAINT "raid_plan_character_raid_plan_id_raid_plan_id_fk"
  FOREIGN KEY ("raid_plan_id") REFERENCES "raid_plan"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "raid_plan_character__raid_plan_id_idx" ON "raid_plan_character" ("raid_plan_id");
--> statement-breakpoint

ALTER TABLE "raid_plan_encounter_group" ALTER COLUMN "raid_plan_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_group" ADD CONSTRAINT "raid_plan_encounter_group_raid_plan_id_raid_plan_id_fk"
  FOREIGN KEY ("raid_plan_id") REFERENCES "raid_plan"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "raid_plan_encounter_group__raid_plan_id_idx" ON "raid_plan_encounter_group" ("raid_plan_id");
--> statement-breakpoint

ALTER TABLE "raid_plan_encounter" ALTER COLUMN "raid_plan_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter" ADD CONSTRAINT "raid_plan_encounter_raid_plan_id_raid_plan_id_fk"
  FOREIGN KEY ("raid_plan_id") REFERENCES "raid_plan"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "raid_plan_encounter__raid_plan_id_idx" ON "raid_plan_encounter" ("raid_plan_id");
--> statement-breakpoint

ALTER TABLE "raid_plan_encounter_aa_slot" ADD CONSTRAINT "raid_plan_encounter_aa_slot_raid_plan_id_raid_plan_id_fk"
  FOREIGN KEY ("raid_plan_id") REFERENCES "raid_plan"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "aa_slot__raid_plan_id_idx" ON "raid_plan_encounter_aa_slot" ("raid_plan_id");
--> statement-breakpoint

ALTER TABLE "raid_plan_presence" ALTER COLUMN "raid_plan_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "raid_plan_presence" ADD CONSTRAINT "raid_plan_presence_raid_plan_id_raid_plan_id_fk"
  FOREIGN KEY ("raid_plan_id") REFERENCES "raid_plan"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "raid_plan_presence__raid_plan_id_idx" ON "raid_plan_presence" ("raid_plan_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "raid_plan_presence__plan_session_idx" ON "raid_plan_presence" ("raid_plan_id", "client_session_id");
--> statement-breakpoint

-- The touch_raid_plan_* trigger functions (0018_touch-raid-plan-updated-at.sql) were
-- written against the uuid raid_plan_id/id columns this migration just replaced with
-- varchar. touch_raid_plan_timestamp's parameter type is part of its signature, so
-- CREATE OR REPLACE with a new type would just add a second overload rather than fix the
-- one every trigger actually calls — drop it explicitly first. The two SELECT-INTO locals
-- in touch_raid_plan_from_encounter/touch_raid_plan_from_aa_slot need the same fix since
-- they're typed from the (now-varchar) raid_plan_id column too. Left unfixed, every
-- insert/update/delete on a raid plan's characters, encounters, groups, assignments, or
-- AA slots would throw "function touch_raid_plan_timestamp(character varying) does not
-- exist" the moment this migration completes.

DROP FUNCTION touch_raid_plan_timestamp(uuid);
--> statement-breakpoint

CREATE FUNCTION touch_raid_plan_timestamp(target_plan_id varchar) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF target_plan_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE raid_plan
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = target_plan_id;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION touch_raid_plan_from_encounter()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_plan_id varchar;
  new_plan_id varchar;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT raid_plan_id
    INTO new_plan_id
    FROM raid_plan_encounter
    WHERE id = NEW.encounter_id;

    PERFORM touch_raid_plan_timestamp(new_plan_id);
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    SELECT raid_plan_id
    INTO old_plan_id
    FROM raid_plan_encounter
    WHERE id = OLD.encounter_id;

    PERFORM touch_raid_plan_timestamp(old_plan_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION touch_raid_plan_from_aa_slot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_plan_id varchar;
  new_plan_id varchar;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_plan_id := NEW.raid_plan_id;

    IF new_plan_id IS NULL AND NEW.encounter_id IS NOT NULL THEN
      SELECT raid_plan_id
      INTO new_plan_id
      FROM raid_plan_encounter
      WHERE id = NEW.encounter_id;
    END IF;

    PERFORM touch_raid_plan_timestamp(new_plan_id);
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    old_plan_id := OLD.raid_plan_id;

    IF old_plan_id IS NULL AND OLD.encounter_id IS NOT NULL THEN
      SELECT raid_plan_id
      INTO old_plan_id
      FROM raid_plan_encounter
      WHERE id = OLD.encounter_id;
    END IF;

    PERFORM touch_raid_plan_timestamp(old_plan_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;
