import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { characters } from "~/server/db/schema";
import { eq, and, sql } from "drizzle-orm";

const MAX_NAMES = 100;

function normalizeForMatch(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;

    const { searchParams } = new URL(request.url);
    const namesParam = searchParams.get("names") ?? "";

    if (!namesParam) {
      return NextResponse.json({ error: "names parameter is required" }, { status: 400 });
    }

    const names = namesParam
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, MAX_NAMES);

    if (names.length === 0) {
      return NextResponse.json([]);
    }

    const normalizedNames = names.map(normalizeForMatch);
    const nameList = sql.join(
      normalizedNames.map((n) => sql`${n}`),
      sql`, `,
    );

    const result = await db
      .select({
        characterId: characters.characterId,
        name: characters.name,
        class: characters.class,
        server: characters.server,
      })
      .from(characters)
      .where(
        and(
          eq(characters.isIgnored, false),
          sql`public.f_unaccent(lower(${characters.name})) = ANY(ARRAY[${nameList}])`,
        ),
      )
      .orderBy(characters.name);

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
