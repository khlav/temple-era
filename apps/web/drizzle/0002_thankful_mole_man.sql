ALTER TABLE "character" drop column "is_primary";--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "is_primary" boolean GENERATED ALWAYS AS (("character"."character_id" = COALESCE ("character"."primary_character_id", 0))
                 OR
                 "character"."primary_character_id"
                 IS
                 NULL) STORED;--> statement-breakpoint
ALTER TABLE "raid_log" drop column "killCount";--> statement-breakpoint
ALTER TABLE "raid_log" ADD COLUMN "killCount" integer GENERATED ALWAYS AS (cardinality
          ("raid_log"."kills")) STORED;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "is_raid_lead" boolean DEFAULT false;