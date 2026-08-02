import { NextResponse } from "next/server";
import {
  UpdateBenchRequestSchema,
  firstIssueMessage,
  type UpdateBenchResult,
} from "@temple-era/contracts";
import { logger } from "~/lib/logger";
import { db } from "~/server/db";
import { users, accounts, characters } from "~/server/db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { env } from "~/env.js";
import { createDiscordRouteCaller } from "~/server/api/discord-trpc-caller";
import { getBaseUrl } from "~/lib/get-base-url";
import { compressResponse } from "~/lib/compression";
import { resolveUserAccess } from "~/server/services/access-service";
import { SCOPE } from "~/lib/scopes";

export async function POST(request: Request) {
  try {
    // 1. Verify API auth token
    const authHeader = request.headers.get("authorization");

    if (!env.TEMPLE_WEB_API_TOKEN) {
      logger.error("TEMPLE_WEB_API_TOKEN environment variable not set");
      const response = await compressResponse({ error: "Server configuration error" }, request);
      return new NextResponse(response.body, {
        status: 500,
        headers: response.headers,
      });
    }

    if (authHeader !== `Bearer ${env.TEMPLE_WEB_API_TOKEN}`) {
      logger.error(
        {
          ip: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
          timestamp: new Date().toISOString(),
        },
        "Unauthorized API access attempt",
      );
      const response = await compressResponse({ error: "Unauthorized" }, request);
      return new NextResponse(response.body, {
        status: 401,
        headers: response.headers,
      });
    }

    // 2. Validate request body
    const parsed = UpdateBenchRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      const response = await compressResponse({ error: firstIssueMessage(parsed.error) }, request);
      return new NextResponse(response.body, {
        status: 400,
        headers: response.headers,
      });
    }
    const { discordUserId, raidId, characterNames } = parsed.data;

    // 3. Fetch user data for session
    const userResult = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        isRaidManager: users.isRaidManager,
        isAdmin: users.isAdmin,
        characterId: users.characterId,
      })
      .from(users)
      .innerJoin(accounts, eq(users.id, accounts.userId))
      .where(and(eq(accounts.provider, "discord"), eq(accounts.providerAccountId, discordUserId)))
      .limit(1);

    if (userResult.length === 0) {
      return await compressResponse(
        {
          success: false,
          error: "User not found or not linked to Discord account",
        },
        request,
      );
    }

    const user = userResult[0];
    if (!user) {
      return await compressResponse(
        {
          success: false,
          error: "User not found",
        },
        request,
      );
    }

    const access = await resolveUserAccess(user.id);

    if (!access.scopes.includes(SCOPE.RAIDLOG_MANAGE)) {
      return await compressResponse(
        {
          success: false,
          error: "User does not have raid manager permissions",
        },
        request,
      );
    }

    // 4. Match character names using accent-insensitive search
    const matchedCharacters = await db
      .select({
        characterId: characters.characterId,
        name: characters.name,
        class: characters.class,
        server: characters.server,
      })
      .from(characters)
      .where(
        or(
          ...characterNames.map(
            (name) => sql`LOWER(f_unaccent(${characters.name})) = LOWER(f_unaccent(${name}))`,
          ),
        ),
      );

    const matchedCharacterIds = matchedCharacters.map((c) => c.characterId);

    // Helper function to normalize strings (remove accents and lowercase)
    const normalizeString = (str: string): string => {
      return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    };

    // Create a set of normalized matched names for efficient lookup
    const normalizedMatchedNames = new Set(matchedCharacters.map((c) => normalizeString(c.name)));

    // Find unmatched names using the same normalization
    const unmatchedNames = characterNames.filter(
      (name) => !normalizedMatchedNames.has(normalizeString(name)),
    );

    // 5. Create tRPC caller with user session
    // Spread `access` so the synthetic session carries resolved scopes — the inner tRPC
    // procedures are scopedProcedure-gated and would reject a session with an empty scope list.
    const caller = createDiscordRouteCaller({ ...user, ...access });

    // 6. Get raid details for response
    const raidDetails = await caller.raid.getRaidById(raidId);

    // `getRaidById` types raidId as optional, and the bot renders it into its reply. Guard
    // rather than emit a response the contract cannot describe (previously this produced
    // "Bench updated for undefined (#undefined)" in Discord).
    if (!raidDetails?.raidId) {
      const notFound: UpdateBenchResult = {
        success: false,
        error: "Associated raid not found",
      };
      return await compressResponse(notFound, request);
    }

    // 7. Add characters to bench using tRPC mutation
    const benchResult = await caller.raid.addBenchCharacters({
      raidId,
      characterIds: matchedCharacterIds,
    });

    const payload: UpdateBenchResult = {
      success: true,
      raidId: raidDetails.raidId,
      raidName: raidDetails.name,
      raidUrl: `${getBaseUrl(request)}/raids/${raidDetails.raidId}`,
      matchedCharacters: matchedCharacters,
      unmatchedNames,
      totalBenchCharacters: benchResult.length,
    };
    return await compressResponse(payload, request);
  } catch (error) {
    logger.error({ err: error }, "Error updating bench");
    const response = await compressResponse(
      { success: false, error: "Internal server error" },
      request,
    );
    return new NextResponse(response.body, {
      status: 500,
      headers: response.headers,
    });
  }
}
