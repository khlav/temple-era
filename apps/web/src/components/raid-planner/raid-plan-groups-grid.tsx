"use client";

import { useState, useRef, useEffect } from "react";
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
import {
  Armchair,
  ChevronDown,
  CircleHelp,
  Clock,
  Lock,
  Pencil,
} from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { CharacterSelector } from "~/components/characters/character-selector";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import type { RaidParticipant } from "~/server/api/interfaces/raid";

const CLASS_COLORS: Record<string, string> = {
  Druid: "rgba(255, 124, 10, 0.28)",
  Hunter: "rgba(107, 212, 85, 0.28)",
  Mage: "rgba(63, 199, 235, 0.28)",
  Paladin: "rgba(244, 140, 186, 0.28)",
  Priest: "rgba(255, 255, 255, 0.18)",
  Rogue: "rgba(255, 224, 60, 0.24)",
  Shaman: "rgba(0, 112, 221, 0.28)",
  Warlock: "rgba(135, 136, 238, 0.28)",
  Warrior: "rgba(198, 155, 109, 0.28)",
};

const WOW_CLASSES = [
  "Druid",
  "Hunter",
  "Mage",
  "Paladin",
  "Priest",
  "Rogue",
  "Shaman",
  "Warlock",
  "Warrior",
] as const;

const WOW_CLASSES_SET = new Set<string>(WOW_CLASSES);

// RaidHelper signup statuses that get special icons (non-WoW classes)
const RAIDHELPER_STATUS_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Bench: Armchair,
  Tentative: CircleHelp,
  Late: Clock,
};

// All valid writeInClass values (WoW classes + RaidHelper statuses)
export const VALID_WRITE_IN_CLASSES = new Set<string>([
  ...WOW_CLASSES,
  ...Object.keys(RAIDHELPER_STATUS_ICONS),
]);

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
  writeInClass?: string | null;
}

export interface CharacterDeleteEvent {
  planCharacterId: string;
}

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
  onCharacterUpdate?: (
    planCharacterId: string,
    character: RaidParticipant,
  ) => void;
  onCharacterMove?: (event: CharacterMoveEvent) => void;
  onCharacterSwap?: (event: CharacterSwapEvent) => void;
  onSlotFill?: (event: SlotFillEvent) => void;
  onCharacterDelete?: (event: CharacterDeleteEvent) => void;
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
  onCharacterUpdate,
  onCharacterMove,
  onCharacterSwap,
  onSlotFill,
  onCharacterDelete,
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
      {(editingCharacter || editingSlot || editingBench) &&
        editable &&
        showEditControls && (
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
            dragOnly={dragOnly}
            locked={locked}
            showEditControls={showEditControls}
            editingCharacterId={editingCharacterId}
            editingSlot={editingSlot}
            onEditClick={handleEditClick}
            onSlotEditClick={handleSlotEditClick}
          />
        ))}
      </div>

      {/* Bench Section */}
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

