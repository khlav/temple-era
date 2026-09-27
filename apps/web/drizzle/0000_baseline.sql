CREATE TYPE "public"."achievement_award_source" AS ENUM('rule', 'manual');--> statement-breakpoint
CREATE TYPE "public"."achievement_rule_shape" AS ENUM('attendance_threshold', 'consistency_match', 'flexibility_match', 'bench_credit_count', 'zone_attendance_threshold', 'raid_marathon_density', 'zone_breadth_window', 'class_breadth_window', 'family_double_up_cooccurrence', 'weighted_attendance_threshold', 'class_attendance_threshold', 'recipe_set_threshold');--> statement-breakpoint
CREATE TYPE "public"."achievement_scope" AS ENUM('season', 'all_time');--> statement-breakpoint
CREATE TYPE "public"."achievement_tier_level" AS ENUM('copper', 'silver', 'gold', 'thorium', 'arcanite');--> statement-breakpoint
CREATE TYPE "public"."created_via" AS ENUM('ui', 'wcl_raid_log_import');--> statement-breakpoint
CREATE TYPE "public"."profession" AS ENUM('Alchemy', 'Blacksmithing', 'Enchanting', 'Engineering', 'Tailoring', 'Leatherworking', 'Cooking');--> statement-breakpoint
CREATE TYPE "public"."raid_signup_link_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."scope" AS ENUM('raidlog:manage', 'raidplan:manage', 'character:manage', 'userpermissions:manage', 'templar:access', 'softres:access', 'api-token:access', 'worldbuff:manage', 'achievement:manage');--> statement-breakpoint
CREATE TYPE "public"."snapshot_checkpoint" AS ENUM('144h', '120h', '96h', '72h', '48h', '24h', '0h');--> statement-breakpoint
CREATE TYPE "public"."updated_via" AS ENUM('ui', 'wcl_raid_log_import');--> statement-breakpoint
CREATE TYPE "public"."user_role_source" AS ENUM('manual', 'discord-sync');--> statement-breakpoint
CREATE TYPE "public"."world_buff_item" AS ENUM('rends_head', 'onyxias_head', 'nefarians_head', 'hakkars_heart');--> statement-breakpoint
CREATE TYPE "public"."world_buff_queue_type" AS ENUM('main', 'alt', 'backup');--> statement-breakpoint
CREATE TYPE "public"."world_buff_state" AS ENUM('ready_to_drop', 'dropped');--> statement-breakpoint
CREATE TABLE "auth_account" (
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
CREATE TABLE "achievement_award" (
	"id" uuid PRIMARY KEY NOT NULL,
	"achievement_tier_id" uuid NOT NULL,
	"primary_character_id" integer NOT NULL,
	"source" "achievement_award_source" NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"awarded_by_user_id" uuid,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "achievement_tier" (
	"id" uuid PRIMARY KEY NOT NULL,
	"achievement_id" uuid NOT NULL,
	"tier" "achievement_tier_level" NOT NULL,
	"rule_config" jsonb,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "achievement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" varchar(512),
	"goal_description" varchar(512),
	"icon" varchar(128) NOT NULL,
	"scope" "achievement_scope" NOT NULL,
	"season_id" uuid,
	"rule_shape" "achievement_rule_shape",
	"hidden" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "character_spells" (
	"character_id" integer NOT NULL,
	"recipe_spell_id" integer NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "character_spells_character_id_recipe_spell_id_pk" PRIMARY KEY("character_id","recipe_spell_id")
);
--> statement-breakpoint
CREATE TABLE "character" (
	"character_id" integer PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"server" varchar(128) DEFAULT 'Unknown' NOT NULL,
	"slug" varchar(256) NOT NULL,
	"class" varchar(128) NOT NULL,
	"class_detail" varchar(256) NOT NULL,
	"primary_character_id" integer,
	"is_primary" boolean GENERATED ALWAYS AS (("character"."character_id" = COALESCE ("character"."primary_character_id", 0))
                 OR
                 "character"."primary_character_id"
                 IS
                 NULL) STORED,
	"is_ignored" boolean DEFAULT false NOT NULL,
	"created_via" "created_via",
	"updated_via" "updated_via",
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "discord_pending_role_grant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"discord_user_id" varchar(32) NOT NULL,
	"role_id" uuid NOT NULL,
	"source" "user_role_source" DEFAULT 'manual' NOT NULL,
	"source_binding_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "discord_role_binding" (
	"id" uuid PRIMARY KEY NOT NULL,
	"discord_role_id" varchar(32) NOT NULL,
	"discord_role_name" varchar(100) NOT NULL,
	"app_role_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "discord_sync_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_summary" text
);
--> statement-breakpoint
CREATE TABLE "raid_bench_map" (
	"raid_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "raid_bench_map_raid_id_character_id_pk" PRIMARY KEY("raid_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "raid_helper_signup_snapshot_schedule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_helper_event_id" varchar(64) NOT NULL,
	"checkpoint" "snapshot_checkpoint" NOT NULL,
	"qstash_message_id" varchar(128) NOT NULL,
	"scheduled_for_start_time" timestamp with time zone NOT NULL,
	"target_time" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_helper_signup_snapshot" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_helper_event_id" varchar(64) NOT NULL,
	"resolved_event_id" varchar(64) NOT NULL,
	"checkpoint" "snapshot_checkpoint" NOT NULL,
	"target_time" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"sign_up_count" integer NOT NULL,
	"signups" jsonb NOT NULL,
	"title" varchar(256),
	"channel_name" varchar(128),
	"channel_id" varchar(64),
	"softres_id" varchar(64),
	"scheduled_id" varchar(64),
	"zone" varchar(64),
	"zone_source" varchar(16)
);
--> statement-breakpoint
CREATE TABLE "raid_log_attendee_map" (
	"raid_log_id" varchar(64) NOT NULL,
	"character_id" integer NOT NULL,
	"is_ignored" boolean DEFAULT false,
	CONSTRAINT "raid_log_attendee_map_raid_log_id_character_id_pk" PRIMARY KEY("raid_log_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "raid_log" (
	"raid_log_id" varchar(64) PRIMARY KEY NOT NULL,
	"raid_id" integer,
	"name" varchar(256) NOT NULL,
	"zone" varchar,
	"kills" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"killCount" integer GENERATED ALWAYS AS (cardinality
          ("raid_log"."kills")) STORED,
	"start_time_utc" timestamp,
	"end_time_utc" timestamp,
	"discord_message_id" varchar(64),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_character" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_plan_id" varchar(8) NOT NULL,
	"character_id" integer,
	"character_name" varchar(128) NOT NULL,
	"write_in_class" varchar(32),
	"default_group" integer,
	"default_position" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_encounter_aa_slot" (
	"id" uuid PRIMARY KEY NOT NULL,
	"encounter_id" uuid,
	"raid_plan_id" varchar(8),
	"plan_character_id" uuid NOT NULL,
	"slot_name" varchar(128) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_encounter_assignment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"encounter_id" uuid NOT NULL,
	"plan_character_id" uuid NOT NULL,
	"group_number" integer,
	"position" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_encounter_group" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_plan_id" varchar(8) NOT NULL,
	"group_name" varchar(256) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_encounter_note" (
	"id" uuid PRIMARY KEY NOT NULL,
	"encounter_id" uuid NOT NULL,
	"icon_ref" varchar(128) NOT NULL,
	"text" varchar(128),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_encounter" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_plan_id" varchar(8) NOT NULL,
	"group_id" uuid,
	"encounter_key" varchar(64) NOT NULL,
	"encounter_name" varchar(256) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"use_default_groups" boolean DEFAULT true NOT NULL,
	"aa_template" text,
	"use_custom_aa" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_presence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_plan_id" varchar(8) NOT NULL,
	"user_id" uuid NOT NULL,
	"client_session_id" varchar(128) NOT NULL,
	"mode" varchar(16) DEFAULT 'viewing' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raid_plan_template_encounter_group" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"group_name" varchar(256) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_template_encounter" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"group_id" uuid,
	"encounter_key" varchar(64) NOT NULL,
	"encounter_name" varchar(256) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"aa_template" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"zone_id" varchar(64) NOT NULL,
	"zone_name" varchar(256) NOT NULL,
	"default_group_count" integer DEFAULT 8 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"default_aa_template" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan" (
	"id" varchar(8) PRIMARY KEY NOT NULL,
	"legacy_uuid" uuid,
	"raid_helper_event_id" varchar(64) NOT NULL,
	"event_id" integer,
	"zone_id" varchar(64) NOT NULL,
	"name" varchar(256) NOT NULL,
	"default_aa_template" text,
	"use_default_aa" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"start_at" timestamp,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_signup_snapshot_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_id" integer NOT NULL,
	"raid_helper_event_id" varchar(64) NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"source" "raid_signup_link_source" DEFAULT 'auto' NOT NULL,
	"confidence" real NOT NULL,
	"match_reason" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid" (
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
CREATE TABLE "recipes" (
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
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"scopes" "scope"[] DEFAULT ARRAY[]::scope[] NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"session_token" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"source" "user_role_source" DEFAULT 'manual' NOT NULL,
	"source_binding_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"email" varchar(255),
	"email_verified" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"image" varchar(255),
	"is_raid_manager" boolean DEFAULT false,
	"is_admin" boolean DEFAULT false,
	"character_id" integer,
	"api_token" text,
	"api_token_encrypted" text,
	"templar_enabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_verification_token" (
	"identifier" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "world_buff_assignment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "world_buff_character_status" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_name" varchar(128) NOT NULL,
	"character_name_normalized" varchar(128) NOT NULL,
	"character_id" integer,
	"item" "world_buff_item" NOT NULL,
	"state" "world_buff_state" DEFAULT 'ready_to_drop' NOT NULL,
	"queue_type" "world_buff_queue_type" DEFAULT 'main' NOT NULL,
	"notes" text,
	"dropped_at" timestamp with time zone,
	"marked_inactive_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_award" ADD CONSTRAINT "achievement_award_achievement_tier_id_achievement_tier_id_fk" FOREIGN KEY ("achievement_tier_id") REFERENCES "public"."achievement_tier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_award" ADD CONSTRAINT "achievement_award_awarded_by_user_id_auth_user_id_fk" FOREIGN KEY ("awarded_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_award" ADD CONSTRAINT "achievement_award_primary_character_id_fk" FOREIGN KEY ("primary_character_id") REFERENCES "public"."character"("character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_tier" ADD CONSTRAINT "achievement_tier_achievement_id_achievement_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_spells" ADD CONSTRAINT "character_spells_character_id_character_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("character_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_spells" ADD CONSTRAINT "character_spells_recipe_spell_id_recipes_recipe_spell_id_fk" FOREIGN KEY ("recipe_spell_id") REFERENCES "public"."recipes"("recipe_spell_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_spells" ADD CONSTRAINT "character_spells_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_spells" ADD CONSTRAINT "character_spells_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character__primary_character_id_fk" FOREIGN KEY ("primary_character_id") REFERENCES "public"."character"("character_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_pending_role_grant" ADD CONSTRAINT "discord_pending_role_grant_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_pending_role_grant" ADD CONSTRAINT "discord_pending_role_grant_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_pending_role_grant" ADD CONSTRAINT "discord_pending_grant_source_binding_fk" FOREIGN KEY ("source_binding_id") REFERENCES "public"."discord_role_binding"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_role_binding" ADD CONSTRAINT "discord_role_binding_app_role_id_role_id_fk" FOREIGN KEY ("app_role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_role_binding" ADD CONSTRAINT "discord_role_binding_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_bench_map" ADD CONSTRAINT "raid_bench_map_raid_id_raid_raid_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raid"("raid_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_bench_map" ADD CONSTRAINT "raid_bench_map_character_id_character_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("character_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_bench_map" ADD CONSTRAINT "raid_bench_map_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_log_attendee_map" ADD CONSTRAINT "raid_log_attendee_map_raid_log_id_raid_log_raid_log_id_fk" FOREIGN KEY ("raid_log_id") REFERENCES "public"."raid_log"("raid_log_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_log_attendee_map" ADD CONSTRAINT "raid_log_attendee_map_character_id_character_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_log" ADD CONSTRAINT "raid_log_raid_id_raid_raid_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raid"("raid_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_log" ADD CONSTRAINT "raid_log_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_character" ADD CONSTRAINT "raid_plan_character_raid_plan_id_raid_plan_id_fk" FOREIGN KEY ("raid_plan_id") REFERENCES "public"."raid_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_character" ADD CONSTRAINT "raid_plan_character_character_id_character_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("character_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_aa_slot" ADD CONSTRAINT "raid_plan_encounter_aa_slot_encounter_id_raid_plan_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."raid_plan_encounter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_aa_slot" ADD CONSTRAINT "raid_plan_encounter_aa_slot_raid_plan_id_raid_plan_id_fk" FOREIGN KEY ("raid_plan_id") REFERENCES "public"."raid_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_aa_slot" ADD CONSTRAINT "raid_plan_encounter_aa_slot_plan_character_id_raid_plan_character_id_fk" FOREIGN KEY ("plan_character_id") REFERENCES "public"."raid_plan_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_assignment" ADD CONSTRAINT "raid_plan_encounter_assignment_encounter_id_raid_plan_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."raid_plan_encounter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_assignment" ADD CONSTRAINT "raid_plan_encounter_assignment_plan_character_id_raid_plan_character_id_fk" FOREIGN KEY ("plan_character_id") REFERENCES "public"."raid_plan_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_group" ADD CONSTRAINT "raid_plan_encounter_group_raid_plan_id_raid_plan_id_fk" FOREIGN KEY ("raid_plan_id") REFERENCES "public"."raid_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_note" ADD CONSTRAINT "raid_plan_encounter_note_encounter_id_raid_plan_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."raid_plan_encounter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter" ADD CONSTRAINT "raid_plan_encounter_raid_plan_id_raid_plan_id_fk" FOREIGN KEY ("raid_plan_id") REFERENCES "public"."raid_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter" ADD CONSTRAINT "raid_plan_encounter_group_id_raid_plan_encounter_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."raid_plan_encounter_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_presence" ADD CONSTRAINT "raid_plan_presence_raid_plan_id_raid_plan_id_fk" FOREIGN KEY ("raid_plan_id") REFERENCES "public"."raid_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_presence" ADD CONSTRAINT "raid_plan_presence_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_template_encounter_group" ADD CONSTRAINT "raid_plan_template_encounter_group_template_id_raid_plan_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."raid_plan_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_template_encounter" ADD CONSTRAINT "raid_plan_template_encounter_template_id_raid_plan_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."raid_plan_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_template_encounter" ADD CONSTRAINT "raid_plan_template_encounter_group_id_raid_plan_template_encounter_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."raid_plan_template_encounter_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_template" ADD CONSTRAINT "raid_plan_template_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan" ADD CONSTRAINT "raid_plan_event_id_raid_raid_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."raid"("raid_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan" ADD CONSTRAINT "raid_plan_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan" ADD CONSTRAINT "raid_plan_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_signup_snapshot_link" ADD CONSTRAINT "raid_signup_snapshot_link_raid_id_raid_raid_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raid"("raid_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_signup_snapshot_link" ADD CONSTRAINT "raid_signup_snapshot_link_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid" ADD CONSTRAINT "raid_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid" ADD CONSTRAINT "raid_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_source_binding_id_discord_role_binding_id_fk" FOREIGN KEY ("source_binding_id") REFERENCES "public"."discord_role_binding"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buff_assignment" ADD CONSTRAINT "world_buff_assignment_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buff_assignment" ADD CONSTRAINT "world_buff_assignment_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buff_assignment" ADD CONSTRAINT "world_buff_assignment_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."world_buff_character_status"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buff_character_status" ADD CONSTRAINT "world_buff_character_status_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buff_character_status" ADD CONSTRAINT "world_buff_character_status_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buff_character_status" ADD CONSTRAINT "world_buff_character_status_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("character_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_award__tier_primary_character_idx" ON "achievement_award" USING btree ("achievement_tier_id","primary_character_id");--> statement-breakpoint
CREATE INDEX "achievement_award__primary_character_id_idx" ON "achievement_award" USING btree ("primary_character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_tier__achievement_id_tier_idx" ON "achievement_tier" USING btree ("achievement_id","tier");--> statement-breakpoint
CREATE INDEX "character_spells__recipe_spell_id_idx" ON "character_spells" USING btree ("recipe_spell_id");--> statement-breakpoint
CREATE INDEX "character__is_ignored_idx" ON "character" USING btree ("is_ignored");--> statement-breakpoint
CREATE INDEX "character__primary_character_id_idx" ON "character" USING btree ("primary_character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_pending_role_grant__manual_uq" ON "discord_pending_role_grant" USING btree ("discord_user_id","role_id") WHERE "discord_pending_role_grant"."source" = 'manual';--> statement-breakpoint
CREATE UNIQUE INDEX "discord_pending_role_grant__sync_uq" ON "discord_pending_role_grant" USING btree ("discord_user_id","role_id","source_binding_id") WHERE "discord_pending_role_grant"."source" = 'discord-sync';--> statement-breakpoint
CREATE UNIQUE INDEX "discord_role_binding__discord_role_app_role_idx" ON "discord_role_binding" USING btree ("discord_role_id","app_role_id");--> statement-breakpoint
CREATE INDEX "raid_bench_map__raid_id_idx" ON "raid_bench_map" USING btree ("raid_id");--> statement-breakpoint
CREATE INDEX "raid_bench_map__character_id_idx" ON "raid_bench_map" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_helper_signup_snapshot_schedule__event_checkpoint_idx" ON "raid_helper_signup_snapshot_schedule" USING btree ("raid_helper_event_id","checkpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_helper_signup_snapshot__event_checkpoint_start_idx" ON "raid_helper_signup_snapshot" USING btree ("raid_helper_event_id","checkpoint","start_time");--> statement-breakpoint
CREATE INDEX "raid_helper_signup_snapshot__raid_helper_event_id_idx" ON "raid_helper_signup_snapshot" USING btree ("raid_helper_event_id");--> statement-breakpoint
CREATE INDEX "raid_helper_signup_snapshot__start_time_idx" ON "raid_helper_signup_snapshot" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "raid_log_attendee_map__character_id_idx" ON "raid_log_attendee_map" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "raid_log__discord_message_id_idx" ON "raid_log" USING btree ("discord_message_id");--> statement-breakpoint
CREATE INDEX "raid_log__raid_id_idx" ON "raid_log" USING btree ("raid_id");--> statement-breakpoint
CREATE INDEX "raid_plan_character__raid_plan_id_idx" ON "raid_plan_character" USING btree ("raid_plan_id");--> statement-breakpoint
CREATE INDEX "raid_plan_character__character_id_idx" ON "raid_plan_character" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "aa_slot__encounter_id_idx" ON "raid_plan_encounter_aa_slot" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "aa_slot__raid_plan_id_idx" ON "raid_plan_encounter_aa_slot" USING btree ("raid_plan_id");--> statement-breakpoint
CREATE INDEX "aa_slot__plan_character_id_idx" ON "raid_plan_encounter_aa_slot" USING btree ("plan_character_id");--> statement-breakpoint
CREATE INDEX "raid_plan_encounter_assignment__encounter_id_idx" ON "raid_plan_encounter_assignment" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "raid_plan_encounter_assignment__plan_character_id_idx" ON "raid_plan_encounter_assignment" USING btree ("plan_character_id");--> statement-breakpoint
CREATE INDEX "raid_plan_encounter_group__raid_plan_id_idx" ON "raid_plan_encounter_group" USING btree ("raid_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_plan_encounter_note__encounter_id_sort_order_idx" ON "raid_plan_encounter_note" USING btree ("encounter_id","sort_order");--> statement-breakpoint
CREATE INDEX "raid_plan_encounter__raid_plan_id_idx" ON "raid_plan_encounter" USING btree ("raid_plan_id");--> statement-breakpoint
CREATE INDEX "raid_plan_encounter__group_id_idx" ON "raid_plan_encounter" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "raid_plan_presence__raid_plan_id_idx" ON "raid_plan_presence" USING btree ("raid_plan_id");--> statement-breakpoint
CREATE INDEX "raid_plan_presence__user_id_idx" ON "raid_plan_presence" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "raid_plan_presence__last_seen_at_idx" ON "raid_plan_presence" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_plan_presence__plan_session_idx" ON "raid_plan_presence" USING btree ("raid_plan_id","client_session_id");--> statement-breakpoint
CREATE INDEX "raid_plan_template_encounter_group__template_id_idx" ON "raid_plan_template_encounter_group" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "raid_plan_template_encounter__template_id_idx" ON "raid_plan_template_encounter" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "raid_plan_template_encounter__group_id_idx" ON "raid_plan_template_encounter" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_plan_template__zone_id_idx" ON "raid_plan_template" USING btree ("zone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_plan__legacy_uuid_idx" ON "raid_plan" USING btree ("legacy_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_plan__raid_helper_event_id_idx" ON "raid_plan" USING btree ("raid_helper_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_plan__event_id_idx" ON "raid_plan" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "raid_plan__is_public_idx" ON "raid_plan" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "raid_plan__start_at_idx" ON "raid_plan" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "raid_plan__updated_by_idx" ON "raid_plan" USING btree ("updated_by");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_signup_snapshot_link__raid_id_idx" ON "raid_signup_snapshot_link" USING btree ("raid_id");--> statement-breakpoint
CREATE INDEX "raid_signup_snapshot_link__event_start_idx" ON "raid_signup_snapshot_link" USING btree ("raid_helper_event_id","start_time");--> statement-breakpoint
CREATE INDEX "raid__date_idx" ON "raid" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "role__name_idx" ON "role" USING btree ("name");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_role__user_id_idx" ON "user_role" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_role__manual_uq" ON "user_role" USING btree ("user_id","role_id") WHERE "user_role"."source" = 'manual';--> statement-breakpoint
CREATE UNIQUE INDEX "user_role__sync_uq" ON "user_role" USING btree ("user_id","role_id","source_binding_id") WHERE "user_role"."source" = 'discord-sync';--> statement-breakpoint
CREATE UNIQUE INDEX "user__api_token_idx" ON "auth_user" USING btree ("api_token");--> statement-breakpoint
CREATE INDEX "world_buff_assignment__status_id_idx" ON "world_buff_assignment" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "world_buff_assignment__scheduled_at_idx" ON "world_buff_assignment" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "world_buff_character_status__name_item_uq" ON "world_buff_character_status" USING btree ("character_name_normalized","item");--> statement-breakpoint
CREATE INDEX "world_buff_character_status__character_id_idx" ON "world_buff_character_status" USING btree ("character_id");