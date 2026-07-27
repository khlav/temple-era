import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  discordPendingRoleGrants,
  discordRoleBindings,
  discordSyncState,
  userRoles,
} from "~/server/db/models/access-schema";
import { getGuildMembers, getGuildRoles } from "~/server/api/discord-guild-helpers";
import { getUserIdForDiscordId } from "~/server/services/access-service";
import { logger } from "~/lib/logger";

export interface DiscordSyncSummary {
  granted: number;
  revoked: number;
  pendingCreated: number;
}

/**
 * Diffs live Discord guild role membership against discord_role_binding config and applies the
 * result to user_role. Rows this sync grants are tagged source = 'discord-sync' so a later run
 * can safely revoke them if the member loses the Discord role — manually granted rows
 * (source = 'manual') are never touched, by construction (the revocation query below always
 * filters on source = 'discord-sync').
 */
export async function syncDiscordRoles(): Promise<DiscordSyncSummary> {
  const bindings = await db.select().from(discordRoleBindings);

  const summary: DiscordSyncSummary = { granted: 0, revoked: 0, pendingCreated: 0 };

  if (bindings.length === 0) {
    logger.debug("[Discord Sync] No discord_role_binding rows configured, nothing to do");
    return summary;
  }

  const [guildRoles, members] = await Promise.all([getGuildRoles(), getGuildMembers()]);
  const guildRoleNameById = new Map(guildRoles.map((r) => [r.id, r.name]));

  for (const binding of bindings) {
    // Refresh the cached display label if the Discord role's name has changed.
    const liveName = guildRoleNameById.get(binding.discordRoleId);
    if (liveName && liveName !== binding.discordRoleName) {
      await db
        .update(discordRoleBindings)
        .set({ discordRoleName: liveName })
        .where(eq(discordRoleBindings.id, binding.id));
    }

    const discordIdsWithRole = members
      .filter((m) => m.roles.includes(binding.discordRoleId))
      .map((m) => m.user.id);

    const resolvedUserIds: string[] = [];

    for (const discordUserId of discordIdsWithRole) {
      const userId = await getUserIdForDiscordId(discordUserId);

      if (userId) {
        resolvedUserIds.push(userId);
        await db
          .insert(userRoles)
          .values({
            userId,
            roleId: binding.appRoleId,
            source: "discord-sync",
            sourceBindingId: binding.id,
          })
          .onConflictDoUpdate({
            target: [userRoles.userId, userRoles.roleId, userRoles.sourceBindingId],
            targetWhere: sql`${userRoles.source} = 'discord-sync'`,
            set: { source: "discord-sync" },
          });
        summary.granted += 1;
      } else {
        await db
          .insert(discordPendingRoleGrants)
          .values({
            discordUserId,
            roleId: binding.appRoleId,
            source: "discord-sync",
            sourceBindingId: binding.id,
          })
          .onConflictDoUpdate({
            target: [
              discordPendingRoleGrants.discordUserId,
              discordPendingRoleGrants.roleId,
              discordPendingRoleGrants.sourceBindingId,
            ],
            targetWhere: sql`${discordPendingRoleGrants.source} = 'discord-sync'`,
            set: { source: "discord-sync" },
          });
        summary.pendingCreated += 1;
      }
    }

    // Revoke sync-owned grants for this binding that no longer hold the Discord role. Only
    // rows with source = 'discord-sync' for this exact binding are eligible — manual grants
    // are a different `source` value and structurally can't match this filter.
    const revoked = await db
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.roleId, binding.appRoleId),
          eq(userRoles.source, "discord-sync"),
          eq(userRoles.sourceBindingId, binding.id),
          resolvedUserIds.length > 0 ? notInArray(userRoles.userId, resolvedUserIds) : undefined,
        ),
      )
      .returning({ userId: userRoles.userId });
    summary.revoked += revoked.length;

    // Clean up stale pending grants from this binding for Discord IDs no longer holding the role.
    if (discordIdsWithRole.length > 0) {
      await db
        .delete(discordPendingRoleGrants)
        .where(
          and(
            eq(discordPendingRoleGrants.sourceBindingId, binding.id),
            notInArray(discordPendingRoleGrants.discordUserId, discordIdsWithRole),
          ),
        );
    }
  }

  await db
    .insert(discordSyncState)
    .values({ id: 1, lastSyncedAt: new Date(), lastSyncSummary: JSON.stringify(summary) })
    .onConflictDoUpdate({
      target: discordSyncState.id,
      set: { lastSyncedAt: new Date(), lastSyncSummary: JSON.stringify(summary) },
    });

  logger.debug({ summary }, "[Discord Sync] Sync complete");
  return summary;
}

export async function getDiscordSyncState() {
  const rows = await db.select().from(discordSyncState).where(eq(discordSyncState.id, 1)).limit(1);
  const row = rows[0];
  return {
    lastSyncedAt: row?.lastSyncedAt ?? null,
    lastSyncSummary: row?.lastSyncSummary
      ? (JSON.parse(row.lastSyncSummary) as DiscordSyncSummary)
      : null,
  };
}
