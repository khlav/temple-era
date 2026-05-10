// src/server/api/v2/schema.ts
import { and, desc, eq, gt, gte, ilike, inArray, lte } from "drizzle-orm";
import { accounts, characters, raids, users } from "~/server/db/schema";
import { builder } from "./builder";
import { requireUser } from "./context";

// Import all type files — each .implement() call is a side effect
import "./types/enums";
import "./types/attendance";
import "./types/raid";
import "./types/character";
import "./types/character-family";

// User type defines and exports UserRef directly (not via refs.ts)
import { UserRef, type UserData } from "./types/user";
import { CharacterRef, CharacterFamilyRef, RaidRef } from "./refs";
import { CharacterTypeEnum, RaidZoneEnum, GQL_ZONE_TO_DB } from "./types/enums";

builder.queryType({
  fields: (t) => ({
    /** Look up users by Discord user ID (providerAccountId from auth_account WHERE provider='discord') */
    users: t.field({
      type: [UserRef],
      args: {
        discordIds: t.arg.stringList({ required: true }),
      },
      resolve: async (_root, args, ctx) => {
        requireUser(ctx);
        if (args.discordIds.length === 0) return [];
        const rows = await ctx.db
          .select({
            id: users.id,
            discordId: accounts.providerAccountId,
            name: users.name,
            image: users.image,
            isRaidManager: users.isRaidManager,
            isAdmin: users.isAdmin,
            characterId: users.characterId,
          })
          .from(users)
          .innerJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.provider, "discord")))
          .where(inArray(accounts.providerAccountId, args.discordIds));
        return rows as UserData[];
      },
    }),

    /** Single character by DB character ID */
    character: t.field({
      type: CharacterRef,
      nullable: true,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_root, args, ctx) => {
        requireUser(ctx);
        const result = await ctx.db
          .select()
          .from(characters)
          .where(eq(characters.characterId, args.id))
          .limit(1);
        return result[0] ?? null;
      },
    }),

    /** Family-level attendance for multiple primaries */
    characterFamilies: t.field({
      type: [CharacterFamilyRef],
      args: {
        primaryCharacterIds: t.arg.intList({ required: true }),
      },
      resolve: async (_root, args, ctx) => {
        requireUser(ctx);
        if (args.primaryCharacterIds.length === 0) return [];
        const rows = await ctx.db
          .select({ characterId: characters.characterId, isPrimary: characters.isPrimary })
          .from(characters)
          .where(inArray(characters.characterId, args.primaryCharacterIds));
        const validIds = new Set(rows.filter((r) => r.isPrimary).map((r) => r.characterId));
        return args.primaryCharacterIds
          .filter((id) => validIds.has(id))
          .map((id) => ({ primaryCharacterId: id }));
      },
    }),

    /** List all non-ignored characters with optional type filter and name search */
    characters: t.field({
      type: [CharacterRef],
      args: {
        type: t.arg({ type: CharacterTypeEnum, required: false }),
        search: t.arg.string({ required: false }),
      },
      resolve: async (_root, args, ctx) => {
        requireUser(ctx);
        const conditions = [eq(characters.isIgnored, false)];

        if (args.type === "PRIMARY") {
          conditions.push(eq(characters.isPrimary, true));
        } else if (args.type === "SECONDARY") {
          conditions.push(eq(characters.isPrimary, false));
        }

        if (args.search) {
          conditions.push(ilike(characters.name, `%${args.search}%`));
        }

        return ctx.db
          .select()
          .from(characters)
          .where(and(...conditions));
      },
    }),

    /** List raids newest-first with optional zone, date, and scored filters */
    raids: t.field({
      type: [RaidRef],
      args: {
        zones: t.arg({ type: [RaidZoneEnum], required: false }),
        from: t.arg.string({ required: false }),
        to: t.arg.string({ required: false }),
        limit: t.arg.int({ defaultValue: 50 }),
        offset: t.arg.int({ defaultValue: 0 }),
        scored: t.arg.boolean({ required: false }),
      },
      resolve: async (_root, args, ctx) => {
        requireUser(ctx);
        const conditions = [];
        if (args.zones?.length) {
          const dbZones = args.zones.map((z) => GQL_ZONE_TO_DB[z]).filter((z): z is string => !!z);
          if (dbZones.length > 0) conditions.push(inArray(raids.zone, dbZones));
        }
        if (args.from) conditions.push(gte(raids.date, args.from));
        if (args.to) conditions.push(lte(raids.date, args.to));
        if (args.scored === true) conditions.push(gt(raids.attendanceWeight, 0));
        return ctx.db
          .select()
          .from(raids)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(raids.date))
          .limit(args.limit ?? 50)
          .offset(args.offset ?? 0);
      },
    }),
  }),
});

export const schema = builder.toSchema();
