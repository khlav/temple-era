// src/server/api/v2/context.ts
import { createHash } from "crypto";
import { GraphQLError } from "graphql";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";
import { env } from "~/env.js";

export type AuthUser = {
  id: string;
  name: string | null;
  image: string | null;
  isRaidManager: boolean | null;
  isAdmin: boolean | null;
  characterId: number | null;
};

export type Context = {
  user: AuthUser | null;
  /** True when authenticated via the bot service token (TEMPLE_WEB_API_TOKEN). */
  isServiceAuth: boolean;
  db: typeof db;
};

async function resolveAuth(
  request: Request,
): Promise<{ user: AuthUser | null; isServiceAuth: boolean }> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return { user: null, isServiceAuth: false };

  if (token === env.TEMPLE_WEB_API_TOKEN) {
    return { user: null, isServiceAuth: true };
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      isRaidManager: users.isRaidManager,
      isAdmin: users.isAdmin,
      characterId: users.characterId,
    })
    .from(users)
    .where(eq(users.apiToken, tokenHash))
    .limit(1);

  return { user: result[0] ?? null, isServiceAuth: false };
}

export async function buildContext({ request }: { request: Request }): Promise<Context> {
  const { user, isServiceAuth } = await resolveAuth(request);
  return { user, isServiceAuth, db };
}

/** Throws UNAUTHENTICATED if neither a valid user token nor the bot service token was provided. */
export function requireUser(ctx: Context): AuthUser | null {
  if (!ctx.user && !ctx.isServiceAuth) {
    throw new GraphQLError("Not authenticated", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return ctx.user;
}
