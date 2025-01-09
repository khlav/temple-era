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
import { RaidParticipant } from "~/server/api/interfaces/raid";

export function RaidBenchManagerCharacterSelector({
  onSelectAction,
}: {
  onSelectAction: (character: RaidParticipant) => void;
}) {
  const [open, setOpen] = React.useState(false);

  const { data: characterCollection, isLoading } =
    api.character.getCharacters.useQuery();

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
        {isLoading ? (
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className="line- text-muted-foreground px-2 py-0"
            disabled
          >
            <Loader2 className="animate-spin" />
            Loading characters...
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className="line- text-muted-foreground px-2 py-0"
          >
            <PlusIcon />
            Add character
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
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
                  keywords={[anyAscii(c.name)]}
                  onSelect={(currentValue) => {
                    handleSelect(currentValue);
                    setOpen(false);
                  }}
                >
                  {c.name}{" "}
                  <span className="text-muted-foreground text-sm">
                    {c.class != "Unknown" ? c.class : ""}
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
