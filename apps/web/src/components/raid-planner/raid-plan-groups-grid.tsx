"use client";

import { useState, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { GripVertical, Pencil } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { CharacterSelector } from "~/components/characters/character-selector";
import { cn } from "~/lib/utils";
import type { RaidParticipant } from "~/server/api/interfaces/raid";

const CLASS_COLORS: Record<string, string> = {
  Druid: "rgba(255, 124, 10, 0.28)",
  Hunter: "rgba(171, 212, 115, 0.28)",
  Mage: "rgba(63, 199, 235, 0.28)",
  Paladin: "rgba(244, 140, 186, 0.28)",
  Priest: "rgba(255, 255, 255, 0.18)",
  Rogue: "rgba(255, 244, 104, 0.22)",
  Shaman: "rgba(0, 112, 221, 0.28)",
  Warlock: "rgba(135, 136, 238, 0.28)",
  Warrior: "rgba(198, 155, 109, 0.28)",
};

export const WOW_SERVERS = [
  "Ashkandi",
  "Mankrik",
  "Pagle",
  "Westfall",
  "Windseeker",
] as const;

export interface RaidPlanCharacter {
  id: string;
  characterId: number | null;
  characterName: string;
  defaultGroup: number | null;
  defaultPosition: number | null;
  class: string | null;
  server: string | null;
}

export interface CharacterMoveEvent {
  planCharacterId: string;
  targetGroup: number | null;
  targetPosition: number | null;
}

export interface CharacterSwapEvent {
  planCharacterIdA: string;
  planCharacterIdB: string;
}

export interface SlotFillEvent {
  targetGroup: number;
  targetPosition: number;
  characterId: number | null;
  characterName: string;
}

export interface CharacterDeleteEvent {
  planCharacterId: string;
}

interface RaidPlanGroupsGridProps {
  characters: RaidPlanCharacter[];
  groupCount?: number;
  dimmed?: boolean;
  editable?: boolean;
  onCharacterUpdate?: (
    planCharacterId: string,
    character: RaidParticipant,
  ) => void;
  onCharacterMove?: (event: CharacterMoveEvent) => void;
  onCharacterSwap?: (event: CharacterSwapEvent) => void;
  onSlotFill?: (event: SlotFillEvent) => void;
  onCharacterDelete?: (event: CharacterDeleteEvent) => void;
  onExportMRT?: () => void;
  mrtCopied?: boolean;
  homeServer?: string;
  onHomeServerChange?: (server: string) => void;
}

export function RaidPlanGroupsGrid({
  characters,
  groupCount = 8,
  dimmed = false,
  editable = false,
  onCharacterUpdate,
  onCharacterMove,
  onCharacterSwap,
  onSlotFill,
  onCharacterDelete,
  onExportMRT,
  mrtCopied,
  homeServer,
  onHomeServerChange,
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

  // Sort bench alphabetically, ignoring diacritics
  bench.sort((a, b) =>
    a.characterName.localeCompare(b.characterName, undefined, {
      sensitivity: "base",
    }),
  );

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
      });
    } else if (editingBench && onSlotFill) {
      // Adding to bench - create a new character with null group/position
      onSlotFill({
        targetGroup: -1, // Signal for bench
        targetPosition: -1,
        characterId: selected.characterId || null,
        characterName: selected.name,
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
      {(editingCharacter || editingSlot || editingBench) && editable && (
        <EditingBar
          editingCharacter={editingCharacter ?? null}
          editingSlot={editingSlot}
          editingBench={editingBench}
          onSelect={handleSelect}
          onClear={handleClear}
          onCancel={handleCancel}
        />
      )}

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
            editingCharacterId={editingCharacterId}
            editingSlot={editingSlot}
            onEditClick={handleEditClick}
            onSlotEditClick={handleSlotEditClick}
          />
        ))}
      </div>

      {/* MRT Export Button */}
      {editable && onExportMRT && (
        <div className="flex items-center justify-end gap-2">
          <label className="text-xs text-muted-foreground">My server:</label>
          <select
            value={homeServer ?? ""}
            onChange={(e) => onHomeServerChange?.(e.target.value)}
            className="h-7 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">All servers</option>
            {WOW_SERVERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onExportMRT}
            className="h-7 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
          >
            {mrtCopied ? "Copied!" : "Copy MRT Export"}
          </button>
        </div>
      )}

      {/* Bench Section */}
      <BenchSection
        characters={bench}
        editable={editable}
        editingCharacterId={editingCharacterId}
        editingBench={editingBench}
        onEditClick={handleEditClick}
        onAddClick={handleBenchAddClick}
        showAlways={editable}
      />

      {/* Empty state */}
      {characters.length === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          No characters in this plan yet.
        </div>
      )}
    </div>
  );

  // Wrap with DndContext only if editable and has handlers
  if (!editable || (!onCharacterMove && !onCharacterSwap)) {
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

interface GroupColumnProps {
  groupNumber: number;
  groupIndex: number;
  getCharacterAtSlot: (
    group: number,
    position: number,
  ) => RaidPlanCharacter | null;
  editable?: boolean;
  editingCharacterId?: string | null;
  editingSlot?: { group: number; position: number } | null;
  onEditClick?: (characterId: string) => void;
  onSlotEditClick?: (group: number, position: number) => void;
}

function GroupColumn({
  groupNumber,
  groupIndex,
  getCharacterAtSlot,
  editable,
  editingCharacterId,
  editingSlot,
  onEditClick,
  onSlotEditClick,
}: GroupColumnProps) {
  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="mb-2 text-center text-xs font-semibold text-muted-foreground">
        Group {groupNumber}
      </div>
      <div className="flex flex-col gap-1">
        {Array.from({ length: 5 }).map((_, position) => {
          const isSlotEditing =
            editingSlot?.group === groupIndex &&
            editingSlot?.position === position;
          return (
            <GroupSlot
              key={position}
              groupIndex={groupIndex}
              position={position}
              character={getCharacterAtSlot(groupIndex, position)}
              editable={editable}
              isEditing={
                editingCharacterId ===
                getCharacterAtSlot(groupIndex, position)?.id
              }
              isSlotEditing={isSlotEditing}
              onEditClick={onEditClick}
              onSlotEditClick={onSlotEditClick}
            />
          );
        })}
      </div>
    </div>
  );
}

