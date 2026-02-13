"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "~/lib/utils";
import type { RaidParticipant } from "~/server/api/interfaces/raid";
import type {
  RaidPlanCharacter,
  CharacterMoveEvent,
  CharacterSwapEvent,
  SlotFillEvent,
  CharacterDeleteEvent,
} from "./types";
import { CharacterCard } from "./character-card";
import { GroupColumn } from "./group-column";
import { BenchSection } from "./bench-section";
import { EditCharacterDialog } from "./edit-character-dialog";

interface RaidPlanGroupsGridProps {
  characters: RaidPlanCharacter[];
  groupCount?: number;
  dimmed?: boolean;
  /** When true, shows lock icons and fades group containers but keeps character bars bright */
  locked?: boolean;
  editable?: boolean;
  showEditControls?: boolean;
  /** When true, characters are draggable but group drops are ignored. Use with external DndContext. */
  dragOnly?: boolean;
  /** Skip internal DndContext - parent will provide one */
  skipDndContext?: boolean;
  /** Hide bench section (for read-only views) */
  hideBench?: boolean;
  onCharacterUpdate?: (
    planCharacterId: string,
    character: RaidParticipant,
  ) => void;
  onCharacterMove?: (event: CharacterMoveEvent) => void;
  onCharacterSwap?: (event: CharacterSwapEvent) => void;
  onSlotFill?: (event: SlotFillEvent) => void;
  onCharacterDelete?: (event: CharacterDeleteEvent) => void;
  userCharacterIds?: number[];
}

