import { z } from "zod";
import { ErrorResponseSchema, discordSnowflake } from "./common.js";

export const EnsureSoftresRequestSchema = z.object({
  eventId: discordSnowflake("Invalid Raid Helper event ID"),
});
export type EnsureSoftresRequest = z.infer<typeof EnsureSoftresRequestSchema>;

export const EnsureSoftresCreatedLinkSchema = z.object({
  zone: z.string(),
  instanceId: z.number(),
  adminUrl: z.string(),
  /** Human-readable "Weekday MM/DD/YYYY" for the raid night, e.g. "Sunday 09/13/2026" —
   * derived from the Raid Helper event's startTime, matching the day/date raid leads
   * already include in their own hand-posted Token thread messages. */
  eventDate: z.string(),
});

export const EnsureSoftresSuccessSchema = z.object({
  success: z.literal(true),
  /** false when softresId was already present — no SRs were created */
  created: z.boolean(),
  links: z.array(EnsureSoftresCreatedLinkSchema),
});

export const EnsureSoftresFailureSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export const EnsureSoftresResultSchema = z.discriminatedUnion("success", [
  EnsureSoftresSuccessSchema,
  EnsureSoftresFailureSchema,
]);
export type EnsureSoftresResult = z.infer<typeof EnsureSoftresResultSchema>;

export const EnsureSoftresResponseSchema = z.union([
  EnsureSoftresResultSchema,
  ErrorResponseSchema,
]);
export type EnsureSoftresResponse = z.infer<typeof EnsureSoftresResponseSchema>;
