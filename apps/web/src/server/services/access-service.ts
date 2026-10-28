import { revalidateTag, unstable_cache } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { env } from "~/env";
import { logger } from "~/lib/logger";
import { SCOPE, SCOPES } from "~/lib/scopes";
import { accounts, users } from "~/server/db/models/auth-schema";
import {
  discordPendingRoleGrants,
  roles,
  userRoles,
  type Scope,
} from "~/server/db/models/access-schema";

// Scopes bundled into the "Raid Manager"/"Admin" system roles that map back onto the two
// legacy booleans, so every existing consumer (trpc.ts guards, v1-auth.ts, v2/context.ts,
// check-permissions/route.ts, discord-trpc-caller.ts, config.ts session callback) keeps
// working unchanged while the source of truth moves to user_role/role underneath.
export const LEGACY_RAID_MANAGER_SCOPES: Scope[] = [
  SCOPE.RAIDLOG_MANAGE,
  SCOPE.RAIDPLAN_MANAGE,
  SCOPE.CHARACTER_MANAGE,
  SCOPE.SOFTRES_ACCESS,
  SCOPE.TEMPLAR_ACCESS,
  SCOPE.API_TOKEN_ACCESS,
];
export const LEGACY_ADMIN_SCOPES: Scope[] = [SCOPE.USERPERMISSIONS_MANAGE];

// Scopes granted to every authenticated user regardless of assigned roles. Empty today —
// this is where a capability goes when it graduates from role-gated to available-to-everyone
// (e.g. templar:access opening up), as a one-line change rather than a data migration.
export const DEFAULT_MEMBER_SCOPES: Scope[] = [];

export interface UserAccess {
  scopes: Scope[];
  isRaidManager: boolean;
  isAdmin: boolean;
  isSuperadmin: boolean;
}

function deriveLegacyFlags(scopeSet: Set<Scope>): { isRaidManager: boolean; isAdmin: boolean } {
  return {
    isRaidManager: LEGACY_RAID_MANAGER_SCOPES.some((s) => scopeSet.has(s)),
    isAdmin: LEGACY_ADMIN_SCOPES.some((s) => scopeSet.has(s)),
  };
}

const USER_ACCESS_TAG = "user-access";
// Fallback only, for edits made outside the app (hand-run SQL). Every in-app write to role,
// user_role or a Discord role binding expires the cache at once via invalidateUserAccessCache().
const USER_ACCESS_REVALIDATE_SECONDS = 15 * 60;

/**
 * The database half of resolveUserAccess, cached per user in the shared Data Cache. The session
 * callback resolves access on every signed-in request, which was ~5,800 role reads and as many
 * Discord-account lookups a day (TEMPLE-165). The role scopes change only through the app, which
 * expires this on every such write. The Discord id never changes for a user: Discord is the only
 * provider, NextAuth links it once at first sign-in, before any session exists to cache, and
 * nothing in the app unlinks it. Whether that id is a superadmin is decided against the env on
 * every call, so the break-glass path still works the moment SUPERADMIN_DISCORD_IDS changes.
 */
const getCachedUserAccessFacts = unstable_cache(
  async (userId: string) => {
    const [rows, account] = await Promise.all([
      db
        .select({ scopes: roles.scopes })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, userId)),
      db
        .select({ discordId: accounts.providerAccountId })
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.provider, "discord")))
        .limit(1),
    ]);
    return {
      roleScopes: [...new Set(rows.flatMap((row) => row.scopes))],
      discordId: account[0]?.discordId ?? null,
    };
  },
  ["user-access"],
  { tags: [USER_ACCESS_TAG], revalidate: USER_ACCESS_REVALIDATE_SECONDS },
);

/**
 * Expires every user's cached access immediately. Call it after any write to role or user_role.
 * `{ expire: 0 }` rather than the "max" profile used for other caches here: "max" serves the stale
 * value once more while it refreshes, which would let a revoked permission through on the next
 * request.
 */
export function invalidateUserAccessCache(): void {
  try {
    revalidateTag(USER_ACCESS_TAG, { expire: 0 });
  } catch (err) {
    // Expected outside a Next request (scripts, tests), where there is no cache to expire. Inside
    // one it would leave a revoked permission working until the fallback, so leave a trace.
    logger.warn({ err }, "Failed to expire the user-access cache");
  }
}