export function RaidPlanGroupsGrid({
  characters,
  groupCount = 8,
  dimmed = false,
  locked = false,
  editable = false,
  showEditControls = true,
  dragOnly = false,
  skipDndContext = false,
  hideBench = false,
  onCharacterUpdate,
  onCharacterMove,
  onCharacterSwap,
  onSlotFill,
  onCharacterDelete,
  userCharacterIds = [],
}: RaidPlanGroupsGridProps) {
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(
    null,
  );
  const [editingSlot, setEditingSlot] = useState<{
    group: number;
    position: number;
  } | null>(null);
  const [editingBench, setEditingBench] = useState(false);
  const [activeCharacter, setActiveCharacter] =
    useState<RaidPlanCharacter | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  // Create a map of group -> position -> character for O(1) lookup
  const characterMap = new Map<string, RaidPlanCharacter>();
  const bench: RaidPlanCharacter[] = [];

  for (const char of characters) {
    if (char.defaultGroup !== null && char.defaultPosition !== null) {
      const key = `${char.defaultGroup}-${char.defaultPosition}`;
      characterMap.set(key, char);
    } else {
      bench.push(char);
    }
  }

  // Sort bench by class then by name, ignoring diacritics
  bench.sort((a, b) => {
    const classA = a.class ?? "";
    const classB = b.class ?? "";
    if (!classA && classB) return 1;
    if (classA && !classB) return -1;
    const classCmp = classA.localeCompare(classB, undefined, {
      sensitivity: "base",
    });
    if (classCmp !== 0) return classCmp;
    return a.characterName.localeCompare(b.characterName, undefined, {
      sensitivity: "base",
    });
  });

  const getCharacterAtSlot = (
    group: number,
    position: number,
  ): RaidPlanCharacter | null => {
    return characterMap.get(`${group}-${position}`) ?? null;
  };

  const handleEditClick = (characterId: string) => {
    setEditingCharacterId(characterId);
    setEditingSlot(null);
    setEditingBench(false);
  };

  const handleSlotEditClick = (group: number, position: number) => {
    setEditingSlot({ group, position });
    setEditingCharacterId(null);
    setEditingBench(false);
  };

  const handleBenchAddClick = () => {
    setEditingBench(true);
    setEditingCharacterId(null);
    setEditingSlot(null);
  };

  const handleSelect = (selected: RaidParticipant) => {
    const isWriteIn = !selected.characterId;
    const writeInClass = isWriteIn && selected.class ? selected.class : null;

    if (editingCharacterId && onCharacterUpdate) {
      // Replacing an existing character
      onCharacterUpdate(editingCharacterId, selected);
    } else if (editingSlot && onSlotFill) {
      // Filling an empty slot - create a new character entry
      onSlotFill({
        targetGroup: editingSlot.group,
        targetPosition: editingSlot.position,
        characterId: selected.characterId || null,
        characterName: selected.name,
        writeInClass,
      });
    } else if (editingBench && onSlotFill) {
      // Adding to bench - create a new character with null group/position
      onSlotFill({
        targetGroup: -1, // Signal for bench
        targetPosition: -1,
        characterId: selected.characterId || null,
        characterName: selected.name,
        writeInClass,
      });
    }
    setEditingCharacterId(null);
    setEditingSlot(null);
    setEditingBench(false);
  };

  const handleCancel = () => {
    setEditingCharacterId(null);
    setEditingSlot(null);
    setEditingBench(false);
  };

  const handleClear = () => {
    if (editingCharacterId) {
      const char = characters.find((c) => c.id === editingCharacterId);
      const isOnBench = char?.defaultGroup === null;

      if (isOnBench && onCharacterDelete) {
        // Delete from bench entirely
        onCharacterDelete({ planCharacterId: editingCharacterId });
      } else if (onCharacterMove) {
        // Move to bench (clear slot)
        onCharacterMove({
          planCharacterId: editingCharacterId,
          targetGroup: null,
          targetPosition: null,
        });
      }
    }
    setEditingCharacterId(null);
    setEditingSlot(null);
    setEditingBench(false);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const charId = event.active.id as string;
    const char = characters.find((c) => c.id === charId);
    setActiveCharacter(char ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCharacter(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const activeChar = characters.find((c) => c.id === activeId);
    if (!activeChar) return;

    // Parse the drop target
    // Format: "slot-{group}-{position}" for group slots
    // Format: "bench-droppable" for bench area
    // Format: character ID for bench characters

    if (overId === "bench-droppable") {
      // Dropped on bench area (not on a specific bench character)
      if (activeChar.defaultGroup === null) return; // Already on bench
      onCharacterMove?.({
        planCharacterId: activeId,
        targetGroup: null,
        targetPosition: null,
      });
      return;
    }

    if (overId.startsWith("slot-")) {
      // Dropped on a group slot
      const parts = overId.split("-");
      const targetGroup = parseInt(parts[1]!, 10);
      const targetPosition = parseInt(parts[2]!, 10);

      // Check if same slot
      if (
        activeChar.defaultGroup === targetGroup &&
        activeChar.defaultPosition === targetPosition
      ) {
        return;
      }

      // Check if target slot is occupied
      const targetChar = getCharacterAtSlot(targetGroup, targetPosition);

      if (targetChar) {
        // Swap with occupant
        onCharacterSwap?.({
          planCharacterIdA: activeId,
          planCharacterIdB: targetChar.id,
        });
      } else {
        // Move to empty slot
        onCharacterMove?.({
          planCharacterId: activeId,
          targetGroup,
          targetPosition,
        });
      }
      return;
    }

    // Dropped on a bench character - swap with them
    const targetChar = characters.find((c) => c.id === overId);
    if (targetChar && targetChar.defaultGroup === null) {
      if (activeId === overId) return;
      onCharacterSwap?.({
        planCharacterIdA: activeId,
        planCharacterIdB: overId,
      });
    }
  };

  // Find the character being edited for display in selector
  const editingCharacter = editingCharacterId
    ? characters.find((c) => c.id === editingCharacterId)
    : null;

  const content = (
    <div className={cn("space-y-4", dimmed && "opacity-50")}>
      {/* Editing bar */}
      {/* Edit Character Dialog */}
      <EditCharacterDialog
        open={!!(editingCharacter || editingSlot || editingBench)}
        onOpenChange={(open) => !open && handleCancel()}
        editingCharacter={editingCharacter ?? null}
        editingSlot={editingSlot}
        editingBench={editingBench}
        onSelect={handleSelect}
        onClear={handleClear}
      />

      {/* Groups Grid */}
      <div
        className={cn(
          "grid gap-3",
          groupCount <= 4
            ? "grid-cols-2 md:grid-cols-4"
            : "grid-cols-2 md:grid-cols-4",
        )}
      >
        {Array.from({ length: groupCount }).map((_, groupIndex) => (
          <GroupColumn
            key={groupIndex}
            groupNumber={groupIndex + 1}
            groupIndex={groupIndex}
            getCharacterAtSlot={getCharacterAtSlot}
            editable={editable}
            dragOnly={dragOnly}
            locked={locked}
            showEditControls={showEditControls}
            editingCharacterId={editingCharacterId}
            editingSlot={editingSlot}
            onEditClick={handleEditClick}
            onSlotEditClick={handleSlotEditClick}
            userCharacterIds={userCharacterIds}
          />
        ))}
      </div>

      {/* Bench Section */}
      {!hideBench && (
        <BenchSection
          characters={bench}
          editable={editable}
          dragOnly={dragOnly}
          locked={locked}
          showEditControls={showEditControls}
          editingCharacterId={editingCharacterId}
          editingBench={editingBench}
          onEditClick={handleEditClick}
          onAddClick={handleBenchAddClick}
          showAlways={editable || dragOnly}
        />
      )}

      {/* Empty state */}
      {characters.length === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          No characters in this plan yet.
        </div>
      )}
    </div>
  );

  // Determine if we need drag functionality
  const needsDrag = editable || dragOnly;
  const hasDropHandlers = onCharacterMove || onCharacterSwap;

  // If skipDndContext is true, parent provides DndContext
  if (skipDndContext) {
    return content;
  }

  // Wrap with DndContext only if dragging needed and has handlers (or dragOnly for external drops)
  if (!needsDrag || (!hasDropHandlers && !dragOnly)) {
    return content;
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {content}

      <DragOverlay dropAnimation={null}>
        {activeCharacter && (
          <CharacterCard character={activeCharacter} isDragOverlay />
        )}
      </DragOverlay>
    </DndContext>
  );
}
