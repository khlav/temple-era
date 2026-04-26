import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";
import { eq } from "drizzle-orm";

type ValidateApiTokenResult =
  | {
      user: {
        id: string;
        name: string | null;
        image: string | null;
        isRaidManager: boolean | null;
        isAdmin: boolean | null;
        characterId: number | null;
      };
    }
  | { error: NextResponse };

export async function validateApiToken(
  request: Request,
): Promise<ValidateApiTokenResult> {
  const authHeader = request.headers.get("authorization");

  // Check for missing Authorization header
  if (!authHeader) {
    console.warn("Unauthorized API access attempt (missing header)", {
      ip: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
      timestamp: new Date().toISOString(),
    });
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Check for Bearer prefix
  if (!authHeader.startsWith("Bearer ")) {
    console.warn("Unauthorized API access attempt (invalid format)", {
      ip: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
      timestamp: new Date().toISOString(),
    });
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Extract token
  const token = authHeader.slice(7).trim(); // Remove "Bearer " prefix

  // Reject empty token
  if (!token) {
    console.warn("Unauthorized API access attempt - empty token", {
      ip: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
      timestamp: new Date().toISOString(),
    });
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Hash the token before querying
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Query for user with matching token hash
  const result = await db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      isRaidManager: users.isRaidManager,
      isAdmin: users.isAdmin,
      characterId: users.characterId,
    })
    .from(users)
    .where(eq(users.apiToken, tokenHash))
    .limit(1);

  // Token not found
  if (result.length === 0) {
    console.warn("Unauthorized API access attempt (token not found)", {
      ip: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
      timestamp: new Date().toISOString(),
    });
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    user: result[0]!,
  };
}
