import { z } from "zod";
import { ScopeSchema, discordSnowflake } from "./common.js";

export const CheckPermissionsRequestSchema = z.object({
  discordUserId: discordSnowflake("Invalid Discord user ID"),
});
export type CheckPermissionsRequest = z.infer<typeof CheckPermissionsRequestSchema>;

export const CheckPermissionsResponseSchema = z.object({
  hasAccount: z.boolean(),
  /**
   * Legacy. Derived from "user holds ANY raid-manager-ish scope", which is BROADER than the
   * `raidlog:manage` gate the write routes enforce — a user with only `character:manage` reads
   * as `isRaidManager: true` here and is then rejected by create-raid. Read `scopes` instead.
   * Removing this field is a cross-repo breaking change; see
   * docs/followups/legacy-access-booleans-cleanup.md.
   */
  isRaidManager: z.boolean(),
  /**
   * Optional only to survive deploy skew. The web app (Vercel) and the bot (Northflank) deploy
   * from the same merge but not at the same speed, so a bot build that reads `scopes` can briefly
   * talk to a web build that does not send them. Consumers must fall back rather than fail
   * closed. Once both sides have shipped, this can be made required — same cleanup as the
   * `isRaidManager` removal above.
   */
  scopes: z.array(ScopeSchema).optional(),
});
export type CheckPermissionsResponse = z.infer<typeof CheckPermissionsResponseSchema>;
