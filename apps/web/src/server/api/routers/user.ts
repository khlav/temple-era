import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, scopedProcedure } from "~/server/api/trpc";
import { users, accounts } from "~/server/db/schema";
import {
  SCOPE,
  discordPendingRoleGrants,
  discordRoleBindings,
  roles,
  userRoles,
  SCOPES,
} from "~/server/db/models/access-schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { getGuildRoles } from "~/server/api/discord-guild-helpers";
import { getDiscordSyncState, syncDiscordRoles } from "~/server/services/discord-role-sync";
import { getSuperadminUserIds } from "~/server/services/access-service";
import { SUPERADMIN_ROLE_ID, SUPERADMIN_ROLE_NAME } from "~/lib/scopes";

// Superadmin is a synthetic, env-derived role with no `role` row, so its sentinel id must never
// reach a DB mutation (it would either FK-fail or silently no-op). Reject it at the input edge.
const mutableRoleId = z.string().refine((id) => id !== SUPERADMIN_ROLE_ID, {
  message: "Superadmin is granted via SUPERADMIN_DISCORD_IDS and cannot be modified here.",
});

export const user = createTRPCRouter({
  updateUserImage: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    return await ctx.db
      .update(users)
      .set({
        image: input,
      })
      .where(eq(users.id, ctx.session.user.id))
      .returning({
        id: users.id,
        image: users.image,
      });
  }),

  // --- Resolved access view: replaces the flat toggle table ---

  getResolvedAccess: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE).query(async ({ ctx }) => {
    const allUsers = await ctx.db.query.users.findMany({
      orderBy: asc(sql`lower(${users.name})`),
      columns: { id: true, name: true, image: true },
      with: { character: { columns: { name: true, class: true } } },
    });

    const grants = await ctx.db
      .select({
        id: userRoles.id,
        userId: userRoles.userId,
        roleId: userRoles.roleId,
        roleName: roles.name,
        source: userRoles.source,
        sourceDiscordRoleName: discordRoleBindings.discordRoleName,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(discordRoleBindings, eq(userRoles.sourceBindingId, discordRoleBindings.id));

    const grantsByUser = new Map<string, typeof grants>();
    for (const grant of grants) {
      const existing = grantsByUser.get(grant.userId) ?? [];
      existing.push(grant);
      grantsByUser.set(grant.userId, existing);
    }

    // Superadmins hold no user_role row, so synthesize a grant for them; without this they'd
    // appear in the permissions table with no roles despite having full access.
    const superadminUserIds = new Set(await getSuperadminUserIds());

    return allUsers.map((u) => {
      const dbGrants = grantsByUser.get(u.id) ?? [];
      const grants = superadminUserIds.has(u.id)
        ? [
            {
              id: `${SUPERADMIN_ROLE_ID}:${u.id}`,
              userId: u.id,
              roleId: SUPERADMIN_ROLE_ID,
              roleName: SUPERADMIN_ROLE_NAME,
              source: "env" as const,
              sourceDiscordRoleName: null,
            } as unknown as (typeof dbGrants)[number],
            ...dbGrants,
          ]
        : dbGrants;

      return { ...u, roles: grants };
    });
  }),

  // --- Role editor (name + scope bundle) ---

  listRoles: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE).query(async ({ ctx }) => {
    const dbRoles = await ctx.db.query.roles.findMany({ orderBy: asc(roles.name) });

    // Superadmin is env-derived and has no row in `role`; surface it as a synthetic system role
    // so it renders alongside real ones. isSystem keeps the UI from offering edit/delete.
    const superadminRole = {
      id: SUPERADMIN_ROLE_ID,
      name: SUPERADMIN_ROLE_NAME,
      scopes: [...SCOPES],
      isSystem: true,
      createdAt: null,
      updatedAt: null,
    } as unknown as (typeof dbRoles)[number];

    return [superadminRole, ...dbRoles];
  }),

  createRole: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE)
    .input(z.object({ name: z.string().min(1).max(100), scopes: z.array(z.enum(SCOPES)) }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(roles)
        .values({
          name: input.name,
          scopes: input.scopes,
          createdById: ctx.session.user.id,
        })
        .returning();
      return created;
    }),

  updateRole: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE)
    .input(
      z.object({
        id: mutableRoleId,
        name: z.string().min(1).max(100).optional(),
        scopes: z.array(z.enum(SCOPES)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.roles.findFirst({ where: eq(roles.id, input.id) });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
      if (existing.isSystem && input.name) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot rename a system role" });
      }

      const [updated] = await ctx.db
        .update(roles)
        .set({
          ...(input.name ? { name: input.name } : {}),
          ...(input.scopes ? { scopes: input.scopes } : {}),
          updatedById: ctx.session.user.id,
        })
        .where(eq(roles.id, input.id))
        .returning();
      return updated;
    }),

  deleteRole: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE)
    .input(z.object({ id: mutableRoleId }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.roles.findFirst({ where: eq(roles.id, input.id) });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
      if (existing.isSystem) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete a system role" });
      }

      await ctx.db.delete(roles).where(eq(roles.id, input.id));
      return { success: true };
    }),

  // --- Discord role -> app role bindings ---

  listGuildRoles: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE).query(async () => {
    return await getGuildRoles();
  }),

  listBindings: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE).query(async ({ ctx }) => {
    return await ctx.db
      .select({
        id: discordRoleBindings.id,
        discordRoleId: discordRoleBindings.discordRoleId,
        discordRoleName: discordRoleBindings.discordRoleName,
        appRoleId: discordRoleBindings.appRoleId,
        appRoleName: roles.name,
      })
      .from(discordRoleBindings)
      .innerJoin(roles, eq(discordRoleBindings.appRoleId, roles.id));
  }),

  upsertBinding: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE)
    .input(
      z.object({
        discordRoleId: z.string(),
        discordRoleName: z.string(),
        appRoleId: mutableRoleId,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [binding] = await ctx.db
        .insert(discordRoleBindings)
        .values({
          discordRoleId: input.discordRoleId,
          discordRoleName: input.discordRoleName,
          appRoleId: input.appRoleId,
          createdById: ctx.session.user.id,
        })
        .onConflictDoUpdate({
          target: [discordRoleBindings.discordRoleId, discordRoleBindings.appRoleId],
          set: { discordRoleName: input.discordRoleName },
        })
        .returning();
      return binding;
    }),

  deleteBinding: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(discordRoleBindings).where(eq(discordRoleBindings.id, input.id));
      return { success: true };
    }),

  // --- Manual grants: name a Discord account directly, pre-login or post-login ---

  grantRoleToUser: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE)
    .input(z.object({ userId: z.string(), roleId: mutableRoleId }))
    .mutation(async ({ ctx, input }) => {
      const [grant] = await ctx.db
        .insert(userRoles)
        .values({
          userId: input.userId,
          roleId: input.roleId,
          source: "manual",
          createdById: ctx.session.user.id,
        })
        .onConflictDoUpdate({
          target: [userRoles.userId, userRoles.roleId],
          targetWhere: sql`${userRoles.source} = 'manual'`,
          set: { source: "manual", sourceBindingId: null },
        })
        .returning({ id: userRoles.id });
      return { id: grant?.id };
    }),

  grantRoleToDiscordUser: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE)
    .input(z.object({ discordUserId: z.string(), roleId: mutableRoleId }))
    .mutation(async ({ ctx, input }) => {
      const matched = await ctx.db
        .select({ id: users.id })
        .from(users)
        .innerJoin(accounts, eq(users.id, accounts.userId))
        .where(
          and(
            eq(accounts.provider, "discord"),
            eq(accounts.providerAccountId, input.discordUserId),
          ),
        )
        .limit(1);

      const userId = matched[0]?.id;

      if (userId) {
        await ctx.db
          .insert(userRoles)
          .values({
            userId,
            roleId: input.roleId,
            source: "manual",
            createdById: ctx.session.user.id,
          })
          .onConflictDoUpdate({
            target: [userRoles.userId, userRoles.roleId],
            targetWhere: sql`${userRoles.source} = 'manual'`,
            set: { source: "manual", sourceBindingId: null },
          });
        return { granted: "user_role" as const };
      }

      await ctx.db
        .insert(discordPendingRoleGrants)
        .values({
          discordUserId: input.discordUserId,
          roleId: input.roleId,
          source: "manual",
          createdById: ctx.session.user.id,
        })
        .onConflictDoUpdate({
          target: [discordPendingRoleGrants.discordUserId, discordPendingRoleGrants.roleId],
          targetWhere: sql`${discordPendingRoleGrants.source} = 'manual'`,
          set: { source: "manual", sourceBindingId: null },
        });
      return { granted: "pending" as const };
    }),

  // A grant is identified by its own row id (not userId+roleId) because the same role can now
  // be granted to a user more than once — e.g. two Discord bindings mapping to the same role,
  // or a manual grant alongside a synced one — and each needs to stay independently revocable.
  revokeRoleFromUser: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ source: userRoles.source })
        .from(userRoles)
        .where(eq(userRoles.id, input.id));

      if (existing?.source === "discord-sync") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This role was granted by Discord sync and can't be manually removed.",
        });
      }

      await ctx.db.delete(userRoles).where(eq(userRoles.id, input.id));
      return { success: true };
    }),

  // --- Discord sync trigger ---

  triggerDiscordSync: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE).mutation(async () => {
    return await syncDiscordRoles();
  }),

  getSyncState: scopedProcedure(SCOPE.USERPERMISSIONS_MANAGE).query(async () => {
    return await getDiscordSyncState();
  }),
});
