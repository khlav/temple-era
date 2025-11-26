import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { users, accounts, characters } from "~/server/db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { env } from "~/env.js";
import { createCaller } from "~/server/api/root";
import { getBaseUrl } from "~/lib/get-base-url";
import { compressResponse } from "~/lib/compression";

export async function POST(request: Request) {
  try {
    // 1. Verify API auth token
    const authHeader = request.headers.get("authorization");

    if (!env.TEMPLE_WEB_API_TOKEN) {
      console.error("TEMPLE_WEB_API_TOKEN environment variable not set");
      const response = await compressResponse(
        { error: "Server configuration error" },
        request,
      );
      return new NextResponse(response.body, {
        status: 500,
        headers: response.headers,
      });
    }

    if (authHeader !== `Bearer ${env.TEMPLE_WEB_API_TOKEN}`) {
      console.error("Unauthorized API access attempt", {
        ip: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
        timestamp: new Date().toISOString(),
      });
      const response = await compressResponse(
        { error: "Unauthorized" },
        request,
      );
      return new NextResponse(response.body, {
        status: 401,
        headers: response.headers,
      });
    }

    // 2. Validate request body
    const { discordUserId, raidId, characterNames } = await request.json();

    if (!/^\d{17,19}$/.test(discordUserId)) {
      const response = await compressResponse(
        { error: "Invalid Discord user ID" },
        request,
      );
      return new NextResponse(response.body, {
        status: 400,
        headers: response.headers,
      });
    }

    if (!raidId || typeof raidId !== "number") {
      const response = await compressResponse(
        { error: "Invalid raid ID" },
        request,
      );
      return new NextResponse(response.body, {
        status: 400,
        headers: response.headers,
      });
    }

    if (!Array.isArray(characterNames) || characterNames.length === 0) {
      const response = await compressResponse(
        { error: "Character names array is required" },
        request,
      );
      return new NextResponse(response.body, {
        status: 400,
        headers: response.headers,
      });
    }

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
      .where(
        and(
          eq(accounts.provider, "discord"),
          eq(accounts.providerAccountId, discordUserId),
        ),
      )
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

    if (!user.isRaidManager) {
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
            (name) =>
              sql`LOWER(f_unaccent(${characters.name})) = LOWER(f_unaccent(${name}))`,
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
    const normalizedMatchedNames = new Set(
      matchedCharacters.map((c) => normalizeString(c.name)),
    );

    // Find unmatched names using the same normalization
    const unmatchedNames = characterNames.filter(
      (name) => !normalizedMatchedNames.has(normalizeString(name)),
    );

    // 5. Create tRPC caller with user session
    const caller = createCaller({
      db,
      headers: new Headers(),
      session: {
        user: {
          id: user.id,
          name: user.name ?? "",
          email: user.email ?? "",
          image: user.image ?? "",
          isRaidManager: user.isRaidManager ?? false,
          isAdmin: user.isAdmin ?? false,
          characterId: user.characterId ?? 0,
        },
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      },
    });

    // 6. Get raid details for response
    const raidDetails = await caller.raid.getRaidById(raidId);

    // 7. Add characters to bench using tRPC mutation
    const benchResult = await caller.raid.addBenchCharacters({
      raidId,
      characterIds: matchedCharacterIds,
    });

    return await compressResponse(
      {
        success: true,
        raidId: raidDetails.raidId,
        raidName: raidDetails.name,
        raidUrl: `${getBaseUrl(request)}/raids/${raidDetails.raidId}`,
        matchedCharacters: matchedCharacters,
        unmatchedNames,
        totalBenchCharacters: benchResult.length,
      },
      request,
    );
  } catch (error) {
    console.error("Error updating bench:", error);
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
