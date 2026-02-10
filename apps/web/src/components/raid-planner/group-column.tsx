"use client";

import { useDroppable } from "@dnd-kit/core";
import { Lock } from "lucide-react";
import { cn } from "~/lib/utils";
import type { RaidPlanCharacter } from "./types";
import { DraggableCharacterCard } from "./character-card";

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

export function GroupColumn({
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
