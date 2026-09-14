import { z } from "zod";
import { ErrorResponseSchema, discordSnowflake } from "./common.js";

export const EnsureSoftresRequestSchema = z.object({
  eventId: discordSnowflake("Invalid Raid Helper event ID"),
});
export type EnsureSoftresRequest = z.infer<typeof EnsureSoftresRequestSchema>;

export const EnsureSoftresCreatedLinkSchema = z.object({
  zone: z.string(),
  instanceId: z.number(),
  /** Admin (soft-reserve-managing) link — carries the token, only ever posted to the SoftRes
   * Token thread, never to a raid channel. */
  adminUrl: z.string(),
  /** Public (no-token) link — safe to post in a raid channel for members to reserve against. */
  publicUrl: z.string(),
  /** Human-readable "Weekday MM/DD/YYYY" for the raid night, e.g. "Sunday 09/13/2026" —
   * derived from the Raid Helper event's startTime, matching the day/date raid leads
   * already include in their own hand-posted Token thread messages. */
  eventDate: z.string(),
  /** The same raid night, as unix seconds (Raid Helper's `startTime`) — a machine-sortable
   * sibling to `eventDate`, used to keep the bot's weekly Token-thread summary in
   * chronological order regardless of the order raids are created in. */
  eventTimestamp: z.number(),
});

export const EnsureSoftresSuccessSchema = z.object({
  success: z.literal(true),
  /** false when softresId was already present — no SRs were created */
  created: z.boolean(),
  links: z.array(EnsureSoftresCreatedLinkSchema),
  /** The Raid-Helper event's display title (e.g. "Sunday BWL/MC @7PM"), used by the bot to
   * title the embed it posts — present even when `links` is empty. */
  eventTitle: z.string(),
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
