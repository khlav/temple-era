import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  accounts,
  characters,
  raidLogAttendeeMap,
  raidLogs,
  raids,
  users,
  worldBuffAssignments,
  worldBuffCharacterStatus,
} from "~/server/db/schema";
import { getLockoutWeeks } from "~/server/api/v2/helpers/lockout-weeks";
import { WORLD_BUFF_BY_ITEM, WORLD_BUFF_ITEM_LABELS, type WorldBuffItem } from "~/lib/world-buffs";

type WorldBuffState = "ready_to_drop" | "dropped";
type WorldBuffQueueType = "main" | "alt" | "backup";

/**
 * Both `/api/v1/world-buffs/status` and the `worldBuff` tRPC router call into this module, so
 * domain errors need a shape neither framework owns. Each caller maps this to its own error
 * surface (TRPCError for the router, a status-coded NextResponse for the v1 route).
 */
export class WorldBuffServiceError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "WorldBuffServiceError";
  }
}

// Unwraps drizzle-orm's `DrizzleQueryError` to the driver's `PostgresError` underneath (attached
// as `.cause`) and returns its SQLSTATE `.code` — e.g. "23505" for a unique-constraint violation.
// Falls back to checking `error` itself, in case something throws the driver error directly.
function getPgErrorCode(error: unknown): string | undefined {
  for (const candidate of [(error as { cause?: unknown } | undefined)?.cause, error]) {
    if (candidate && typeof candidate === "object" && "code" in candidate) {
      const code = (candidate as { code?: unknown }).code;
      if (typeof code === "string") return code;
    }
  }
  return undefined;
}

// Trimmed + lowercased, matching `characterNameNormalized`'s purpose in the schema — without
// this, "Dunckan" and "dunckan " would be treated as different characters.
function normalizeCharacterName(name: string): string {
  return name.trim().toLowerCase();
}

export interface SubmitAvailabilityInput {
  characterName: string;
  /** Set when the submitter picked an existing character via the roster picker rather than
   *  typing a name — enriches the row but is never required (see world-buff-schema.ts). */
  characterId?: number | null;
  item: WorldBuffItem;
  queueType?: WorldBuffQueueType;
  notes?: string | null;
  actingUserId: string;
}

/**
 * Create-or-update on (characterName, item). Never touches `state` — a resubmission of an
 * already-`dropped` row only updates queueType/notes, it can't un-drop a lifetime completion.
 */
