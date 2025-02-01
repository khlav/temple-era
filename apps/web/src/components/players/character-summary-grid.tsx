"use client";
import type {
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import { Reshape1DTo2D } from "~/lib/helpers";
import anyAscii from "any-ascii";
import { ClassIcon } from "~/components/ui/class-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export const CharacterSummaryGrid = ({
  characters,
  numRows = 3,
  iconPx = 18,
}: {
  characters: RaidParticipantCollection;
  numRows?: number;
  iconPx?: number;
}) => {
  function groupByClass(characters: RaidParticipant[], rows: number) {
    const grouped: Record<string, RaidParticipant[]> = {};

    for (const char of characters) {
      if (!grouped[char.class]) {
        grouped[char.class] = [];
      }
      (grouped[char.class] ?? []).push(char);
    }

    return Object.entries(grouped).map(([charClass, members]) => ({
      class: charClass,
      members: Reshape1DTo2D(members, rows),
    }));
  }

  const sortedCharacterList = Object.values(characters).sort((c1, c2) =>
    `${c1.class}_${anyAscii(c1.name)}` > `${c2.class}_${anyAscii(c2.name)}`
      ? 1
      : -1,
  );

  const sortedCharacterClassMatrixWithSubgroups = groupByClass(
    sortedCharacterList,
    numRows,
  ) as unknown as {
    class: string;
    members: RaidParticipant[][];
  }[];

  return (
    <div className={"flex flex-row gap-x-1 items-start transition-all " + (sortedCharacterList.length > 0 ? "opacity-100" : "opacity-0")} >
      {(sortedCharacterClassMatrixWithSubgroups ?? []).map((classObj, i) => (
        <Tooltip key={`class_${i}`}>
          <TooltipTrigger>
            <div className="flex w-min flex-row gap-x-0">
              {(classObj.members ?? []).map((characterSegment, j) => (
                <div key={`class_${j}`} className="flex w-min flex-col">
                  {(characterSegment ?? []).map((c: RaidParticipant) => (
                    <div key={`item_${j}_${c.characterId}`} className="w-5">
                      <ClassIcon
                        key={c.characterId}
                        characterClass={c.class.toLowerCase()}
                        px={iconPx}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={5} className="rounded bg-secondary text-muted-foreground">
            <div>
            {classObj.members.flat().map((character) => (
              <div key={character.characterId}>{character.name}</div>
            ))}
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
};
