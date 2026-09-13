import { z } from "zod";
import { ErrorResponseSchema } from "./common.js";

// Keep in sync with apps/web/src/lib/raid-zones.ts's RAID_ZONE_CONFIG instance slugs.
export const CreateSoftresRequestSchema = z.object({
  zone: z.enum(["onyxia", "mc", "bwl", "zg", "aq20", "aq40", "naxxramas"]),
});
export type CreateSoftresRequest = z.infer<typeof CreateSoftresRequestSchema>;

export const CreateSoftresSuccessSchema = z.object({
  success: z.literal(true),
  zone: z.string(),
  /** Admin (soft-reserve-managing) link — carries the token, only ever posted to the SoftRes
   * Token thread, never to a raid channel. */
  adminUrl: z.string(),
  /** Public (no-token) link — safe to post in a raid channel for members to reserve against. */
  publicUrl: z.string(),
  createdDate: z.string(),
});

export const CreateSoftresFailureSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export const CreateSoftresResultSchema = z.discriminatedUnion("success", [
  CreateSoftresSuccessSchema,
  CreateSoftresFailureSchema,
]);
export type CreateSoftresResult = z.infer<typeof CreateSoftresResultSchema>;

export const CreateSoftresResponseSchema = z.union([
  CreateSoftresResultSchema,
  ErrorResponseSchema,
]);
export type CreateSoftresResponse = z.infer<typeof CreateSoftresResponseSchema>;
