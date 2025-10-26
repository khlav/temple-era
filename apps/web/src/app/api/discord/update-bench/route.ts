import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { users, accounts, characters } from "~/server/db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { env } from "~/env.js";
import { createCaller } from "~/server/api/root";
import { getBaseUrl } from "~/lib/get-base-url";

export async function POST(request: Request) {
  try {
    // 1. Verify API auth token
    const authHeader = request.headers.get("authorization");

    if (!env.TEMPLE_WEB_API_TOKEN) {
      console.error("TEMPLE_WEB_API_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    if (authHeader !== `Bearer ${env.TEMPLE_WEB_API_TOKEN}`) {
      console.error("Unauthorized API access attempt", {
        ip: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Validate request body
    const { discordUserId, raidId, characterNames } = await request.json();

    if (!/^\d{17,19}$/.test(discordUserId)) {
      return NextResponse.json(
        { error: "Invalid Discord user ID" },
        { status: 400 },
      );
    }

    if (!raidId || typeof raidId !== "number") {
      return NextResponse.json({ error: "Invalid raid ID" }, { status: 400 });
    }

    if (!Array.isArray(characterNames) || characterNames.length === 0) {
      return NextResponse.json(
        { error: "Character names array is required" },
        { status: 400 },
      );
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
      return NextResponse.json({
        success: false,
        error: "User not found or not linked to Discord account",
      });
    }

    const user = userResult[0];
    if (!user) {
      return NextResponse.json({
        success: false,
        error: "User not found",
      });
    }

    if (!user.isRaidManager) {
      return NextResponse.json({
        success: false,
        error: "User does not have raid manager permissions",
      });
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

    return NextResponse.json({
      success: true,
      raidId: raidDetails.raidId,
      raidName: raidDetails.name,
      raidUrl: `${getBaseUrl(request)}/raids/${raidDetails.raidId}`,
      matchedCharacters: matchedCharacters,
      unmatchedNames,
      totalBenchCharacters: benchResult.length,
    });
  } catch (error) {
    console.error("Error updating bench:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
