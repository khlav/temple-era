CREATE TABLE "raid_plan_presence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"client_session_id" varchar(128) NOT NULL,
	"mode" varchar(16) DEFAULT 'viewing' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raid_plan" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "raid_plan_presence" ADD CONSTRAINT "raid_plan_presence_raid_plan_id_raid_plan_id_fk" FOREIGN KEY ("raid_plan_id") REFERENCES "public"."raid_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_presence" ADD CONSTRAINT "raid_plan_presence_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raid_plan_presence__raid_plan_id_idx" ON "raid_plan_presence" USING btree ("raid_plan_id");--> statement-breakpoint
CREATE INDEX "raid_plan_presence__user_id_idx" ON "raid_plan_presence" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "raid_plan_presence__last_seen_at_idx" ON "raid_plan_presence" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_plan_presence__plan_session_idx" ON "raid_plan_presence" USING btree ("raid_plan_id","client_session_id");--> statement-breakpoint
ALTER TABLE "raid_plan" ADD CONSTRAINT "raid_plan_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;