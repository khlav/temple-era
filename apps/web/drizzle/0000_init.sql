DO $$ BEGIN
 CREATE TYPE "public"."created_via" AS ENUM('ui', 'wcl_raid_log_import');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."updated_via" AS ENUM('ui', 'wcl_raid_log_import');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_account" (
	"user_id" uuid NOT NULL,
	"type" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" varchar(255),
	"scope" varchar(255),
	"id_token" text,
	"session_state" varchar(255),
	CONSTRAINT "auth_account_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "character" (
	"character_id" integer PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"server" varchar(128) DEFAULT 'Unknown' NOT NULL,
	"slug" varchar(256) NOT NULL,
	"class" varchar(128) NOT NULL,
	"class_detail" varchar(256) NOT NULL,
	"primary_character_id" integer,
	"is_primary" boolean GENERATED ALWAYS AS (("character"."character_id" = COALESCE("character"."primary_character_id", 0)) OR "character"."primary_character_id" IS NULL) STORED,
	"is_ignored" boolean DEFAULT false NOT NULL,
	"created_via" "created_via",
	"updated_via" "updated_via",
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raid_bench_map" (
	"raid_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "raid_bench_map_raid_id_character_id_pk" PRIMARY KEY("raid_id","character_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raid_log_attendee_map" (
	"raid_log_id" varchar(64) NOT NULL,
	"character_id" integer NOT NULL,
	"is_ignored" boolean DEFAULT false,
	CONSTRAINT "raid_log_attendee_map_raid_log_id_character_id_pk" PRIMARY KEY("raid_log_id","character_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raid_log" (
	"raid_log_id" varchar(64) PRIMARY KEY NOT NULL,
	"raid_id" integer,
	"name" varchar(256) NOT NULL,
	"zone" varchar,
	"kills" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"killCount" integer GENERATED ALWAYS AS (cardinality("raid_log"."kills")) STORED,
	"start_time_utc" timestamp,
	"end_time_utc" timestamp,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raid" (
	"raid_id" serial PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"date" date NOT NULL,
	"attendance_weight" real DEFAULT 1 NOT NULL,
	"zone" varchar NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_session" (
	"session_token" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"email" varchar(255),
	"email_verified" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"image" varchar(255),
	"is_admin" boolean DEFAULT false,
	"character_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_verification_token" (
	"identifier" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "character" ADD CONSTRAINT "character_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "character" ADD CONSTRAINT "character__primary_character_id_fk" FOREIGN KEY ("primary_character_id") REFERENCES "public"."character"("character_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid_bench_map" ADD CONSTRAINT "raid_bench_map_raid_id_raid_raid_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raid"("raid_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid_bench_map" ADD CONSTRAINT "raid_bench_map_character_id_character_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("character_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid_bench_map" ADD CONSTRAINT "raid_bench_map_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid_log_attendee_map" ADD CONSTRAINT "raid_log_attendee_map_raid_log_id_raid_log_raid_log_id_fk" FOREIGN KEY ("raid_log_id") REFERENCES "public"."raid_log"("raid_log_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid_log_attendee_map" ADD CONSTRAINT "raid_log_attendee_map_character_id_character_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("character_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid_log" ADD CONSTRAINT "raid_log_raid_id_raid_raid_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raid"("raid_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid_log" ADD CONSTRAINT "raid_log_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid" ADD CONSTRAINT "raid_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid" ADD CONSTRAINT "raid_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raid_bench_map__raid_id_idx" ON "raid_bench_map" USING btree ("raid_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raid_bench_map__character_id_idx" ON "raid_bench_map" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raid_log_attendee_map__raid_log_id_idx" ON "raid_log_attendee_map" USING btree ("raid_log_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raid_log_attendee_map__character_id_idx" ON "raid_log_attendee_map" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "raid_log__raid_log_id_idx" ON "raid_log" USING btree ("raid_log_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "raid__raid_id_idx" ON "raid" USING btree ("raid_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user__id_idx" ON "auth_user" USING btree ("id");