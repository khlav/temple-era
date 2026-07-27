import { type NextRequest, NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { getRaidMetadataWithStats, generateRaidMetadata } from "~/server/metadata-helpers";
import { auth } from "~/server/auth";
import { SCOPE } from "~/lib/scopes";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ raidId: string }> },
) {
  // Check authentication and admin privileges
  const session = await auth();
  if (!session?.user?.scopes?.includes(SCOPE.USERPERMISSIONS_MANAGE)) {
    return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
  }

  const { raidId } = await params;
  const raidIdNum = parseInt(raidId);

  try {
    const raidData = await getRaidMetadataWithStats(raidIdNum);

    if (!raidData) {
      return NextResponse.json({ error: "Raid not found" }, { status: 404 });
    }

    const metadata = generateRaidMetadata(raidData, raidIdNum);

    return NextResponse.json({
      type: "raid",
      data: raidData,
      metadata,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching raid metadata");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
