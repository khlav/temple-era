import { z } from "zod";
import { ErrorResponseSchema, discordSnowflake } from "./common.js";

// Field order matters: it decides which message `firstIssueMessage` returns for a request that
// is invalid in several ways, and it mirrors the original hand-written validation chain.
export const CreateRaidRequestSchema = z.object({
  discordUserId: discordSnowflake("Invalid Discord user ID"),
  wclUrl: z
    .string({ error: "Invalid WarcraftLogs URL" })
    .includes("warcraftlogs.com/reports/", { error: "Invalid WarcraftLogs URL" }),
  discordMessageId: discordSnowflake("Invalid Discord message ID").optional(),
});
export type CreateRaidRequest = z.infer<typeof CreateRaidRequestSchema>;

/**
 * `raidId`/`raidName` are optional because the newly-created-raid path reads them off
 * `result.raid?.raidId` — an insert that returned nothing serialises them away. The
 * already-exists path always populates both.
 */
export const CreateRaidSuccessSchema = z.object({
  success: z.literal(true),
  isNew: z.boolean(),
  raidId: z.number().optional(),
  raidName: z.string().optional(),
  zone: z.string(),
  date: z.string(),
  participantCount: z.number(),
  killCount: z.number(),
  raidUrl: z.string(),
});

export const CreateRaidFailureSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

/** What the route emits with a 200. Annotate route payloads with this. */
export const CreateRaidResultSchema = z.discriminatedUnion("success", [
  CreateRaidSuccessSchema,
  CreateRaidFailureSchema,
]);
export type CreateRaidResult = z.infer<typeof CreateRaidResultSchema>;

/**
 * What a caller can actually receive. Auth, validation, and unhandled-error paths reply with a
 * bare `{ error }` and a non-200 status, so a client parsing the body without first branching on
 * the status needs that variant too.
 */
export const CreateRaidResponseSchema = z.union([CreateRaidResultSchema, ErrorResponseSchema]);
export type CreateRaidResponse = z.infer<typeof CreateRaidResponseSchema>;
