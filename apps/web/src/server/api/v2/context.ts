// src/server/api/v2/context.ts
import { createHash } from "crypto";
import { GraphQLError } from "graphql";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

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
  db: typeof db;
};

async function resolveUser(request: Request): Promise<AuthUser | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return null;

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

  return result[0] ?? null;
}

export async function buildContext({ request }: { request: Request }): Promise<Context> {
  const user = await resolveUser(request);
  return { user, db };
}

/** Throws UNAUTHENTICATED if no valid token was provided. */
export function requireUser(ctx: Context): AuthUser {
  if (!ctx.user) {
    throw new GraphQLError("Not authenticated", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return ctx.user;
}
