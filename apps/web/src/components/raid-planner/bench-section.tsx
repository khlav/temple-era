"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "~/lib/utils";
import type { RaidPlanCharacter } from "./types";
import { DraggableCharacterCard } from "./character-card";

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

export function BenchSection({
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
