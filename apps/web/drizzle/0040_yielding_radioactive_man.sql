CREATE TYPE "public"."achievement_award_source" AS ENUM('rule', 'manual');--> statement-breakpoint
CREATE TYPE "public"."achievement_rule_shape" AS ENUM('attendance_threshold', 'consistency_match', 'flexibility_match', 'bench_credit_count', 'zone_attendance_threshold', 'raid_marathon_density', 'zone_breadth_window', 'class_breadth_window', 'family_double_up_cooccurrence');--> statement-breakpoint
CREATE TYPE "public"."achievement_scope" AS ENUM('season', 'all_time');--> statement-breakpoint
CREATE TYPE "public"."achievement_tier_level" AS ENUM('bronze', 'silver', 'gold', 'platinum');--> statement-breakpoint
ALTER TYPE "public"."scope" ADD VALUE 'achievement:manage';--> statement-breakpoint
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
ALTER TABLE "achievement_award" ADD CONSTRAINT "achievement_award_achievement_tier_id_achievement_tier_id_fk" FOREIGN KEY ("achievement_tier_id") REFERENCES "public"."achievement_tier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_award" ADD CONSTRAINT "achievement_award_awarded_by_user_id_auth_user_id_fk" FOREIGN KEY ("awarded_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_award" ADD CONSTRAINT "achievement_award_primary_character_id_fk" FOREIGN KEY ("primary_character_id") REFERENCES "public"."character"("character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_tier" ADD CONSTRAINT "achievement_tier_achievement_id_achievement_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_award__tier_primary_character_idx" ON "achievement_award" USING btree ("achievement_tier_id","primary_character_id");--> statement-breakpoint
CREATE INDEX "achievement_award__primary_character_id_idx" ON "achievement_award" USING btree ("primary_character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_tier__achievement_id_tier_idx" ON "achievement_tier" USING btree ("achievement_id","tier");