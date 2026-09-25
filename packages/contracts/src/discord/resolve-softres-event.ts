import { z } from "zod";
import { ErrorResponseSchema } from "./common.js";

export const ResolveSoftresEventRequestSchema = z.object({
  /** The softres.it raid id, e.g. the `QeZ61kge` in `/raid/QeZ61kge?adminToken=…`. */
  raidId: z.string().regex(/^[A-Za-z0-9]{4,16}$/, "Invalid SoftRes raid ID"),
  /** Optional Eastern-time day (`YYYY-MM-DD`) narrowing the search to that raid night — for when
   * a raid lead's own message names the date. Without it, every upcoming event for the zone is
   * a candidate. */
  dateHint: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateHint must be YYYY-MM-DD")
    .optional(),
});
export type ResolveSoftresEventRequest = z.infer<typeof ResolveSoftresEventRequestSchema>;

export const ResolveSoftresEventCandidateSchema = z.object({
  /** The Raid Helper event, or null when the time came from SoftRes itself. */
  eventId: z.string().nullable(),
  title: z.string(),
  /** Where the time came from: SoftRes's own `raid_date` (only set on raids linked through Raid
   * Helper, and authoritative when present) or a matching Raid Helper event. */
  source: z.enum(["softres", "raid-helper"]),
  /** Raid Helper's `startTime`, unix seconds. */
  timestamp: z.number(),
});

export type ResolveSoftresEventCandidate = z.infer<typeof ResolveSoftresEventCandidateSchema>;

export const ResolveSoftresEventSuccessSchema = z.object({
  success: z.literal(true),
  /** The zone SoftRes says this raid is for (a `RaidZone` name, matching `/sr`'s `zone`), or
   * null when SoftRes's instance is not one of the seven known raid zones. */
  zone: z.string().nullable(),
  /** The raid night(s) this SR could be for. If SoftRes has a `raid_date` that is the single
   * candidate; otherwise it is the upcoming Raid Helper events naming the zone, soonest first
   * (most SRs carry no date of their own). Empty when nothing matches. */
  candidates: z.array(ResolveSoftresEventCandidateSchema),
});

export const ResolveSoftresEventFailureSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export const ResolveSoftresEventResultSchema = z.discriminatedUnion("success", [
  ResolveSoftresEventSuccessSchema,
  ResolveSoftresEventFailureSchema,
]);
export type ResolveSoftresEventResult = z.infer<typeof ResolveSoftresEventResultSchema>;

export const ResolveSoftresEventResponseSchema = z.union([
  ResolveSoftresEventResultSchema,
  ErrorResponseSchema,
]);
export type ResolveSoftresEventResponse = z.infer<typeof ResolveSoftresEventResponseSchema>;
