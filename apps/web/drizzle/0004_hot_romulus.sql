DO $$ BEGIN
 CREATE TYPE "public"."profession" AS ENUM('Alchemy', 'Blacksmithing', 'Enchanting', 'Engineering', 'Tailoring', 'Leatherworking');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "character_spells" (
	"character_id" integer NOT NULL,
	"recipe_spell_id" integer NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "character_spells_character_id_recipe_spell_id_pk" PRIMARY KEY("character_id","recipe_spell_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipes" (
	"recipe_spell_id" integer PRIMARY KEY NOT NULL,
	"item_id" integer,
	"profession" "profession" NOT NULL,
	"recipe" text NOT NULL,
	"is_common" boolean DEFAULT false NOT NULL,
	"notes" text,
	"tags" text[],
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "character_spells" ADD CONSTRAINT "character_spells_character_id_character_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("character_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "character_spells" ADD CONSTRAINT "character_spells_recipe_spell_id_recipes_recipe_spell_id_fk" FOREIGN KEY ("recipe_spell_id") REFERENCES "public"."recipes"("recipe_spell_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "character_spells" ADD CONSTRAINT "character_spells_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "character_spells" ADD CONSTRAINT "character_spells_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
