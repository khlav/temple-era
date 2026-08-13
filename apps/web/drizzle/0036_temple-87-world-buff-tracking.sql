CREATE TYPE "public"."world_buff_item" AS ENUM('rends_head', 'onyxias_head', 'nefarians_head', 'hakkars_heart');--> statement-breakpoint
CREATE TYPE "public"."world_buff_state" AS ENUM('ready_to_drop', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."world_buff_queue_type" AS ENUM('main', 'alt', 'backup');--> statement-breakpoint
ALTER TYPE "public"."scope" ADD VALUE 'worldbuff:manage';--> statement-breakpoint
CREATE TABLE "world_buff_assignment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
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
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "world_buff_assignment" ADD CONSTRAINT "world_buff_assignment_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buff_assignment" ADD CONSTRAINT "world_buff_assignment_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buff_assignment" ADD CONSTRAINT "world_buff_assignment_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."world_buff_character_status"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buff_character_status" ADD CONSTRAINT "world_buff_character_status_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buff_character_status" ADD CONSTRAINT "world_buff_character_status_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buff_character_status" ADD CONSTRAINT "world_buff_character_status_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("character_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_buff_assignment__status_id_idx" ON "world_buff_assignment" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "world_buff_assignment__scheduled_at_idx" ON "world_buff_assignment" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "world_buff_character_status__name_item_uq" ON "world_buff_character_status" USING btree ("character_name_normalized","item");--> statement-breakpoint
CREATE INDEX "world_buff_character_status__character_id_idx" ON "world_buff_character_status" USING btree ("character_id");