interface GroupSlotProps {
  groupIndex: number;
  position: number;
  character: RaidPlanCharacter | null;
  editable?: boolean;
  isEditing?: boolean;
  isSlotEditing?: boolean;
  onEditClick?: (characterId: string) => void;
  onSlotEditClick?: (group: number, position: number) => void;
}

function GroupSlot({
  groupIndex,
  position,
  character,
  editable,
  isEditing,
  isSlotEditing,
  onEditClick,
  onSlotEditClick,
}: GroupSlotProps) {
  const slotId = `slot-${groupIndex}-${position}`;
  const { setNodeRef, isOver } = useDroppable({ id: slotId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[28px] rounded transition-colors",
        isOver && "bg-primary/10 ring-1 ring-primary/50",
      )}
    >
      {character ? (
        <DraggableCharacterCard
          character={character}
          editable={editable}
          isEditing={isEditing}
          onEditClick={onEditClick}
        />
      ) : (
        <button
          type="button"
          onClick={() => editable && onSlotEditClick?.(groupIndex, position)}
          disabled={!editable}
          className={cn(
            "group flex h-[28px] w-full items-center justify-center rounded border border-dashed text-xs transition-colors",
            editable
              ? "border-muted-foreground/30 text-muted-foreground/40 hover:border-primary/50 hover:bg-primary/5 hover:text-muted-foreground"
              : "border-muted-foreground/20 text-muted-foreground/40",
            isSlotEditing &&
              "border-primary bg-primary/10 ring-1 ring-primary/50",
          )}
        >
          {editable && (
            <span className="opacity-0 group-hover:opacity-100">+ Add</span>
          )}
        </button>
      )}
    </div>
  );
}

interface BenchSectionProps {
  characters: RaidPlanCharacter[];
  editable?: boolean;
  editingCharacterId?: string | null;
  editingBench?: boolean;
  onEditClick?: (characterId: string) => void;
  onAddClick?: () => void;
  showAlways?: boolean;
}

function BenchSection({
  characters,
  editable,
  editingCharacterId,
  editingBench,
  onEditClick,
  onAddClick,
  showAlways,
}: BenchSectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "bench-droppable",
  });

  if (!showAlways && characters.length === 0) {
    return null;
  }

  return (
    <div className="border-t pt-4">
      <div className="mb-2 text-sm font-medium text-muted-foreground">
        Bench & Swappable Characters ({characters.length})
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[40px] flex-wrap gap-2 rounded-lg border border-dashed p-2 transition-colors",
          isOver && "border-primary bg-primary/5",
          characters.length === 0 && !isOver && "border-muted-foreground/30",
        )}
      >
        {characters.map((char) => (
          <DraggableCharacterCard
            key={char.id}
            character={char}
            compact
            editable={editable}
            isEditing={editingCharacterId === char.id}
            onEditClick={onEditClick}
          />
        ))}
        {editable && onAddClick && (
          <button
            type="button"
            onClick={onAddClick}
            className={cn(
              "flex h-[26px] items-center justify-center rounded border border-dashed px-2 text-xs transition-colors",
              "border-muted-foreground/30 text-muted-foreground/60 hover:border-primary/50 hover:bg-primary/5 hover:text-muted-foreground",
              editingBench &&
                "border-primary bg-primary/10 ring-1 ring-primary/50",
            )}
          >
            + Add
          </button>
        )}
        {characters.length === 0 && !editable && (
          <div className="flex w-full items-center justify-center py-2 text-xs text-muted-foreground/60">
            Drop here to bench
          </div>
        )}
      </div>
    </div>
  );
}

