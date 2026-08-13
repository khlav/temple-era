export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SerializableStatus {
  id: string;
  characterName: string;
  characterId: number | null;
  item: string;
  state: string;
  queueType: string;
  notes: string | null;
  droppedAt: Date | null;
  characterClass: string | null;
  primaryCharacterName: string | null;
}

interface SerializableAssignment {
  id: string;
  statusId: string;
  scheduledAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  status: SerializableStatus;
}

export function serializeAssignment(row: SerializableAssignment) {
  return {
    id: row.id,
    statusId: row.statusId,
    scheduledAt: row.scheduledAt.toISOString(),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
    status: {
      id: row.status.id,
      characterName: row.status.characterName,
      characterId: row.status.characterId,
      item: row.status.item,
      state: row.status.state,
      queueType: row.status.queueType,
      notes: row.status.notes,
      droppedAt: row.status.droppedAt?.toISOString() ?? null,
      characterClass: row.status.characterClass,
      primaryCharacterName: row.status.primaryCharacterName,
    },
  };
}
