"use client";

import { useDraggable } from "@dnd-kit/core";
import { Pencil } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { cn } from "~/lib/utils";
import type { RaidPlanCharacter } from "./types";
import {
  CLASS_COLORS,
  WOW_CLASSES_SET,
  RAIDHELPER_STATUS_ICONS,
} from "./constants";

interface DraggableCharacterCardProps {
  character: RaidPlanCharacter;
  compact?: boolean;
  editable?: boolean;
  dragOnly?: boolean;
  showEditControls?: boolean;
  isEditing?: boolean;
  onEditClick?: (characterId: string) => void;
  isHighlighted?: boolean;
}

export function DraggableCharacterCard({
  character,
  compact,
  editable,
  dragOnly,
  showEditControls = true,
  isEditing,
  onEditClick,
  isHighlighted,
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
        isHighlighted={isHighlighted}
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
  isHighlighted?: boolean;
}

export function CharacterCard({
  character,
  compact,
  editable,
  showEditControls = true,
  isEditing,
  onEditClick,
  isDragging,
  isDragOverlay,
  dragHandleProps,
  isHighlighted,
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
        isHighlighted && "ring-2 ring-yellow-400 dark:ring-yellow-500",
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
