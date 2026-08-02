import { z } from "zod";
import { discordSnowflake } from "./common.js";

/**
 * `POST /api/discord/proxy/[discordId]`.
 *
 * ⚠️ Consumed by **Templar**, a bot outside this repo that cannot be updated in lockstep. This
 * schema is a verbatim move of the one that lived in the route handler — including the URL
 * normalisation transform and the recursion guard. Any change here is a breaking change to an
 * external consumer.
 *
 * There is no response schema: the route returns the upstream `/api/v1/*` response body and
 * status unaltered, so its shape is whatever the proxied endpoint returns.
 */

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export const API_VERSIONS = ["v1", "v2"] as const;

export const ProxyDiscordIdSchema = discordSnowflake("Invalid Discord user ID");

export const ProxyRequestSchema = z.object({
  method: z
    .string()
    .toUpperCase()
    .refine((m) => ALLOWED_METHODS.has(m), {
      message: "method must be GET, POST, PUT, PATCH, or DELETE",
    }),
  apiVersion: z.enum(API_VERSIONS).default("v1"),
  path: z
    .string()
    .min(1)
    .startsWith("/")
    .transform((p) => {
      try {
        const url = new URL(`http://x${p}`);
        return `${url.pathname}${url.search}` || "/";
      } catch {
        return p;
      }
    })
    .pipe(
      z
        .string()
        .startsWith("/")
        .refine((p) => !p.startsWith("/discord/proxy") && !p.startsWith("/admin/proxy"), {
          message: "Recursive proxy calls are not allowed",
        }),
    ),
  body: z.unknown().optional(),
});
export type ProxyRequest = z.infer<typeof ProxyRequestSchema>;
