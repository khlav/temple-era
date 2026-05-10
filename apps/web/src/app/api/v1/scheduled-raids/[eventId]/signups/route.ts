import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { matchSignupsToCharacters } from "~/server/api/helpers/match-signups";
import { env } from "~/env";
import { db } from "~/server/db";

const RAID_HELPER_API_BASE = "https://raid-helper.xyz/api";

interface RaidHelperSignup {
  userId: string;
  name: string;
  className: string;
  specName: string;
  roleName: string;
  status: string;
}

interface RaidHelperEventResponse {
  id: string;
  startTime: number;
  signUps?: RaidHelperSignup[];
  lastEventId?: string;
}

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { eventId } = await params;
    if (!eventId || eventId.includes("/") || eventId.length > 64) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    // 1. Fetch event from Raid Helper, resolve recurring events via lastEventId
    const initialRes = await fetch(`${RAID_HELPER_API_BASE}/v4/events/${eventId}`, {
      headers: { Authorization: env.RAID_HELPER_API_KEY },
    });

    if (initialRes.status === 404) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (!initialRes.ok) {
      return NextResponse.json({ error: "Raid Helper API unavailable" }, { status: 502 });
    }

    const initialData = (await initialRes.json()) as Record<string, unknown>;

    const actualEventId =
      !initialData.signUps && initialData.lastEventId
        ? (initialData.lastEventId as string)
        : eventId;

    let eventData: RaidHelperEventResponse;
    if (actualEventId !== eventId) {
      const resolvedRes = await fetch(`${RAID_HELPER_API_BASE}/v4/events/${actualEventId}`, {
        headers: { Authorization: env.RAID_HELPER_API_KEY },
      });
      if (!resolvedRes.ok) {
        return NextResponse.json({ error: "Raid Helper API unavailable" }, { status: 502 });
      }
      eventData = (await resolvedRes.json()) as RaidHelperEventResponse;
    } else {
      eventData = initialData as unknown as RaidHelperEventResponse;
    }

    const rawSignups: RaidHelperSignup[] = eventData.signUps ?? [];

    // 2. Match signups to DB characters
    const matchResults = await matchSignupsToCharacters(
      db,
      rawSignups.map((s) => ({
        userId: s.userId,
        discordName: s.name,
        className: s.className,
        specName: s.specName,
        partyId: null,
        slotId: null,
      })),
    );

    // 3. Assemble response — character identity only, no attendance
    //    Callers wanting ghost-likelihood should cross-reference past event signups
    //    via GET /api/v1/scheduled-raids/:pastEventId/signups, then check attendance
    //    per-character via GET /api/v1/characters/:id/attendance for the intersection.
    const rawSignupMap = new Map(rawSignups.map((s) => [s.userId, s]));

    const signups = matchResults.map((result) => {
      const raw = rawSignupMap.get(result.userId);

      const character =
        result.matchedCharacter !== undefined
          ? {
              id: result.matchedCharacter.characterId,
              name: result.matchedCharacter.characterName,
              class: result.matchedCharacter.characterClass,
              primaryCharacterId: result.matchedCharacter.primaryCharacterId,
            }
          : result.matchedPrimaryCharacterId != null
            ? {
                id: null,
                name: result.matchedPrimaryCharacterName ?? null,
                class: null,
                primaryCharacterId: result.matchedPrimaryCharacterId,
              }
            : null;

      return {
        userId: result.userId,
        discordName: result.discordName,
        className: result.className,
        specName: result.specName,
        roleName: raw?.roleName ?? "",
        status: raw?.status ?? "",
        matchStatus: result.status,
        matchConfidence: result.confidence ?? null,
        character,
      };
    });

    return NextResponse.json({
      event: {
        id: eventId,
        resolvedId: actualEventId,
        startTime: eventData.startTime,
      },
      signups,
    });
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