/**
 * Resolves a user's effective scopes (role-derived + default) and the backward-compatible
 * isRaidManager/isAdmin booleans derived from them. Single chokepoint for every consumer that
 * used to read isRaidManager/isAdmin directly off the auth_user row.
 */
export async function resolveUserAccess(userId: string): Promise<UserAccess> {
  const { roleScopes, discordId } = await getCachedUserAccessFacts(userId);
  const isSuperadmin = discordId !== null && env.SUPERADMIN_DISCORD_IDS.includes(discordId);

  // Superadmins hold every scope by definition, so future scopes are covered without config
  // changes. Deliberately additive to (not a replacement for) role-derived scopes.
  const scopeSet = new Set<Scope>(isSuperadmin ? SCOPES : DEFAULT_MEMBER_SCOPES);
  for (const scope of roleScopes) {
    scopeSet.add(scope as Scope);
  }

  return {
    scopes: Array.from(scopeSet),
    isSuperadmin,
    ...deriveLegacyFlags(scopeSet),
  };
}

/**
 * User ids of every configured superadmin who has actually logged in (i.e. has a linked Discord
 * account). Ids listed in env that have never signed in simply don't appear.
 */
export async function getSuperadminUserIds(): Promise<string[]> {
  if (env.SUPERADMIN_DISCORD_IDS.length === 0) return [];

  const result = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, "discord"),
        inArray(accounts.providerAccountId, env.SUPERADMIN_DISCORD_IDS),
      ),
    );

  return result.map((r) => r.userId);
}

/**
 * True when the user's linked Discord account appears in SUPERADMIN_DISCORD_IDS.
 *
 * Env-derived rather than DB-derived on purpose: this is the break-glass path, so it must keep
 * working even when the role/user_role tables are empty, corrupt, or have had the last admin
 * revoked through the UI. Nothing in the app can grant or revoke it.
 */
export async function isSuperadminUserId(userId: string): Promise<boolean> {
  if (env.SUPERADMIN_DISCORD_IDS.length === 0) return false;

  const result = await db
    .select({ discordId: accounts.providerAccountId })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "discord")))
    .limit(1);

  const discordId = result[0]?.discordId;
  return discordId !== undefined && env.SUPERADMIN_DISCORD_IDS.includes(discordId);
}

/**
 * Materializes any discord_pending_role_grant rows for a Discord account into real user_role
 * grants, then deletes the consumed pending rows. Called on first login (auth config's signIn
 * callback) and by the Discord sync job when it discovers a not-yet-logged-in member.
 */
export async function materializePendingGrantsForDiscordId(
  discordUserId: string,
  userId: string,
): Promise<void> {
  const pending = await db
    .select()
    .from(discordPendingRoleGrants)
    .where(eq(discordPendingRoleGrants.discordUserId, discordUserId));

  if (pending.length === 0) return;

  for (const grant of pending) {
    await db
      .insert(userRoles)
      .values({
        userId,
        roleId: grant.roleId,
        source: grant.source,
        sourceBindingId: grant.sourceBindingId,
      })
      .onConflictDoUpdate(
        grant.source === "discord-sync"
          ? {
              target: [userRoles.userId, userRoles.roleId, userRoles.sourceBindingId],
              targetWhere: sql`${userRoles.source} = 'discord-sync'`,
              set: { source: "discord-sync" },
            }
          : {
              target: [userRoles.userId, userRoles.roleId],
              targetWhere: sql`${userRoles.source} = 'manual'`,
              set: { source: "manual", sourceBindingId: null },
            },
      );
  }

  await db
    .delete(discordPendingRoleGrants)
    .where(eq(discordPendingRoleGrants.discordUserId, discordUserId));
  invalidateUserAccessCache();
}

/**
 * Resolves a website user id for a given Discord account id, via the shared
 * accounts(provider='discord') join used elsewhere (discord-helpers.ts, check-permissions).
 */
export async function getUserIdForDiscordId(discordUserId: string): Promise<string | null> {
  const result = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(accounts, eq(users.id, accounts.userId))
    .where(and(eq(accounts.provider, "discord"), eq(accounts.providerAccountId, discordUserId)))
    .limit(1);

  return result[0]?.id ?? null;
}
