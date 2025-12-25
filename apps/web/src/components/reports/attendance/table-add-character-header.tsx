"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { Plus } from "lucide-react";
import { api } from "~/trpc/react";
import { ClassIcon } from "~/components/ui/class-icon";
import anyAscii from "any-ascii";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export function TableAddCharacterHeader({
  selectedCharacterIds,
  onAddCharacter,
}: {
  selectedCharacterIds: number[];
  onAddCharacter: (characterId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: characters, isLoading } =
    api.reports.getPrimaryCharacters.useQuery();

  const availableCharacters = (characters || [])
    .filter((char) => !selectedCharacterIds.includes(char.characterId))
    .sort((a, b) => (anyAscii(a.name) > anyAscii(b.name) ? 1 : -1));

  const isDisabled = selectedCharacterIds.length >= 10 || isLoading;

  if (isDisabled && selectedCharacterIds.length >= 10) {
    return null; // Hide when limit reached
  }

  return (
    <Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 bg-chart-2 p-0 text-primary-foreground hover:bg-chart-2/90"
              disabled={isDisabled}
            >
              <Plus className="h-4 w-4 font-bold" />
            </Button>
          </TooltipTrigger>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search characters..." />
            <CommandList>
              <CommandEmpty>No characters found.</CommandEmpty>
              <CommandGroup className="max-h-[300px] overflow-auto">
                {availableCharacters.map((char) => (
                  <CommandItem
                    key={char.characterId}
                    value={char.characterId.toString()}
                    keywords={[anyAscii(char.name)]}
                    onSelect={() => {
                      onAddCharacter(char.characterId);
                      setOpen(false);
                    }}
                    className="flex flex-row gap-2"
                  >
                    <ClassIcon characterClass={char.class} px={20} />
                    <span>{char.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <TooltipContent className="bg-secondary text-muted-foreground">
        Add Primary Character
      </TooltipContent>
    </Tooltip>
  );
}
