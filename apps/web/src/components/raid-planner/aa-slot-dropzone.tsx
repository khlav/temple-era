"use client";

import { useDroppable } from "@dnd-kit/core";
import { X } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { cn } from "~/lib/utils";
import type { AASlotCharacter } from "./types";
import { CLASS_TEXT_COLORS } from "./constants";

interface AASlotDropzoneProps {
  slotName: string;
  encounterId: string;
  characters: AASlotCharacter[];
  maxCharacters?: number;
  noColor?: boolean;
  onRemove?: (planCharacterId: string) => void;
  isDropTarget?: boolean;
  disabled?: boolean;
}

export function AASlotDropzone({
  slotName,
  encounterId,
  characters,
  maxCharacters,
  noColor,
  onRemove,
  isDropTarget,
  disabled,
}: AASlotDropzoneProps) {
  const droppableId = `aa-slot:${encounterId}:${slotName}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    disabled:
      disabled || (maxCharacters ? characters.length >= maxCharacters : false),
  });

  const isFull = maxCharacters ? characters.length >= maxCharacters : false;
  const sortedCharacters = [...characters].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "inline-flex min-w-[80px] items-center gap-1 rounded border border-dashed px-1.5 py-0.5",
        "transition-colors",
        isOver && !isFull && "border-primary bg-primary/10",
        isFull && "border-muted-foreground/30 bg-muted/30",
        !isOver &&
          !isFull &&
          "border-muted-foreground/40 hover:border-muted-foreground/60",
        isDropTarget && "ring-1 ring-primary/50",
        disabled && "opacity-50",
      )}
    >
      {/* Slot label with capacity */}
      <span className="text-xs font-medium text-muted-foreground">
        {slotName}
        {maxCharacters && (
          <span className="ml-0.5 opacity-70">
            ({characters.length}/{maxCharacters})
          </span>
        )}
        :
      </span>

      {/* Assigned characters */}
      {sortedCharacters.length > 0 ? (
        <span className="flex items-center gap-1">
          {sortedCharacters.map((char, index) => (
            <span
              key={char.planCharacterId}
              className={cn(
                "group relative inline-flex items-center gap-0.5 rounded px-1 py-0.5",
                "text-sm font-medium",
                !noColor && char.characterClass
                  ? (CLASS_TEXT_COLORS[char.characterClass] ??
                      "text-foreground")
                  : "text-foreground",
              )}
            >
              {!noColor && char.characterClass && (
                <ClassIcon characterClass={char.characterClass} px={14} />
              )}
              <span>{char.characterName}</span>
              {index < sortedCharacters.length - 1 && (
                <span className="text-muted-foreground">,</span>
              )}
              {onRemove && !disabled && (
                <button
                  type="button"
                  onClick={() => onRemove(char.planCharacterId)}
                  className="absolute -right-1 -top-1 hidden rounded-full bg-destructive p-0.5 text-destructive-foreground group-hover:block"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-xs italic text-muted-foreground/60">
          Drop here
        </span>
      )}
    </div>
  );
}

/**
 * Compact inline version for rendering within template text
 */
interface AASlotInlineProps {
  slotName: string;
  encounterId: string;
  characters: AASlotCharacter[];
  maxCharacters?: number;
  noColor?: boolean;
  onRemove?: (planCharacterId: string) => void;
  disabled?: boolean;
}

export function AASlotInline({
  slotName,
  encounterId,
  characters,
  maxCharacters,
  noColor,
  onRemove,
  disabled,
}: AASlotInlineProps) {
  const droppableId = `aa-slot:${encounterId}:${slotName}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    disabled:
      disabled || (maxCharacters ? characters.length >= maxCharacters : false),
  });

  const isFull = maxCharacters ? characters.length >= maxCharacters : false;
  const sortedCharacters = [...characters].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  return (
    <span
      ref={setNodeRef}
      className={cn(
        "inline-flex items-center gap-0.5 rounded border border-dashed px-1 py-0.5",
        isOver && !isFull && "border-primary bg-primary/10",
        isFull && "border-muted-foreground/30",
        !isOver && !isFull && "border-muted-foreground/40",
      )}
    >
      {sortedCharacters.length === 0 ? (
        <span className="text-xs text-muted-foreground/60">[{slotName}]</span>
      ) : (
        sortedCharacters.map((char, index) => (
          <span
            key={char.planCharacterId}
            className={cn(
              "group relative inline-flex items-center gap-0.5",
              "text-sm font-medium",
              !noColor && char.characterClass
                ? (CLASS_TEXT_COLORS[char.characterClass] ?? "text-foreground")
                : "text-foreground",
            )}
          >
            <span>{char.characterName}</span>
            {index < sortedCharacters.length - 1 && (
              <span className="text-muted-foreground"> </span>
            )}
            {onRemove && !disabled && (
              <button
                type="button"
                onClick={() => onRemove(char.planCharacterId)}
                className="absolute -right-1 -top-1 hidden rounded-full bg-destructive p-0.5 text-destructive-foreground group-hover:block"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        ))
      )}
    </span>
  );
}

/**
 * Read-only inline ref that mirrors a slot's characters without being a drop target
 */
interface AARefInlineProps {
  slotName: string;
  characters: AASlotCharacter[];
  noColor?: boolean;
}

export function AARefInline({
  slotName,
  characters,
  noColor,
}: AARefInlineProps) {
  const sortedCharacters = [...characters].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-dotted border-muted-foreground/30 px-1 py-0.5">
      {sortedCharacters.length === 0 ? (
        <span className="text-xs text-muted-foreground/60">
          (ref:{slotName})
        </span>
      ) : (
        sortedCharacters.map((char, index) => (
          <span
            key={char.planCharacterId}
            className={cn(
              "inline-flex items-center gap-0.5",
              "text-sm font-medium",
              !noColor && char.characterClass
                ? (CLASS_TEXT_COLORS[char.characterClass] ?? "text-foreground")
                : "text-foreground",
            )}
          >
            <span>{char.characterName}</span>
            {index < sortedCharacters.length - 1 && (
              <span className="text-muted-foreground"> </span>
            )}
          </span>
        ))
      )}
    </span>
  );
}
