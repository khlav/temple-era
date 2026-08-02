import { z } from "zod";
import { ErrorResponseSchema, discordSnowflake } from "./common.js";

// Unlike create-raid, `discordMessageId` is required here: it is the key the route uses to find
// the raid log the edited message originally created.
export const UpdateRaidRequestSchema = z.object({
  discordUserId: discordSnowflake("Invalid Discord user ID"),
  newWclUrl: z
    .string({ error: "Invalid WarcraftLogs URL" })
    .includes("warcraftlogs.com/reports/", { error: "Invalid WarcraftLogs URL" }),
  discordMessageId: discordSnowflake("Invalid Discord message ID"),
});
export type UpdateRaidRequest = z.infer<typeof UpdateRaidRequestSchema>;

/** The edit resolved to the same WCL report — nothing was changed. `message` is the marker. */
export const UpdateRaidNoChangeSchema = z.object({
  success: z.literal(true),
  isNew: z.literal(false),
  message: z.string(),
  raidId: z.number(),
});

export const UpdateRaidUpdatedSchema = z.object({
  success: z.literal(true),
  isNew: z.literal(false),
  raidId: z.number(),
  raidName: z.string(),
  zone: z.string(),
  date: z.string(),
  participantCount: z.number(),
  killCount: z.number(),
  raidUrl: z.string(),
  nameChanged: z.boolean(),
});

export const UpdateRaidFailureSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

/**
 * What the route emits with a 200. Annotate route payloads with this.
 *
 * The two success variants are mutually exclusive — each requires a field the other lacks
 * (`message` vs `raidName` and friends) — so exactly one can ever match and the order here is
 * presentational. Keep it that way: giving the updated variant an optional `message` would make
 * the union ambiguous and hand the outcome to declaration order.
 */
export const UpdateRaidResultSchema = z.union([
  UpdateRaidNoChangeSchema,
  UpdateRaidUpdatedSchema,
  UpdateRaidFailureSchema,
]);
export type UpdateRaidResult = z.infer<typeof UpdateRaidResultSchema>;

/** What a caller can receive, including the bare `{ error }` bodies on non-200 statuses. */
export const UpdateRaidResponseSchema = z.union([UpdateRaidResultSchema, ErrorResponseSchema]);
export type UpdateRaidResponse = z.infer<typeof UpdateRaidResponseSchema>;