export async function submitAvailability(input: SubmitAvailabilityInput) {
  const characterName = input.characterName.trim();
  const characterNameNormalized = normalizeCharacterName(characterName);

  const existing = await db.query.worldBuffCharacterStatus.findFirst({
    where: and(
      eq(worldBuffCharacterStatus.characterNameNormalized, characterNameNormalized),
      eq(worldBuffCharacterStatus.item, input.item),
    ),
  });

  if (existing) {
    const [updated] = await db
      .update(worldBuffCharacterStatus)
      .set({
        characterName,
        characterId: input.characterId !== undefined ? input.characterId : existing.characterId,
        queueType: input.queueType ?? existing.queueType,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        updatedById: input.actingUserId,
      })
      .where(eq(worldBuffCharacterStatus.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(worldBuffCharacterStatus)
    .values({
      characterName,
      characterNameNormalized,
      characterId: input.characterId ?? null,
      item: input.item,
      queueType: input.queueType ?? "main",
      notes: input.notes ?? null,
      createdById: input.actingUserId,
      updatedById: input.actingUserId,
    })
    .returning();
  return created!;
}

async function getStatusOrThrow(statusId: string) {
  const status = await db.query.worldBuffCharacterStatus.findFirst({
    where: eq(worldBuffCharacterStatus.id, statusId),
  });
  if (!status) {
    throw new WorldBuffServiceError("NOT_FOUND", "World buff status row not found");
  }
  return status;
}

export interface UpdateQueueTypeInput {
  statusId: string;
  queueType: WorldBuffQueueType;
  actingUserId: string;
}

export async function updateQueueType(input: UpdateQueueTypeInput) {
  await getStatusOrThrow(input.statusId);
  const [updated] = await db
    .update(worldBuffCharacterStatus)
    .set({ queueType: input.queueType, updatedById: input.actingUserId })
    .where(eq(worldBuffCharacterStatus.id, input.statusId))
    .returning();
  return updated!;
}

export interface UpdateItemInput {
  statusId: string;
  item: WorldBuffItem;
  actingUserId: string;
}

/** Switches a row between the two turn-ins that grant the same buff (currently only Onyxia's
 *  Head <-> Nefarian's Head) — the "Switch to X" action in the row menu, for a character who
 *  turns out to be eligible for the other head instead. Restricted to same-buff swaps server-side
 *  too, not just by what the UI offers, so this can't be repurposed into a generic item reassign. */
export async function updateItem(input: UpdateItemInput) {
  const existing = await getStatusOrThrow(input.statusId);
  if (WORLD_BUFF_BY_ITEM[existing.item] !== WORLD_BUFF_BY_ITEM[input.item]) {
    throw new WorldBuffServiceError(
      "CONFLICT",
      `${WORLD_BUFF_ITEM_LABELS[input.item]} doesn't grant the same buff as ${WORLD_BUFF_ITEM_LABELS[existing.item]}.`,
    );
  }

  try {
    const [updated] = await db
      .update(worldBuffCharacterStatus)
      .set({ item: input.item, updatedById: input.actingUserId })
      .where(eq(worldBuffCharacterStatus.id, input.statusId))
      .returning();
    return updated!;
  } catch (error) {
    // Unique violation on (characterNameNormalized, item) — this character already has a row
    // for the target item. The UI is expected to disable the option in this case already; this
    // is the server-side backstop against a stale client (another tab, a race).
    if (getPgErrorCode(error) === "23505") {
      throw new WorldBuffServiceError(
        "CONFLICT",
        `${existing.characterName} already has a submission for ${WORLD_BUFF_ITEM_LABELS[input.item]}.`,
      );
    }
    throw error;
  }
}

export interface DeleteStatusInput {
  statusId: string;
}

/** Hard delete of a character×item submission. Cascades to any of its scheduled assignments
 *  via the FK's ON DELETE CASCADE — deleting the submission removes its schedule too, since
 *  a turn-in can't be scheduled for a submission that no longer exists. */
export async function deleteStatus(input: DeleteStatusInput) {
  const [deleted] = await db
    .delete(worldBuffCharacterStatus)
    .where(eq(worldBuffCharacterStatus.id, input.statusId))
    .returning({ id: worldBuffCharacterStatus.id });
  if (!deleted) {
    throw new WorldBuffServiceError("NOT_FOUND", "World buff status row not found");
  }
  return deleted;
}

export interface UpdateNotesInput {
  statusId: string;
  notes: string | null;
  actingUserId: string;
}

export async function updateNotes(input: UpdateNotesInput) {
  await getStatusOrThrow(input.statusId);
  const [updated] = await db
    .update(worldBuffCharacterStatus)
    .set({ notes: input.notes, updatedById: input.actingUserId })
    .where(eq(worldBuffCharacterStatus.id, input.statusId))
    .returning();
  return updated!;
}

export interface UpdateSubmissionInput {
  statusId: string;
  /** Renames the free-text name — e.g. fixing a typo, or matching a newly-linked character's
   *  canonical spelling. Omit to leave it as-is. */
  characterName?: string;
  /** Links (a positive ID) or unlinks (`null`) the roster character. Omit to leave as-is —
   *  distinct from `null`, which explicitly clears an existing link. */
  characterId?: number | null;
  notes?: string | null;
  actingUserId: string;
}

/** General manager edit — free-text name, roster link, and notes in one call. Backs both the
 *  row's "Edit" dialog and the quick "link a character" action (which only ever passes
 *  `characterName`+`characterId`). Deliberately leaves `state`/`queueType`/`item` alone — those
 *  have their own dedicated flows (`setState`/`updateQueueType`). */
export async function updateSubmission(input: UpdateSubmissionInput) {
  const existing = await getStatusOrThrow(input.statusId);
  const characterName =
    input.characterName !== undefined ? input.characterName.trim() : existing.characterName;

  try {
    const [updated] = await db
      .update(worldBuffCharacterStatus)
      .set({
        characterName,
        characterNameNormalized: normalizeCharacterName(characterName),
        characterId: input.characterId !== undefined ? input.characterId : existing.characterId,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        updatedById: input.actingUserId,
      })
      .where(eq(worldBuffCharacterStatus.id, input.statusId))
      .returning();
    return updated!;
  } catch (error) {
    // Unique violation on (characterNameNormalized, item) — renaming collided with another
    // row already submitted for this same item under that name. Typically means the row being
    // edited is a duplicate (e.g. a free-text CSV-import row for someone who already has a
    // properly-linked submission) — the fix is usually deleting the duplicate, not linking it.
    //
    // The driver's PostgresError carries `.code` (SQLSTATE), but drizzle-orm wraps every query
    // error in its own `DrizzleQueryError` — which has no `.code` of its own — with the original
    // error attached as `.cause`. So the SQLSTATE has to be read from `.cause`, not the error
    // that lands here directly.
    if (getPgErrorCode(error) === "23505") {
      throw new WorldBuffServiceError(
        "CONFLICT",
        `${characterName} already has a submission for ${WORLD_BUFF_ITEM_LABELS[existing.item]}. ` +
          `This looks like a duplicate — delete one of the two rows instead of linking them.`,
      );
    }
    throw error;
  }
}

export interface SetInactiveInput {
  statusId: string;
  inactive: boolean;
  actingUserId: string;
}

/** Manual manager flag — tucks a "gone quiet" character's row out of the active queue without
 *  deleting it. Deliberately independent of `state`: an inactive row can still be `ready_to_drop`,
 *  it's just deprioritized in the UI. Resubmitting availability alone doesn't clear it — but a
 *  real new raid does, automatically (see `reactivateFamiliesAfterRaid`). */
export async function setInactive(input: SetInactiveInput) {
  await getStatusOrThrow(input.statusId);
  const [updated] = await db
    .update(worldBuffCharacterStatus)
    .set({
      markedInactiveAt: input.inactive ? new Date() : null,
      updatedById: input.actingUserId,
    })
    .where(eq(worldBuffCharacterStatus.id, input.statusId))
    .returning();
  return updated!;
}

export interface ReactivateFamiliesAfterRaidInput {
  /** Characters who attended the raid — not expanded to family yet, this function does that. */
  characterIds: number[];
  /** The raid's own date/time — only clears a flag set *before* this, so refreshing an old WCL
   *  log can't undo a flag a manager set more recently than the log's own raid. */
  raidDate: Date;
  actingUserId: string;
}

/** Auto-reactivation counterpart to `setInactive`: when any character in a `markedInactiveAt`
 *  family raids again, the flag clears on its own — no manager action needed. Called from both
 *  places new raid-night attendance gets recorded: raid-log import/refresh (`raidlog.ts`) and
 *  bench assignment (`raid.ts`'s `updateRaidBench`) — a benched character still showed up.
 *  Family-scoped like `isIdle`'s idle check, so an alt raiding clears the flag on the primary's
 *  row too, and vice versa.
 *
 *  A single UPDATE with two nested `IN (SELECT ...)` subqueries (family roots of the raided
 *  characters, then every character sharing one of those roots) rather than resolving family
 *  membership into JS first — one round trip regardless of roster/family size, against tables
 *  that are guild-roster-scale either way. */
export async function reactivateFamiliesAfterRaid(input: ReactivateFamiliesAfterRaidInput) {
  const uniqueIds = [...new Set(input.characterIds)];
  if (uniqueIds.length === 0) return;

  const familyRoot = sql`coalesce(${characters.primaryCharacterId}, ${characters.characterId})`;
  const raidedFamilyRoots = db
    .select({ root: familyRoot })
    .from(characters)
    .where(inArray(characters.characterId, uniqueIds));
  const affectedCharacterIds = db
    .select({ characterId: characters.characterId })
    .from(characters)
    .where(inArray(familyRoot, raidedFamilyRoots));

  await db
    .update(worldBuffCharacterStatus)
    .set({ markedInactiveAt: null, updatedById: input.actingUserId })
    .where(
      and(
        inArray(worldBuffCharacterStatus.characterId, affectedCharacterIds),
        lt(worldBuffCharacterStatus.markedInactiveAt, input.raidDate),
      ),
    );
}

export interface SetStateInput {
  statusId: string;
  state: WorldBuffState;
  actingUserId: string;
  /** Distinguishes web/Templar callers for audit purposes; not enforced, just recorded. */
  source: "web" | "v1";
}

/** The only path that flips `ready_to_drop` <-> `dropped`. Stamps/clears `droppedAt`. */
export async function setState(input: SetStateInput) {
  await getStatusOrThrow(input.statusId);
  const [updated] = await db
    .update(worldBuffCharacterStatus)
    .set({
      state: input.state,
      droppedAt: input.state === "dropped" ? new Date() : null,
      updatedById: input.actingUserId,
    })
    .where(eq(worldBuffCharacterStatus.id, input.statusId))
    .returning();
  return updated!;
}

export interface CreateAssignmentInput {
  statusId: string;
  scheduledAt: Date;
  notes?: string | null;
  actingUserId: string;
}

export async function createAssignment(input: CreateAssignmentInput) {
  const status = await getStatusOrThrow(input.statusId);
  if (status.state === "dropped") {
    throw new WorldBuffServiceError(
      "CONFLICT",
      "This item has already been dropped for this character",
    );
  }

  const [created] = await db
    .insert(worldBuffAssignments)
    .values({
      statusId: input.statusId,
      scheduledAt: input.scheduledAt,
      notes: input.notes ?? null,
      createdById: input.actingUserId,
      updatedById: input.actingUserId,
    })
    .returning();
  return created!;
}

export interface UpdateAssignmentInput {
  assignmentId: string;
  /** Re-links to a different character/item's ready status row; omit to keep the current one. */
  statusId?: string;
  scheduledAt?: Date;
  notes?: string | null;
  actingUserId: string;
}

/** Edits an assignment in place — rescheduling or re-linking, rather than delete-and-recreate. */
export async function updateAssignment(input: UpdateAssignmentInput) {
  const existing = await db.query.worldBuffAssignments.findFirst({
    where: eq(worldBuffAssignments.id, input.assignmentId),
  });
  if (!existing) {
    throw new WorldBuffServiceError("NOT_FOUND", "Assignment not found");
  }

  if (input.statusId !== undefined && input.statusId !== existing.statusId) {
    const status = await getStatusOrThrow(input.statusId);
    if (status.state === "dropped") {
      throw new WorldBuffServiceError(
        "CONFLICT",
        "This item has already been dropped for this character",
      );
    }
  }

  const [updated] = await db
    .update(worldBuffAssignments)
    .set({
      statusId: input.statusId ?? existing.statusId,
      scheduledAt: input.scheduledAt ?? existing.scheduledAt,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedById: input.actingUserId,
    })
    .where(eq(worldBuffAssignments.id, input.assignmentId))
    .returning();
  return updated!;
}

export interface DeleteAssignmentInput {
  assignmentId: string;
}

export async function deleteAssignment(input: DeleteAssignmentInput) {
  const [deleted] = await db
    .delete(worldBuffAssignments)
    .where(eq(worldBuffAssignments.id, input.assignmentId))
    .returning({ id: worldBuffAssignments.id });
  if (!deleted) {
    throw new WorldBuffServiceError("NOT_FOUND", "Assignment not found");
  }
  return deleted;
}

/** A single assignment enriched the same way `listActiveAssignments`/`listPastAssignments` rows
 *  are — used by the v1 routes to return a consistent, enriched shape after a create/update
 *  rather than the bare row the mutation itself returns. */
export async function getAssignmentById(assignmentId: string) {
  const row = await db.query.worldBuffAssignments.findFirst({
    where: eq(worldBuffAssignments.id, assignmentId),
    with: { status: true },
  });
  if (!row) {
    throw new WorldBuffServiceError("NOT_FOUND", "Assignment not found");
  }

  const enrich = await loadCharacterEnrichment(
    row.status.characterId !== null ? [row.status.characterId] : [],
  );
  return { ...row, status: { ...row.status, ...enrich(row.status.characterId) } };
}

export interface CharacterEnrichment {
  characterClass: string | null;
  primaryCharacterName: string | null;
  /** Only populated when someone has linked a character from this family (see
   *  `loadCharacterEnrichment`) to their Temple account — most free-text submissions won't
   *  resolve to anyone. Callers must strip these for non-`worldbuff:manage` viewers. */
  discordUserId: string | null;
  discordUsername: string | null;
  /** Computed "gone quiet" signal — deliberately separate from `markedInactiveAt` (a manual
   *  manager flag). True when the row's linked character's family has raided before but hasn't
   *  in the last 4 lockout weeks (3 complete + current) — see `loadCharacterEnrichment`. Always
   *  false for free-text-only rows (no `characterId`), since there's no roster attendance to
   *  check. */
  isIdle: boolean;
  /** ISO date ("YYYY-MM-DD") of the family's most recent raid — only populated when `isIdle` is
   *  true, for the tooltip's "Last raid X ago" line. */
  idleLastRaidAt: string | null;
}

const NO_ENRICHMENT: CharacterEnrichment = {
  characterClass: null,
  primaryCharacterName: null,
  discordUserId: null,
  discordUsername: null,
  isIdle: false,
  idleLastRaidAt: null,
};

/**
 * Batches the character lookups for a set of characterIds and returns a lookup function, so
 * `getMatrix()` and the assignment list functions can enrich rows the same way without each
 * re-running the query per row.
 */
async function loadCharacterEnrichment(
  characterIds: number[],
): Promise<(characterId: number | null) => CharacterEnrichment> {
  const uniqueIds = [...new Set(characterIds)];

  const linkedCharacters =
    uniqueIds.length > 0
      ? await db.query.characters.findMany({
          where: inArray(characters.characterId, uniqueIds),
          with: { primaryCharacter: { columns: { name: true } } },
        })
      : [];

  const characterMap = new Map(linkedCharacters.map((c) => [c.characterId, c]));

  // A Discord identity is only resolvable when some Temple account has linked the FAMILY's
  // primary character as their own `/profile` character — same simplification `raid-helper.ts`'s
  // find-gamers query makes (an account linked to an alt, not the primary, won't resolve). Most
  // world-buff rows are free-text submissions with no `characterId` at all, so this is always a
  // best-effort lookup, never a guarantee.
  const familyPrimaryIds = [
    ...new Set(linkedCharacters.map((c) => c.primaryCharacterId ?? c.characterId)),
  ];
  const discordLinks =
    familyPrimaryIds.length > 0
      ? await db
          .select({
            characterId: users.characterId,
            discordUserId: accounts.providerAccountId,
            discordUsername: users.name,
          })
          .from(users)
          .innerJoin(accounts, and(eq(users.id, accounts.userId), eq(accounts.provider, "discord")))
          .where(inArray(users.characterId, familyPrimaryIds))
      : [];
  const discordByFamilyId = new Map(discordLinks.map((d) => [d.characterId, d]));

  // "Idle raider": a linked family that has raided at some point in its history, but not within
  // the last 4 lockout weeks (3 complete + the current, in-progress one). Computed fresh on every
  // read rather than stored — unlike `markedInactiveAt`, this is a signal, not a manager decision.
  const familyMembers =
    familyPrimaryIds.length > 0
      ? await db
          .select({
            characterId: characters.characterId,
            primaryCharacterId: characters.primaryCharacterId,
          })
          .from(characters)
          .where(
            or(
              inArray(characters.characterId, familyPrimaryIds),
              inArray(characters.primaryCharacterId, familyPrimaryIds),
            ),
          )
      : [];
  const memberIdsByFamilyId = new Map<number, number[]>(familyPrimaryIds.map((id) => [id, [id]]));
  for (const member of familyMembers) {
    const familyId = member.primaryCharacterId ?? member.characterId;
    if (member.characterId === familyId) continue;
    memberIdsByFamilyId.get(familyId)?.push(member.characterId);
  }
  const allMemberIds = [...new Set([...memberIdsByFamilyId.values()].flat())];

  // Full (unbounded-by-date) history rather than a windowed query, since "has ever raided"
  // needs it — but it's still bounded to `allMemberIds` (families already in this read's
  // result set, not the whole roster), which keeps row counts small at this guild's scale.
  const idleWindowStart = getLockoutWeeks(3, true)[0]!.start.toISOString().split("T")[0]!;
  const attendanceRows =
    allMemberIds.length > 0
      ? await db
          .select({ characterId: raidLogAttendeeMap.characterId, date: raids.date })
          .from(raidLogAttendeeMap)
          .innerJoin(raidLogs, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
          .innerJoin(raids, eq(raidLogs.raidId, raids.raidId))
          .where(
            and(
              inArray(raidLogAttendeeMap.characterId, allMemberIds),
              eq(raidLogAttendeeMap.isIgnored, false),
            ),
          )
      : [];
  const everAttendedIds = new Set(attendanceRows.map((r) => r.characterId));
  const recentlyAttendedIds = new Set(
    attendanceRows.filter((r) => r.date >= idleWindowStart).map((r) => r.characterId),
  );
  const lastRaidDateByCharacterId = new Map<number, string>();
  for (const row of attendanceRows) {
    const prev = lastRaidDateByCharacterId.get(row.characterId);
    if (!prev || row.date > prev) lastRaidDateByCharacterId.set(row.characterId, row.date);
  }
  const idleFamilyIds = new Set(
    [...memberIdsByFamilyId.entries()]
      .filter(
        ([, memberIds]) =>
          memberIds.some((id) => everAttendedIds.has(id)) &&
          !memberIds.some((id) => recentlyAttendedIds.has(id)),
      )
      .map(([familyId]) => familyId),
  );

  return (characterId) => {
    const char = characterId !== null ? characterMap.get(characterId) : undefined;
    if (!char) return NO_ENRICHMENT;
    const familyId = char.primaryCharacterId ?? char.characterId;
    const discord = discordByFamilyId.get(familyId);
    const memberIds = memberIdsByFamilyId.get(familyId) ?? [familyId];
    let lastRaidAt: string | null = null;
    for (const id of memberIds) {
      const d = lastRaidDateByCharacterId.get(id);
      if (d && (!lastRaidAt || d > lastRaidAt)) lastRaidAt = d;
    }
    return {
      characterClass: char.class,
      primaryCharacterName: char.primaryCharacter?.name ?? null,
      discordUserId: discord?.discordUserId ?? null,
      discordUsername: discord?.discordUsername ?? null,
      isIdle: idleFamilyIds.has(familyId),
      idleLastRaidAt: idleFamilyIds.has(familyId) ? lastRaidAt : null,
    };
  };
}

/** All status rows with their assignments, enriched with character/family display info. */
export async function getMatrix() {
  const statusRows = await db.query.worldBuffCharacterStatus.findMany({
    with: { assignments: true },
    orderBy: (status, { asc }) => [asc(status.characterNameNormalized)],
  });

  const enrich = await loadCharacterEnrichment(
    statusRows.map((row) => row.characterId).filter((id): id is number => id !== null),
  );
  return statusRows.map((row) => ({ ...row, ...enrich(row.characterId) }));
}

/**
 * Assignments whose item is still `ready_to_drop` — deliberately NOT filtered by `scheduledAt`,
 * so a missed/overdue assignment stays visible until a raid lead actually marks it dropped (or
 * deletes it), rather than silently vanishing once its time passes. `status` is enriched the
 * same way `getMatrix()`'s rows are, so the character block matches everywhere.
 */
export async function listActiveAssignments() {
  const rows = await db.query.worldBuffAssignments.findMany({
    with: { status: true },
    orderBy: (assignment, { asc }) => [asc(assignment.scheduledAt)],
  });
  const active = rows.filter((row) => row.status.state === "ready_to_drop");

  const enrich = await loadCharacterEnrichment(
    active.map((row) => row.status.characterId).filter((id): id is number => id !== null),
  );
  return active.map((row) => ({
    ...row,
    status: { ...row.status, ...enrich(row.status.characterId) },
  }));
}

/** Assignments whose item has since been marked dropped. */
export async function listPastAssignments() {
  const rows = await db.query.worldBuffAssignments.findMany({
    with: { status: true },
    orderBy: (assignment, { asc }) => [asc(assignment.scheduledAt)],
  });
  const past = rows.filter((row) => row.status.state === "dropped");

  const enrich = await loadCharacterEnrichment(
    past.map((row) => row.status.characterId).filter((id): id is number => id !== null),
  );
  return past.map((row) => ({
    ...row,
    status: { ...row.status, ...enrich(row.status.characterId) },
  }));
}