interface GroupColumnProps {
  groupNumber: number;
  groupIndex: number;
  getCharacterAtSlot: (
    group: number,
    position: number,
  ) => RaidPlanCharacter | null;
  editable?: boolean;
  dragOnly?: boolean;
  locked?: boolean;
  showEditControls?: boolean;
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
  dragOnly,
  locked = false,
  showEditControls = true,
  editingCharacterId,
  editingSlot,
  onEditClick,
  onSlotEditClick,
}: GroupColumnProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-2",
        locked && "border-muted-foreground/20",
      )}
    >
      <div className="mb-2 flex items-center justify-center gap-1 text-center text-xs font-semibold text-muted-foreground">
        {locked && <Lock className="h-3 w-3" />}
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
              dragOnly={dragOnly}
              locked={locked}
              showEditControls={showEditControls}
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
  dragOnly?: boolean;
  locked?: boolean;
  showEditControls?: boolean;
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
  dragOnly,
  locked = false,
  showEditControls = true,
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
        isOver && !locked && "bg-primary/10 ring-1 ring-primary/50",
      )}
    >
      {character ? (
        <DraggableCharacterCard
          character={character}
          editable={editable}
          dragOnly={dragOnly}
          showEditControls={showEditControls}
          isEditing={isEditing}
          onEditClick={onEditClick}
        />
      ) : (
        <button
          type="button"
          onClick={() =>
            editable &&
            showEditControls &&
            onSlotEditClick?.(groupIndex, position)
          }
          disabled={!editable || !showEditControls}
          className={cn(
            "group flex h-[28px] w-full items-center justify-center rounded border border-dashed text-xs transition-colors",
            editable && showEditControls
              ? "border-muted-foreground/30 text-muted-foreground/40 hover:border-primary/50 hover:bg-primary/5 hover:text-muted-foreground"
              : "border-muted-foreground/20 text-muted-foreground/40",
            isSlotEditing &&
              "border-primary bg-primary/10 ring-1 ring-primary/50",
          )}
        >
          {editable && showEditControls && (
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
  dragOnly?: boolean;
  locked?: boolean;
  showEditControls?: boolean;
  editingCharacterId?: string | null;
  editingBench?: boolean;
  onEditClick?: (characterId: string) => void;
  onAddClick?: () => void;
  showAlways?: boolean;
}

function BenchSection({
  characters,
  editable,
  dragOnly,
  locked = false,
  showEditControls = true,
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
          isOver && !locked && "border-primary bg-primary/5",
          characters.length === 0 && !isOver && "border-muted-foreground/30",
        )}
      >
        {characters.map((char) => (
          <DraggableCharacterCard
            key={char.id}
            character={char}
            compact
            editable={editable}
            dragOnly={dragOnly}
            showEditControls={showEditControls}
            isEditing={editingCharacterId === char.id}
            onEditClick={onEditClick}
          />
        ))}
        {editable && showEditControls && onAddClick && (
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
  const [writeInClass, setWriteInClass] = useState<string>("Paladin");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-populate name and class when editing bar opens for a character.
  // Key on editingCharacter?.id (stable string) to avoid re-firing on every parent re-render.
  const editingCharId = editingCharacter?.id ?? null;
  useEffect(() => {
    if (editingCharacter) {
      setPlaceholderName(editingCharacter.characterName);
      if (editingCharacter.class) {
        setWriteInClass(editingCharacter.class);
      }
    } else {
      setPlaceholderName("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCharId]);

  const handlePlaceholderSubmit = () => {
    if (placeholderName.trim()) {
      onSelect({
        characterId: 0, // Will be treated as null
        name: placeholderName.trim(),
        class: writeInClass,
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
                {editingCharacter.class &&
                  WOW_CLASSES.includes(
                    editingCharacter.class as (typeof WOW_CLASSES)[number],
                  ) && (
                    <ClassIcon
                      characterClass={
                        editingCharacter.class as (typeof WOW_CLASSES)[number]
                      }
                      px={14}
                    />
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
      <div className="flex min-w-0 items-center gap-2">
        <CharacterSelector
          onSelectAction={onSelect}
          characterSet="all"
          buttonContent="Select from DB"
        />
        <span className="shrink-0 text-nowrap text-xs text-muted-foreground">
          or write-in:
        </span>
        <input
          ref={inputRef}
          type="text"
          value={placeholderName}
          onChange={(e) => setPlaceholderName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type placeholder name..."
          className="h-7 min-w-0 grow rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-7 shrink-0 items-center gap-0.5 rounded-md border bg-background px-1.5"
            >
              {WOW_CLASSES.includes(
                writeInClass as (typeof WOW_CLASSES)[number],
              ) ? (
                <ClassIcon characterClass={writeInClass} px={16} />
              ) : (
                <CircleHelp className="h-4 w-4 text-muted-foreground" />
              )}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[140px]">
            {WOW_CLASSES.map((cls) => (
              <DropdownMenuItem
                key={cls}
                onClick={() => setWriteInClass(cls)}
                className={cn(
                  "gap-2 text-xs",
                  writeInClass === cls && "bg-accent",
                )}
              >
                <ClassIcon characterClass={cls} px={14} />
                {cls}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={handlePlaceholderSubmit}
          disabled={!placeholderName.trim()}
          className="h-7 shrink-0 rounded-md bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Set
        </button>
        {editingCharacter && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="h-7 shrink-0 rounded-md border border-destructive/50 px-2 text-xs text-destructive hover:bg-destructive/10"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

interface DraggableCharacterCardProps {
  character: RaidPlanCharacter;
  compact?: boolean;
  editable?: boolean;
  dragOnly?: boolean;
  showEditControls?: boolean;
  isEditing?: boolean;
  onEditClick?: (characterId: string) => void;
}

function DraggableCharacterCard({
  character,
  compact,
  editable,
  dragOnly,
  showEditControls = true,
  isEditing,
  onEditClick,
}: DraggableCharacterCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: character.id,
  });

  // Enable drag when editable OR dragOnly
  const canDrag = editable || dragOnly;

  return (
    <div ref={setNodeRef} {...attributes}>
      <CharacterCard
        character={character}
        compact={compact}
        editable={editable}
        showEditControls={showEditControls}
        isEditing={isEditing}
        onEditClick={onEditClick}
        isDragging={isDragging}
        dragHandleProps={canDrag ? listeners : undefined}
      />
    </div>
  );
}

interface CharacterCardProps {
  character: RaidPlanCharacter;
  compact?: boolean;
  editable?: boolean;
  showEditControls?: boolean;
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
  showEditControls = true,
  isEditing,
  onEditClick,
  isDragging,
  isDragOverlay,
  dragHandleProps,
}: CharacterCardProps) {
  const isWowClass = !!character.class && WOW_CLASSES_SET.has(character.class);
  const StatusIcon = character.class
    ? RAIDHELPER_STATUS_ICONS[character.class]
    : undefined;
  // dragHandleProps is only passed when dragging is allowed (editable or dragOnly)
  const isDraggable = !!dragHandleProps;
  const isLinkedCharacter = !!character.characterId;
  const classColor =
    isLinkedCharacter && character.class
      ? CLASS_COLORS[character.class]
      : undefined;
  // Write-in gradient: muted bg on left, fading to class color at midpoint, solid class color on right 1/8
  const writeInClassColor =
    !isLinkedCharacter && character.class
      ? CLASS_COLORS[character.class]
      : undefined;
  const mutedBg = compact
    ? "hsl(var(--muted) / 0.5)"
    : "hsl(var(--muted) / 0.3)";

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1.5 rounded px-1.5 py-1 text-xs",
        !classColor &&
          !writeInClassColor &&
          (compact ? "bg-muted/50" : "bg-muted/30"),
        isEditing && "ring-2 ring-primary",
        isDragging && "opacity-50",
        isDragOverlay && "shadow-lg ring-2 ring-primary/50",
      )}
      style={{
        ...(classColor ? { backgroundColor: classColor } : {}),
        ...(writeInClassColor
          ? {
              background: `linear-gradient(45deg, ${mutedBg} 70%, ${writeInClassColor} 95%)`,
            }
          : {}),
      }}
    >
      {/* Draggable area: icon (or grip) + name */}
      <span
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5",
          isDraggable && "cursor-grab touch-none active:cursor-grabbing",
        )}
        {...(isDraggable ? dragHandleProps : {})}
      >
        {isWowClass ? (
          <ClassIcon characterClass={character.class!} px={14} />
        ) : StatusIcon ? (
          <StatusIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/50" />
        ) : (
          <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center text-[10px] font-bold text-muted-foreground/50">
            ?
          </span>
        )}
        <span className="truncate font-medium">
          {character.characterName}
          {!isLinkedCharacter && (
            <span className="text-muted-foreground/80">*</span>
          )}
        </span>
      </span>
      {editable && onEditClick && showEditControls && (
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
