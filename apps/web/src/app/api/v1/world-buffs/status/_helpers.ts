import type { worldBuffCharacterStatus } from "~/server/db/schema";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WorldBuffCharacterStatusRow = typeof worldBuffCharacterStatus.$inferSelect;

export function serializeStatus(row: WorldBuffCharacterStatusRow) {
  return {
    id: row.id,
    characterName: row.characterName,
    characterId: row.characterId,
    item: row.item,
    state: row.state,
    queueType: row.queueType,
    notes: row.notes,
    droppedAt: row.droppedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}
