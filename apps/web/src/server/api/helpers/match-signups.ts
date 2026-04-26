import { eq, inArray, and, isNotNull } from "drizzle-orm";
import { characters, users, accounts } from "~/server/db/schema";
import { type db as database } from "~/server/db";

// ─── Constants ────────────────────────────────────────────────────────────────

const WOW_CLASSES = new Set([
  "druid",
  "hunter",
  "mage",
  "paladin",
  "priest",
  "rogue",
  "shaman",
  "warlock",
  "warrior",
]);

const SKIP_CLASS_NAMES = new Set([
  "bench",
  "tentative",
  "absent",
  "absence",
  "late",
]);

const TANK_SPEC_TO_CLASS: Record<string, string> = {
  guardian: "Druid",
  protection: "Warrior",
};

const LOW_SIGNAL_SIGNUP_TOKENS = new Set([
  "all",
  "alt",
  "alts",
  "bench",
  "forms",
  "late",
  "tentative",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchStatus = "matched" | "ambiguous" | "unmatched" | "skipped";

export interface MatchedCharacter {
  characterId: number;
  characterName: string;
  characterServer: string;
  characterClass: string;
  primaryCharacterId: number | null;
  primaryCharacterName: string | null;
}

export interface SignupMatchResult {
  userId: string;
  discordName: string;
  className: string;
  specName: string;
  partyId: number | null;
  slotId: number | null;
  status: MatchStatus;
  matchSource?:
    | "saved_override"
    | "discord_link"
    | "token_exact"
    | "token_prefix"
    | "token_substring"
    | "manual_review"
    | "skipped";
  confidence?: number;
  explanation?: string;
  needsManagerReview?: boolean;
  matchedPrimaryCharacterId?: number | null;
  matchedPrimaryCharacterName?: string | null;
  matchedCharacter?: MatchedCharacter;
  candidates?: MatchedCharacter[];
}

export type MatchSource = NonNullable<SignupMatchResult["matchSource"]>;

type CharacterMatch = {
  characterId: number;
  name: string;
  server: string;
  class: string;
  primaryCharacterId: number | null;
};

type LinkedDiscordFamily = {
  discordUserId: string;
  familyId: number;
  anchorCharacterId: number;
  anchorCharacterName: string;
};

export type SignupInput = {
  userId: string;
  discordName: string;
  className: string;
  specName?: string;
  partyId?: number | null;
  slotId?: number | null;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function resolveClassName(
  className: string,
  specName?: string,
): string | null {
  const lc = className.toLowerCase();
  if (SKIP_CLASS_NAMES.has(lc)) return null;
  if (WOW_CLASSES.has(lc)) return lc.charAt(0).toUpperCase() + lc.slice(1);
  if (lc === "tank" && specName)
    return TANK_SPEC_TO_CLASS[specName.toLowerCase()] ?? null;
  return null;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function extractNormalizedTokens(name: string): string[] {
  const matches = name.match(/\p{L}{3,}/gu) ?? [];
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const normalized = normalizeName(match);
    if (
      normalized.length < 3 ||
      LOW_SIGNAL_SIGNUP_TOKENS.has(normalized) ||
      seen.has(normalized)
    )
      continue;
    seen.add(normalized);
    tokens.push(normalized);
  }
  return tokens;
}

function getEffectivePrimaryId(character: CharacterMatch): number {
  return character.primaryCharacterId ?? character.characterId;
}

function toMatchedCharacter(
  character: CharacterMatch,
  primaryCharacter: CharacterMatch | undefined,
): MatchedCharacter {
  return {
    characterId: character.characterId,
    characterName: character.name,
    characterServer: character.server,
    characterClass: character.class,
    primaryCharacterId: character.primaryCharacterId,
    primaryCharacterName: primaryCharacter?.name ?? null,
  };
}

function getOverrideMatches(): Map<string, number> {
  return new Map();
}

function chooseFamilyCharacterByClass(
  family: CharacterMatch[],
  resolvedClass: string | null,
): {
  type: "matched" | "ambiguous" | "missing_class_match";
  matches: CharacterMatch[];
} {
  if (!resolvedClass) return { type: "missing_class_match", matches: [] };
  const classMatches = family.filter(
    (m) => m.class.toLowerCase() === resolvedClass.toLowerCase(),
  );
  if (classMatches.length === 1)
    return { type: "matched", matches: classMatches };
  if (classMatches.length > 1)
    return { type: "ambiguous", matches: classMatches };
  return { type: "missing_class_match", matches: [] };
}

function compareFamilyScores(
  a: { score: number; familyId: number },
  b: { score: number; familyId: number },
): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.familyId - b.familyId;
}

// ─── Main matching function ───────────────────────────────────────────────────

type DbClient = Pick<typeof database, "select">;

export async function matchSignupsToCharacters(
  db: DbClient,
  signups: SignupInput[],
): Promise<SignupMatchResult[]> {
  const signupsWithResolved = signups.map((signup) => {
    const cleanedSpecName = signup.specName?.replace(/[0-9]/g, "") ?? "";
    return {
      ...signup,
      specName: cleanedSpecName,
      resolvedClass: resolveClassName(signup.className, cleanedSpecName),
      normalizedDiscordName: normalizeName(signup.discordName),
      tokens: extractNormalizedTokens(signup.discordName),
    };
  });

  const allCharacters = await db
    .select({
      characterId: characters.characterId,
      name: characters.name,
      server: characters.server,
      class: characters.class,
      primaryCharacterId: characters.primaryCharacterId,
    })
    .from(characters)
    .where(eq(characters.isIgnored, false));

  const allCharactersById = new Map(
    allCharacters.map((c) => [c.characterId, c]),
  );
  const familyMap = new Map<number, CharacterMatch[]>();
  const normalizedNameMap = new Map<number, string>();

  for (const character of allCharacters) {
    const familyId = getEffectivePrimaryId(character);
    normalizedNameMap.set(character.characterId, normalizeName(character.name));
    if (!familyMap.has(familyId)) familyMap.set(familyId, []);
    familyMap.get(familyId)!.push(character);
  }

  const userIds = [
    ...new Set(signupsWithResolved.map((s) => s.userId).filter(Boolean)),
  ];

  const linkedDiscordRows =
    userIds.length === 0
      ? []
      : await db
          .select({
            discordUserId: accounts.providerAccountId,
            characterId: users.characterId,
            anchorCharacterId: characters.characterId,
            anchorCharacterName: characters.name,
            primaryCharacterId: characters.primaryCharacterId,
          })
          .from(accounts)
          .innerJoin(users, eq(accounts.userId, users.id))
          .leftJoin(characters, eq(users.characterId, characters.characterId))
          .where(
            and(
              eq(accounts.provider, "discord"),
              inArray(accounts.providerAccountId, userIds),
              isNotNull(users.characterId),
            ),
          );

  const linkedFamiliesByUserId = new Map<string, LinkedDiscordFamily[]>();
  for (const row of linkedDiscordRows) {
    if (!row.characterId || !row.anchorCharacterId || !row.anchorCharacterName)
      continue;
    const anchorCharacter =
      allCharactersById.get(row.anchorCharacterId) ??
      allCharactersById.get(row.characterId);
    if (!anchorCharacter) continue;
    const familyId = getEffectivePrimaryId(anchorCharacter);
    if (!linkedFamiliesByUserId.has(row.discordUserId))
      linkedFamiliesByUserId.set(row.discordUserId, []);
    const existing = linkedFamiliesByUserId.get(row.discordUserId)!;
    if (!existing.some((f) => f.familyId === familyId)) {
      existing.push({
        discordUserId: row.discordUserId,
        familyId,
        anchorCharacterId: anchorCharacter.characterId,
        anchorCharacterName: anchorCharacter.name,
      });
    }
  }

  const overrideMatches = getOverrideMatches();
  const results: SignupMatchResult[] = [];

  for (const signup of signupsWithResolved) {
    const baseResult = {
      userId: signup.userId,
      discordName: signup.discordName,
      className: signup.className,
      specName: signup.specName,
      partyId: signup.partyId ?? null,
      slotId: signup.slotId ?? null,
    };

    const overrideFamilyId = overrideMatches.get(
      `${signup.userId}:${signup.normalizedDiscordName}`,
    );

    const resolveFamily = (
      familyId: number,
      source: MatchSource,
      confidence: number,
      explanation: string,
    ): SignupMatchResult => {
      const family = familyMap.get(familyId) ?? [];
      const primaryCharacter = allCharactersById.get(familyId);

      if (!signup.resolvedClass) {
        if (primaryCharacter) {
          return {
            ...baseResult,
            status: "skipped",
            matchSource: source === "saved_override" ? source : "skipped",
            confidence,
            explanation,
            needsManagerReview: false,
            matchedPrimaryCharacterId: primaryCharacter.characterId,
            matchedPrimaryCharacterName: primaryCharacter.name,
            matchedCharacter: toMatchedCharacter(
              primaryCharacter,
              primaryCharacter,
            ),
          };
        }
        return {
          ...baseResult,
          status: "skipped",
          matchSource: "skipped",
          confidence,
          explanation,
          needsManagerReview: false,
        };
      }

      const familyChoice = chooseFamilyCharacterByClass(
        family,
        signup.resolvedClass,
      );

      if (familyChoice.type === "matched") {
        const selected = familyChoice.matches[0]!;
        return {
          ...baseResult,
          status: "matched",
          matchSource: source,
          confidence,
          explanation,
          needsManagerReview: false,
          matchedPrimaryCharacterId: familyId,
          matchedPrimaryCharacterName: primaryCharacter?.name ?? null,
          matchedCharacter: toMatchedCharacter(selected, primaryCharacter),
        };
      }

      if (familyChoice.type === "ambiguous") {
        return {
          ...baseResult,
          status: "ambiguous",
          matchSource: source,
          confidence,
          explanation: `${explanation} Family found, but ${familyChoice.matches.length} ${signup.resolvedClass} characters remain.`,
          needsManagerReview: true,
          matchedPrimaryCharacterId: familyId,
          matchedPrimaryCharacterName: primaryCharacter?.name ?? null,
          candidates: familyChoice.matches.map((m) =>
            toMatchedCharacter(m, primaryCharacter),
          ),
        };
      }

      return {
        ...baseResult,
        status: signup.resolvedClass ? "unmatched" : "skipped",
        matchSource: source,
        confidence,
        explanation: `${explanation} Family found, but no ${signup.resolvedClass} character matched.`,
        needsManagerReview: true,
        matchedPrimaryCharacterId: familyId,
        matchedPrimaryCharacterName: primaryCharacter?.name ?? null,
        candidates: family
          .slice(0, 6)
          .map((m) => toMatchedCharacter(m, primaryCharacter)),
      };
    };

    if (overrideFamilyId && familyMap.has(overrideFamilyId)) {
      results.push(
        resolveFamily(
          overrideFamilyId,
          "saved_override",
          1,
          "Saved manager override matched this signup.",
        ),
      );
      continue;
    }

    const linkedFamilies = linkedFamiliesByUserId.get(signup.userId) ?? [];
    const uniqueLinkedFamilyIds = [
      ...new Set(linkedFamilies.map((f) => f.familyId)),
    ];

    if (uniqueLinkedFamilyIds.length === 1) {
      results.push(
        resolveFamily(
          uniqueLinkedFamilyIds[0]!,
          "discord_link",
          0.99,
          "Discord account link identified this family.",
        ),
      );
      continue;
    }

    const familyScores = new Map<
      number,
      {
        score: number;
        source: MatchSource;
        exactTokens: string[];
        prefixTokens: string[];
        substringTokens: string[];
      }
    >();

    const applyScore = (
      familyId: number,
      source: MatchSource,
      score: number,
      token: string,
    ) => {
      const existing = familyScores.get(familyId) ?? {
        score: 0,
        source,
        exactTokens: [],
        prefixTokens: [],
        substringTokens: [],
      };
      existing.score += score;
      if (source === "token_exact" && !existing.exactTokens.includes(token))
        existing.exactTokens.push(token);
      if (source === "token_prefix" && !existing.prefixTokens.includes(token))
        existing.prefixTokens.push(token);
      if (
        source === "token_substring" &&
        !existing.substringTokens.includes(token)
      )
        existing.substringTokens.push(token);
      if (
        source === "token_exact" ||
        (source === "token_prefix" && existing.source !== "token_exact") ||
        (source === "token_substring" &&
          existing.source !== "token_exact" &&
          existing.source !== "token_prefix")
      ) {
        existing.source = source;
      }
      familyScores.set(familyId, existing);
    };

    for (const token of signup.tokens) {
      for (const character of allCharacters) {
        const normalizedCharacterName =
          normalizedNameMap.get(character.characterId) ?? "";
        const familyId = getEffectivePrimaryId(character);
        if (normalizedCharacterName === token) {
          applyScore(familyId, "token_exact", 120, token);
          continue;
        }
        if (normalizedCharacterName.startsWith(token)) {
          applyScore(familyId, "token_prefix", 80, token);
          continue;
        }
        if (
          token.length >= 4 &&
          normalizedCharacterName.includes(token) &&
          !signup.discordName.includes(" ")
        ) {
          applyScore(familyId, "token_substring", 30, token);
        }
      }
    }

    const rankedFamilies = Array.from(familyScores.entries())
      .map(([familyId, meta]) => ({
        familyId,
        score: meta.score,
        source: meta.source,
        meta,
      }))
      .sort(compareFamilyScores);

    if (rankedFamilies.length === 0) {
      results.push({
        ...baseResult,
        status: signup.resolvedClass ? "unmatched" : "skipped",
        matchSource: signup.resolvedClass ? "manual_review" : "skipped",
        confidence: 0,
        explanation: "No strong token or family match was found.",
        needsManagerReview: !!signup.resolvedClass,
      });
      continue;
    }

    const topFamily = rankedFamilies[0]!;
    const secondFamily = rankedFamilies[1];

    if (
      secondFamily &&
      topFamily.score - secondFamily.score < 25 &&
      topFamily.score < 150
    ) {
      const topCandidates = rankedFamilies.slice(0, 4).flatMap((entry) => {
        const family = familyMap.get(entry.familyId) ?? [];
        const primaryCharacter = allCharactersById.get(entry.familyId);
        const familyChoice = chooseFamilyCharacterByClass(
          family,
          signup.resolvedClass,
        );
        if (
          familyChoice.type === "matched" ||
          familyChoice.type === "ambiguous"
        ) {
          return familyChoice.matches.map((m) =>
            toMatchedCharacter(m, primaryCharacter),
          );
        }
        return family
          .slice(0, 2)
          .map((m) => toMatchedCharacter(m, primaryCharacter));
      });

      results.push({
        ...baseResult,
        status: signup.resolvedClass ? "ambiguous" : "skipped",
        matchSource: topFamily.source,
        confidence: topFamily.score / 200,
        explanation:
          "Multiple families scored similarly, so this signup needs manager review.",
        needsManagerReview: !!signup.resolvedClass,
        candidates: topCandidates.slice(0, 6),
      });
      continue;
    }

    const explanationParts: string[] = [];
    if (topFamily.meta.exactTokens.length > 0) {
      explanationParts.push(
        `Exact token ${topFamily.meta.exactTokens.map((t) => `'${t}'`).join(", ")} identified this family.`,
      );
    } else if (topFamily.meta.prefixTokens.length > 0) {
      explanationParts.push(
        `Prefix token ${topFamily.meta.prefixTokens.map((t) => `'${t}'`).join(", ")} identified this family.`,
      );
    } else if (topFamily.meta.substringTokens.length > 0) {
      explanationParts.push(
        `Substring token ${topFamily.meta.substringTokens.map((t) => `'${t}'`).join(", ")} identified this family.`,
      );
    }

    const confidence =
      topFamily.source === "token_exact"
        ? 0.92
        : topFamily.source === "token_prefix"
          ? 0.78
          : 0.62;

    results.push(
      resolveFamily(
        topFamily.familyId,
        topFamily.source,
        confidence,
        explanationParts[0] ??
          "Name tokens identified a likely family for this signup.",
      ),
    );
  }

  return results;
}
