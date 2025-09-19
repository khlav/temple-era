import { type NextRequest, NextResponse } from "next/server";
import {
  getRaidMetadataWithStats,
  generateRaidMetadata,
} from "~/server/metadata-helpers";
import { auth } from "~/server/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ raidId: string }> },
) {
  // Check authentication and admin privileges
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
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
    console.error("Error fetching raid metadata:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
