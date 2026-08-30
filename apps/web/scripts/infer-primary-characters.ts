// One-off, report-only script: for site users who have logged in but never picked a
// primary character (auth_user.character_id IS NULL), suggest a likely primary
// character from two independent signals:
//   1. their current Discord server nickname (display name in this guild), matched
//      against the character roster by exact/tokenized name
//   2. their historical Raid Helper signups (raid_helper_signup_snapshot), which carry
//      a real class per entry — run through the same matchSignupsToCharacters() the
//      Raid Planner signup-linking flow uses, so class disambiguates within a family
//
// Prints candidates where at least one signal produced a single, unambiguous family.
// Defaults to report-only — pass --apply to actually set users.character_id for every
// printed suggestion (guarded by "still NULL" at write time, so a second run is a no-op
// for anyone already linked in the meantime).
//
// Targets DEV by default. Pass --prod to run against production instead:
//   doppler run --config dev -- npx tsx apps/web/scripts/infer-primary-characters.ts
//   doppler run --config dev -- npx tsx apps/web/scripts/infer-primary-characters.ts --prod
//   doppler run --config dev -- npx tsx apps/web/scripts/infer-primary-characters.ts --prod --apply
// (both modes run under the same `doppler run --config dev`, since DATABASE_PROD_URL —
// like scripts/db/clone-prod.sh uses — only lives in the dev Doppler config)

import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { db as devDb } from "~/server/db";
import * as schema from "~/server/db/schema";
import { accounts, raidHelperSignupSnapshots, users } from "~/server/db/schema";
import { env } from "~/env.js";
import {
  extractNormalizedTokens,
  fetchCharacterRosterForMatching,
  matchSignupsToCharacters,
  normalizeName,
  type CharacterRosterEntry,
  type SignupInput,
} from "~/server/api/helpers/match-signups";

const targetsProd = process.argv.includes("--prod");
const shouldApply = process.argv.includes("--apply");

function resolveDb() {
  if (!targetsProd) return devDb;

  // DATABASE_PROD_URL isn't part of the T3/Zod-validated env — same as
  // scripts/db/clone-prod.sh, it's read raw and only ever present in the `dev` Doppler
  // config (used deliberately for read-only prod inspection, never for writes here).
  const prodUrl = process.env.DATABASE_PROD_URL;
  if (!prodUrl) {
    throw new Error(
      "--prod requires DATABASE_PROD_URL — run under `doppler run --config dev`, the only config that carries it.",
    );
  }
  const conn = postgres(prodUrl, { prepare: false, max: 5, connect_timeout: 10 });
  return drizzle(conn, { schema });
}

interface DiscordGuildMemberFull {
  user: { id: string; username: string; global_name?: string | null };
  nick?: string | null;
}

async function fetchGuildMembersWithNick(): Promise<DiscordGuildMemberFull[]> {
  const members: DiscordGuildMemberFull[] = [];
  let after: string | undefined;

  for (;;) {
    const url = new URL(`https://discord.com/api/v10/guilds/${env.DISCORD_SERVER_ID}/members`);
    url.searchParams.set("limit", "1000");
    if (after) url.searchParams.set("after", after);

    const response = await fetch(url, {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    });
    if (!response.ok) {
      throw new Error(
        `Discord API error fetching guild members: ${response.status} ${response.statusText}`,
      );
    }

    const page: DiscordGuildMemberFull[] = await response.json();
    members.push(...page);
    if (page.length < 1000) break;
    const last = page[page.length - 1];
    if (!last) break;
    after = last.user.id;
  }

  return members;
}

function displayNameFor(member: DiscordGuildMemberFull): string {
  return member.nick?.trim() || member.user.global_name?.trim() || member.user.username;
}

