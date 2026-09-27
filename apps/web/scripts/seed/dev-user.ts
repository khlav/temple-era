import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { accounts, users } from "~/server/db/schema";

/**
 * The local dev identity.
 *
 * Login stays real Discord OAuth — we only pre-create the rows the OAuth callback would otherwise
 * create, so that the account is already linked to a Discord ID that appears in
 * SUPERADMIN_DISCORD_IDS. That env list is resolved by access-service.ts and grants every scope
 * without any role/user_role rows, which is why the seed doesn't bother with those tables.
 *
 * Created before anything else so imported raids and logs can be attributed to a real
 * auth_user.id (createdBy is a nullable FK, but a real id makes the dev DB look like prod).
 */
export async function ensureDevUser(): Promise<{ userId: string; discordId: string }> {
  const discordId = (process.env.SUPERADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];

  if (!discordId) {
    throw new Error(
      [
        "SUPERADMIN_DISCORD_IDS is empty, so there is no Discord ID to attach the dev user to.",
        "Set it in the Doppler dev_personal config to your own Discord user ID — that is what",
        "grants every scope locally without seeding role/user_role rows.",
      ].join("\n"),
    );
  }

  const existing = await db.query.accounts.findFirst({
    where: (a, { and, eq: e }) => and(e(a.provider, "discord"), e(a.providerAccountId, discordId)),
    columns: { userId: true },
  });
  if (existing) return { userId: existing.userId, discordId };

  const [user] = await db
    .insert(users)
    .values({
      name: "Local Dev",
      // Deliberately no email: Discord is requested with `scope=identify` only (see
      // server/auth/config.ts), so a real login never supplies one either.
      image: null,
    })
    .returning({ id: users.id });

  const userId = user!.id;

  await db.insert(accounts).values({
    userId,
    type: "oauth",
    provider: "discord",
    providerAccountId: discordId,
  });

  return { userId, discordId };
}

/** Clears the seeded dev identity, for a full re-seed without a container reset. */
export async function deleteDevUser(discordId: string): Promise<void> {
  const account = await db.query.accounts.findFirst({
    where: (a, { and, eq: e }) => and(e(a.provider, "discord"), e(a.providerAccountId, discordId)),
    columns: { userId: true },
  });
  if (!account) return;
  await db.delete(users).where(eq(users.id, account.userId));
}
