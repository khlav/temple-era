"use client";

import * as React from "react";
import { Loader2, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { api } from "~/trpc/react";
import anyAscii from "any-ascii";
import type { RaidParticipant } from "~/server/api/interfaces/raid";
import { ClassIcon } from "~/components/ui/class-icon";

export function CharacterSelector({
  onSelectAction,
  buttonContent = (
    <div className="flex items-center space-x-2">
      <PlusIcon className="shrink-0" />
      <div className="grow-0">Add character</div>
    </div>
  ),
  characterSet = "all",
  disabled = false,
  children,
  skeleton,
}: {
  onSelectAction: (character: RaidParticipant) => void;
  buttonContent?: React.ReactNode;
  characterSet?: "all" | "primary" | "secondary" | "secondaryEligible";
  disabled?: boolean;
  children?: React.ReactNode;
  skeleton?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  const { data: characterCollection, isLoading } =
    api.character.getCharacters.useQuery(characterSet);

  const childrenOrDefault = children ?? (
    <Button
      variant="outline"
      size="sm"
      role="combobox"
      aria-expanded={open}
      className="line- px-2 py-0 text-muted-foreground"
      disabled={disabled}
    >
      {buttonContent}
    </Button>
  );

  const skeletonOrDefault = skeleton ?? (
    <Button
      variant="outline"
      size="sm"
      role="combobox"
      aria-expanded={open}
      className="px-2 py-0 text-muted-foreground"
      disabled
    >
      <Loader2 className="animate-spin" />
      Loading characters...
    </Button>
  );

  const handleSelect = (characterId: string) => {
    // @ts-expect-error Suppress undefined concern.  Select cannot happen without a proper value.
    return onSelectAction(characterCollection[characterId]);
  };

  const characterList = Object.values(characterCollection ?? {}).sort((a, b) =>
    anyAscii(a.name) > anyAscii(b.name) ? 1 : -1,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {isLoading ? skeletonOrDefault : childrenOrDefault}
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={isLoading ? "Loading..." : "Search characters..."}
            className="h-9"
            onValueChange={anyAscii}
          />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {characterList.map((c) => (
                <CommandItem
                  key={c.characterId}
                  value={c.characterId.toString()}
                  keywords={[
                    anyAscii(c.name),
                    anyAscii(c.primaryCharacterName ?? ""),
                  ]}
                  onSelect={(currentValue) => {
                    handleSelect(currentValue);
                    setOpen(false);
                  }}
                  className="flex flex-row gap-1"
                >
                  <div className="grow-0">
                    <ClassIcon characterClass={c.class} px={20} />
                  </div>
                  <div className="grow-0">{c.name}</div>
                  <span className="grow text-sm text-muted-foreground">
                    {c.primaryCharacterName ?? ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