async function main() {
  const db = resolveDb();
  console.log(
    `Target: ${targetsProd ? "PROD" : "dev"} (${shouldApply ? "WILL WRITE users.character_id" : "read-only"})\n`,
  );

  const candidates = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      discordUserId: accounts.providerAccountId,
    })
    .from(users)
    .innerJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.provider, "discord")))
    .where(isNull(users.characterId));

  console.log(`Found ${candidates.length} logged-in users with no primary character selected.`);

  const members = await fetchGuildMembersWithNick();
  const memberByDiscordId = new Map(members.map((m) => [m.user.id, m]));
  console.log(`Fetched ${members.length} current Discord guild members.`);

  const snapshotRows = await db
    .select({
      signups: raidHelperSignupSnapshots.signups,
    })
    .from(raidHelperSignupSnapshots);

  const candidateDiscordIds = new Set(candidates.map((c) => c.discordUserId));
  const signupInputs: SignupInput[] = [];
  const seenSignupKey = new Set<string>();
  for (const row of snapshotRows) {
    for (const entry of row.signups) {
      if (!candidateDiscordIds.has(entry.userId)) continue;
      const key = `${entry.userId}:${normalizeName(entry.name)}:${entry.className}:${entry.specName}`;
      if (seenSignupKey.has(key)) continue;
      seenSignupKey.add(key);
      signupInputs.push({
        userId: entry.userId,
        discordName: entry.name,
        className: entry.className,
        specName: entry.specName,
      });
    }
  }
  console.log(`Found ${signupInputs.length} distinct historical signups for these users.`);

  const roster = await fetchCharacterRosterForMatching(db);
  const signupMatchResults = await matchSignupsToCharacters(db, signupInputs, roster);

  const signupFamilyVotesByDiscordId = new Map<string, Map<number, number>>();
  for (const result of signupMatchResults) {
    if (result.status !== "matched" || result.matchedPrimaryCharacterId == null) continue;
    const votes = signupFamilyVotesByDiscordId.get(result.userId) ?? new Map<number, number>();
    votes.set(
      result.matchedPrimaryCharacterId,
      (votes.get(result.matchedPrimaryCharacterId) ?? 0) + 1,
    );
    signupFamilyVotesByDiscordId.set(result.userId, votes);
  }

  const normalizedNameToCharacters = new Map<string, CharacterRosterEntry[]>();
  for (const c of roster) {
    const key = normalizeName(c.name);
    const list = normalizedNameToCharacters.get(key) ?? [];
    list.push(c);
    normalizedNameToCharacters.set(key, list);
  }
  const charactersById = new Map(roster.map((c) => [c.characterId, c]));

  interface Outcome {
    siteUserId: string;
    discordUserId: string;
    siteUserName: string | null;
    siteUserEmail: string | null;
    displayName: string | null;
    nicknameMatch: { familyId: number; name: string } | null;
    signupMatch: { familyId: number; name: string; votes: number } | null;
  }

  const outcomes: Outcome[] = [];

  for (const candidate of candidates) {
    const member = memberByDiscordId.get(candidate.discordUserId);
    const displayName = member ? displayNameFor(member) : null;

    let nicknameMatch: Outcome["nicknameMatch"] = null;
    if (displayName) {
      const exact = normalizedNameToCharacters.get(normalizeName(displayName));
      if (exact && exact.length === 1) {
        const c = exact[0]!;
        const familyId = c.primaryCharacterId ?? c.characterId;
        const anchor = charactersById.get(familyId) ?? c;
        nicknameMatch = { familyId, name: anchor.name };
      } else {
        const tokens = extractNormalizedTokens(displayName);
        const tokenFamilies = new Set<number>();
        for (const token of tokens) {
          const found = normalizedNameToCharacters.get(token);
          if (found)
            for (const c of found) tokenFamilies.add(c.primaryCharacterId ?? c.characterId);
        }
        if (tokenFamilies.size === 1) {
          const familyId = [...tokenFamilies][0]!;
          const anchor = charactersById.get(familyId);
          if (anchor) nicknameMatch = { familyId, name: anchor.name };
        }
      }
    }

    let signupMatch: Outcome["signupMatch"] = null;
    const votes = signupFamilyVotesByDiscordId.get(candidate.discordUserId);
    if (votes && votes.size === 1) {
      const [familyId, count] = [...votes.entries()][0]!;
      const anchor = charactersById.get(familyId);
      if (anchor) signupMatch = { familyId, name: anchor.name, votes: count };
    }

    if (!nicknameMatch && !signupMatch) continue;

    outcomes.push({
      siteUserId: candidate.userId,
      discordUserId: candidate.discordUserId,
      siteUserName: candidate.name,
      siteUserEmail: candidate.email,
      displayName,
      nicknameMatch,
      signupMatch,
    });
  }

  function agreementFor(o: Outcome): boolean {
    return (
      !!o.nicknameMatch && !!o.signupMatch && o.nicknameMatch.familyId === o.signupMatch.familyId
    );
  }

  // Both signals present but pointing at different families — neither is more trustworthy than
  // the other, so this needs a human call rather than the apply loop silently picking one.
  function isConflict(o: Outcome): boolean {
    return !!o.nicknameMatch && !!o.signupMatch && !agreementFor(o);
  }

  function suggestionFor(o: Outcome): { name: string; familyId: number } {
    const agree = agreementFor(o);
    const name = agree ? o.nicknameMatch!.name : (o.signupMatch?.name ?? o.nicknameMatch?.name)!;
    const familyId = agree
      ? o.nicknameMatch!.familyId
      : (o.signupMatch?.familyId ?? o.nicknameMatch?.familyId)!;
    return { name, familyId };
  }

  console.log(
    `\n${outcomes.length} of ${candidates.length} unlinked users have a potential match:\n`,
  );

  for (const o of outcomes) {
    const agree = agreementFor(o);
    const { name: suggestion, familyId: suggestedFamilyId } = suggestionFor(o);
    console.log(
      `- ${o.siteUserName ?? "(no name)"} <${o.siteUserEmail ?? "no email"}> [discord:${o.discordUserId}]\n` +
        `    Discord nickname: ${o.displayName ? `"${o.displayName}"` : "(not currently in Discord server)"}\n` +
        `    Nickname match:   ${o.nicknameMatch ? `${o.nicknameMatch.name} (family ${o.nicknameMatch.familyId})` : "-"}\n` +
        `    Signup match:     ${o.signupMatch ? `${o.signupMatch.name} (family ${o.signupMatch.familyId}, ${o.signupMatch.votes} matched signup${o.signupMatch.votes === 1 ? "" : "s"})` : "-"}\n` +
        `    => Suggested primary: ${suggestion} (family ${suggestedFamilyId})${agree ? " — both signals agree" : ""}${isConflict(o) ? " — CONFLICT, needs a human call, will be SKIPPED by --apply" : ""}\n`,
    );
  }

  if (!shouldApply) {
    console.log("Report-only run (no --apply passed) — no database writes made.");
    return;
  }

  const conflicts = outcomes.filter(isConflict);
  const applyable = outcomes.filter((o) => !isConflict(o));
  console.log(
    `\nApplying ${applyable.length} link${applyable.length === 1 ? "" : "s"}` +
      (conflicts.length
        ? ` (skipping ${conflicts.length} CONFLICT outcome${conflicts.length === 1 ? "" : "s"} — resolve those by hand)`
        : "") +
      "...\n",
  );
  let applied = 0;
  let skipped = 0;
  for (const o of applyable) {
    const { name, familyId } = suggestionFor(o);
    const updated = await db
      .update(users)
      .set({ characterId: familyId })
      .where(and(eq(users.id, o.siteUserId), isNull(users.characterId)))
      .returning({ id: users.id });
    if (updated.length > 0) {
      applied += 1;
      console.log(`  linked ${o.siteUserName ?? o.discordUserId} -> ${name} (family ${familyId})`);
    } else {
      skipped += 1;
      console.log(
        `  skipped ${o.siteUserName ?? o.discordUserId} — already linked to something since the report ran`,
      );
    }
  }
  console.log(
    `\nApplied ${applied}, skipped ${skipped} (already linked), ${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} left for manual review.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
