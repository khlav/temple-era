"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, CircleHelp } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { CharacterSelector } from "~/components/characters/character-selector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import type { RaidParticipant } from "~/server/api/interfaces/raid";
import type { RaidPlanCharacter } from "./types";
import { WOW_CLASSES } from "./constants";

interface EditCharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCharacter: RaidPlanCharacter | null;
  editingSlot: { group: number; position: number } | null;
  editingBench?: boolean;
  onSelect: (selected: RaidParticipant) => void;
  onClear?: () => void;
}

export function EditCharacterDialog({
  open,
  onOpenChange,
  editingCharacter,
  editingSlot,
  editingBench,
  onSelect,
  onClear,
}: EditCharacterDialogProps) {
  const [placeholderName, setPlaceholderName] = useState("");
  const [writeInClass, setWriteInClass] = useState<string>("Paladin");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-populate name and class when dialog opens for a character.
  useEffect(() => {
    if (open && editingCharacter) {
      setPlaceholderName(editingCharacter.characterName);
      if (editingCharacter.class) {
        setWriteInClass(editingCharacter.class);
      }
    } else if (!open) {
      // Reset when closing
      setPlaceholderName("");
    }
  }, [open, editingCharacter]);

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
    }
  };

  const title = editingCharacter ? (
    <div className="flex items-center gap-2">
      <span>Editing</span>
      <span className="flex items-center gap-1">
        {editingCharacter.class &&
          WOW_CLASSES.includes(
            editingCharacter.class as (typeof WOW_CLASSES)[number],
          ) && (
            <ClassIcon
              characterClass={
                editingCharacter.class as (typeof WOW_CLASSES)[number]
              }
              px={20}
            />
          )}
        {editingCharacter.characterName}
      </span>
    </div>
  ) : editingSlot ? (
    `Fill Slot (Group ${editingSlot.group + 1}, Slot ${editingSlot.position + 1})`
  ) : editingBench ? (
    "Add to Bench"
  ) : (
    "Edit"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[33%] translate-y-[-33%] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 py-4">
          <CharacterSelector onSelectAction={onSelect} characterSet="all">
            <Button
              variant="outline"
              className="w-[150px] justify-start text-left font-normal"
            >
              Select from DB...
            </Button>
          </CharacterSelector>

          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-muted-foreground">
              or write in:
            </span>

            <Input
              ref={inputRef}
              value={placeholderName}
              onChange={(e) => setPlaceholderName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Name"
              className="w-[150px]"
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 px-3">
                  {WOW_CLASSES.includes(
                    writeInClass as (typeof WOW_CLASSES)[number],
                  ) ? (
                    <ClassIcon characterClass={writeInClass} px={16} />
                  ) : (
                    <CircleHelp className="h-4 w-4 text-muted-foreground" />
                  )}
                  <ChevronDown className="h-3 w-3 text-muted-foreground opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="h-[300px] overflow-y-auto"
              >
                {WOW_CLASSES.map((cls) => (
                  <DropdownMenuItem
                    key={cls}
                    onClick={() => setWriteInClass(cls)}
                    className={cn("gap-2", writeInClass === cls && "bg-accent")}
                  >
                    <ClassIcon characterClass={cls} px={14} />
                    {cls}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              onClick={handlePlaceholderSubmit}
              disabled={!placeholderName.trim()}
            >
              Set
            </Button>
          </div>

          {editingCharacter && onClear && (
            <Button variant="destructive" onClick={onClear} className="ml-auto">
              Clear
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
