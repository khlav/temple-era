ALTER TABLE "auth_user" ADD COLUMN IF NOT EXISTS "api_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN IF NOT EXISTS "templar_enabled" boolean DEFAULT false NOT NULL;