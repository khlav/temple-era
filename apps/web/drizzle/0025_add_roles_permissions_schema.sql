CREATE TYPE "public"."scope" AS ENUM('raidlog:manage', 'raidplan:manage', 'character:manage', 'userpermissions:manage', 'templar:access', 'softres:access', 'api-token:access');--> statement-breakpoint
CREATE TYPE "public"."user_role_source" AS ENUM('manual', 'discord-sync');--> statement-breakpoint
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
ALTER TABLE "discord_pending_role_grant" ADD CONSTRAINT "discord_pending_role_grant_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_pending_role_grant" ADD CONSTRAINT "discord_pending_role_grant_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_pending_role_grant" ADD CONSTRAINT "discord_pending_grant_source_binding_fk" FOREIGN KEY ("source_binding_id") REFERENCES "public"."discord_role_binding"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_role_binding" ADD CONSTRAINT "discord_role_binding_app_role_id_role_id_fk" FOREIGN KEY ("app_role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_role_binding" ADD CONSTRAINT "discord_role_binding_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_source_binding_id_discord_role_binding_id_fk" FOREIGN KEY ("source_binding_id") REFERENCES "public"."discord_role_binding"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discord_pending_role_grant__manual_uq" ON "discord_pending_role_grant" USING btree ("discord_user_id","role_id") WHERE "discord_pending_role_grant"."source" = 'manual';--> statement-breakpoint
CREATE UNIQUE INDEX "discord_pending_role_grant__sync_uq" ON "discord_pending_role_grant" USING btree ("discord_user_id","role_id","source_binding_id") WHERE "discord_pending_role_grant"."source" = 'discord-sync';--> statement-breakpoint
CREATE UNIQUE INDEX "discord_role_binding__discord_role_app_role_idx" ON "discord_role_binding" USING btree ("discord_role_id","app_role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role__name_idx" ON "role" USING btree ("name");--> statement-breakpoint
CREATE INDEX "user_role__user_id_idx" ON "user_role" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_role__manual_uq" ON "user_role" USING btree ("user_id","role_id") WHERE "user_role"."source" = 'manual';--> statement-breakpoint
CREATE UNIQUE INDEX "user_role__sync_uq" ON "user_role" USING btree ("user_id","role_id","source_binding_id") WHERE "user_role"."source" = 'discord-sync';