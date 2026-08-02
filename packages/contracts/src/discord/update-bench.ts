import { z } from "zod";
import { ErrorResponseSchema, discordSnowflake } from "./common.js";

export const UpdateBenchRequestSchema = z.object({
  discordUserId: discordSnowflake("Invalid Discord user ID"),
  // The original check was `!raidId || typeof raidId !== "number"`, which also rejected 0.
  // `.int().positive()` keeps that and additionally rejects negatives and fractions, which
  // would have reached the database and failed there instead.
  raidId: z.number({ error: "Invalid raid ID" }).int({ error: "Invalid raid ID" }).positive({
    error: "Invalid raid ID",
  }),
  characterNames: z
    .array(z.string(), { error: "Character names array is required" })
    .min(1, { error: "Character names array is required" }),
});
export type UpdateBenchRequest = z.infer<typeof UpdateBenchRequestSchema>;

export const BenchedCharacterSchema = z.object({
  characterId: z.number(),
  name: z.string(),
  class: z.string(),
  server: z.string(),
});
export type BenchedCharacter = z.infer<typeof BenchedCharacterSchema>;

export const UpdateBenchSuccessSchema = z.object({
  success: z.literal(true),
  raidId: z.number(),
  raidName: z.string(),
  raidUrl: z.string(),
  matchedCharacters: z.array(BenchedCharacterSchema),
  unmatchedNames: z.array(z.string()),
  totalBenchCharacters: z.number(),
});

export const UpdateBenchFailureSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

/** What the route emits with a 200. Annotate route payloads with this. */
export const UpdateBenchResultSchema = z.discriminatedUnion("success", [
  UpdateBenchSuccessSchema,
  UpdateBenchFailureSchema,
]);
export type UpdateBenchResult = z.infer<typeof UpdateBenchResultSchema>;

/** What a caller can receive, including the bare `{ error }` bodies on non-200 statuses. */
export const UpdateBenchResponseSchema = z.union([UpdateBenchResultSchema, ErrorResponseSchema]);
export type UpdateBenchResponse = z.infer<typeof UpdateBenchResponseSchema>;