interface EditingBarProps {
  editingCharacter: RaidPlanCharacter | null;
  editingSlot: { group: number; position: number } | null;
  editingBench?: boolean;
  onSelect: (selected: RaidParticipant) => void;
  onClear?: () => void;
  onCancel: () => void;
}

function EditingBar({
  editingCharacter,
  editingSlot,
  editingBench,
  onSelect,
  onClear,
  onCancel,
}: EditingBarProps) {
  const [placeholderName, setPlaceholderName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePlaceholderSubmit = () => {
    if (placeholderName.trim()) {
      onSelect({
        characterId: 0, // Will be treated as null
        name: placeholderName.trim(),
        class: "",
        classDetail: "",
        server: "",
      });
      setPlaceholderName("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handlePlaceholderSubmit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const label = editingSlot
    ? `Filling Group ${editingSlot.group + 1}, Slot ${editingSlot.position + 1}`
    : editingBench
      ? "Adding to bench"
      : null;

  return (
    <div className="rounded-lg border bg-muted/50 px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm">
          {editingCharacter ? (
            <>
              <span className="text-muted-foreground">Replacing </span>
              <span className="inline-flex items-center gap-1 font-medium">
                {editingCharacter.class && (
                  <ClassIcon characterClass={editingCharacter.class} px={14} />
                )}
                {editingCharacter.characterName}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{label}</span>
          )}
        </div>
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <div className="flex items-center gap-2">
        <CharacterSelector
          onSelectAction={onSelect}
          characterSet="all"
          buttonContent={<span>Select character</span>}
        />
        <span className="text-xs text-muted-foreground">or</span>
        <input
          ref={inputRef}
          type="text"
          value={placeholderName}
          onChange={(e) => setPlaceholderName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type name..."
          className="h-7 w-32 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={handlePlaceholderSubmit}
          disabled={!placeholderName.trim()}
          className="h-7 rounded-md bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Set
        </button>
        {editingCharacter && onClear && (
          <>
            <span className="text-xs text-muted-foreground">or</span>
            <button
              type="button"
              onClick={onClear}
              className="h-7 rounded-md border border-destructive/50 px-2 text-xs text-destructive hover:bg-destructive/10"
            >
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface DraggableCharacterCardProps {
  character: RaidPlanCharacter;
  compact?: boolean;
  editable?: boolean;
  isEditing?: boolean;
  onEditClick?: (characterId: string) => void;
}

function DraggableCharacterCard({
  character,
  compact,
  editable,
  isEditing,
  onEditClick,
}: DraggableCharacterCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: character.id,
  });

  return (
    <div ref={setNodeRef} {...attributes}>
      <CharacterCard
        character={character}
        compact={compact}
        editable={editable}
        isEditing={isEditing}
        onEditClick={onEditClick}
        isDragging={isDragging}
        dragHandleProps={listeners}
      />
    </div>
  );
}

interface CharacterCardProps {
  character: RaidPlanCharacter;
  compact?: boolean;
  editable?: boolean;
  isEditing?: boolean;
  onEditClick?: (characterId: string) => void;
  isDragging?: boolean;
  isDragOverlay?: boolean;
  dragHandleProps?: Record<string, unknown>;
}

function CharacterCard({
  character,
  compact,
  editable,
  isEditing,
  onEditClick,
  isDragging,
  isDragOverlay,
  dragHandleProps,
}: CharacterCardProps) {
  const hasClassIcon = !!character.class;
  const isDraggable = editable && dragHandleProps;
  const classColor =
    character.characterId && character.class
      ? CLASS_COLORS[character.class]
      : undefined;

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1.5 rounded px-1.5 py-1 text-xs",
        !classColor && (compact ? "bg-muted/50" : "bg-muted/30"),
        isEditing && "ring-2 ring-primary",
        isDragging && "opacity-50",
        isDragOverlay && "shadow-lg ring-2 ring-primary/50",
      )}
      style={classColor ? { backgroundColor: classColor } : undefined}
    >
      {/* Draggable area: icon (or grip) + name */}
      <span
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5",
          isDraggable && "cursor-grab touch-none active:cursor-grabbing",
        )}
        {...(isDraggable ? dragHandleProps : {})}
      >
        {hasClassIcon ? (
          <ClassIcon characterClass={character.class!} px={14} />
        ) : (
          isDraggable && (
            <GripVertical className="h-3 w-3 flex-shrink-0 text-muted-foreground/50" />
          )
        )}
        <span className="truncate font-medium">{character.characterName}</span>
      </span>
      {editable && onEditClick && (
        <button
          type="button"
          className="absolute right-1 rounded bg-card/80 p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
          onClick={() => onEditClick(character.id)}
        >
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
