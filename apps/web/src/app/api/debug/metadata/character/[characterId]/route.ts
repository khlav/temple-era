import { type NextRequest, NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import {
  getCharacterMetadataWithStats,
  generateCharacterMetadata,
} from "~/server/metadata-helpers";
import { auth } from "~/server/auth";
import { SCOPE } from "~/lib/scopes";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ characterId: string }> },
) {
  // Check authentication and admin privileges
  const session = await auth();
  if (!session?.user?.scopes?.includes(SCOPE.USERPERMISSIONS_MANAGE)) {
    return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
  }

  const { characterId } = await params;
  const characterIdNum = parseInt(characterId);

  try {
    const characterData = await getCharacterMetadataWithStats(characterIdNum);

    if (!characterData) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const metadata = generateCharacterMetadata(characterData, characterIdNum);

    return NextResponse.json({
      type: "character",
      data: characterData,
      metadata,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching character metadata");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
