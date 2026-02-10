"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, CircleHelp } from "lucide-react";
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
import type { RaidPlanCharacter } from "./types";
import { WOW_CLASSES } from "./constants";

interface EditingBarProps {
  editingCharacter: RaidPlanCharacter | null;
  editingSlot: { group: number; position: number } | null;
  editingBench?: boolean;
  onSelect: (selected: RaidParticipant) => void;
  onClear?: () => void;
  onCancel: () => void;
}

export function EditingBar({
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
