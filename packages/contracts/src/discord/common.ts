import { z } from "zod";

/**
 * Discord IDs are snowflakes: 17–19 digits. Every `/api/discord/*` route validated these with
 * this exact regex before the schemas existed, and the error strings below are copied verbatim
 * from those routes — the bot logs response bodies, so changing them changes observable output.
 */
export const DISCORD_SNOWFLAKE_REGEX = /^\d{17,19}$/;

/** A snowflake field carrying a fixed error message for both "wrong type" and "wrong shape". */
export function discordSnowflake(message: string) {
  return z.string({ error: message }).regex(DISCORD_SNOWFLAKE_REGEX, { error: message });
}

/**
 * The scope every `/api/discord/*` write route actually gates on.
 *
 * Duplicated as a literal rather than imported from `apps/web/src/lib/scopes.ts`: that module is
 * tied to a Postgres enum and belongs to the web app. `check-permissions/route.ts` carries a
 * compile-time assertion that the two agree, so drift is a typecheck failure, not a runtime one.
 */
export const RAIDLOG_MANAGE_SCOPE = "raidlog:manage";

/**
 * Scopes are deliberately `string`, not an enum. The bot is deployed from a different pipeline
 * than the web app, so it will routinely run against a web build that knows scopes this package
 * has never heard of. An enum would turn that into a parse failure and a dead bot.
 */
export const ScopeSchema = z.string();

/**
 * Shape returned by every route's `catch` block and by the auth/config guards. Status code, not
 * this body, is what distinguishes them (401/500).
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Returns the first validation message, for routes that reply `{ error: <message> }` with a 400.
 * Object schemas report issues in declaration order, so ordering the fields in each request
 * schema to match the original hand-written `if` chain preserves which message wins when a
 * request is invalid in more than one way.
 */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request body";
}
