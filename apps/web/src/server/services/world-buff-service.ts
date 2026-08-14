import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import {
  accounts,
  characters,
  users,
  worldBuffAssignments,
  worldBuffCharacterStatus,
} from "~/server/db/schema";
import type { WorldBuffItem } from "~/lib/world-buffs";

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

export interface SetInactiveInput {
  statusId: string;
  inactive: boolean;
  actingUserId: string;
}

/** Manual manager flag — tucks a "gone quiet" character's row out of the active queue without
 *  deleting it. Deliberately independent of `state`: an inactive row can still be `ready_to_drop`,
 *  it's just deprioritized in the UI. Never auto-clears (e.g. resubmitting availability doesn't
 *  touch this) — a manager has to explicitly bring someone back. */
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
}

const NO_ENRICHMENT: CharacterEnrichment = {
  characterClass: null,
  primaryCharacterName: null,
  discordUserId: null,
  discordUsername: null,
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

  return (characterId) => {
    const char = characterId !== null ? characterMap.get(characterId) : undefined;
    if (!char) return NO_ENRICHMENT;
    const familyId = char.primaryCharacterId ?? char.characterId;
    const discord = discordByFamilyId.get(familyId);
    return {
      characterClass: char.class,
      primaryCharacterName: char.primaryCharacter?.name ?? null,
      discordUserId: discord?.discordUserId ?? null,
      discordUsername: discord?.discordUsername ?? null,
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
