import type { toast as toastType } from "~/hooks/use-toast";
import { Check } from "lucide-react";
import type {
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import { SortRaiders } from "~/lib/helpers";

export const toastCharacterSaved = (
  toast: typeof toastType,
  character: RaidParticipant,
  secondaryCharacters: RaidParticipantCollection,
) => {
  const altNames = Object.values(secondaryCharacters)
    .sort(SortRaiders)
    .map((c) => c.name)
    .join(", ");
  toast({
    // @ts-expect-error Accepts <Element> just fine.  Ignore type safety concern.
    title: (
      <div>
        <div className="flex flex-row">
          <div className="shrink">
            <Check className="inline-block pr-1 text-emerald-700" />
          </div>
          <div className="grow">{character.name} saved</div>
        </div>
        <div className="text-xs font-normal text-muted-foreground">
          Alts: {altNames}
        </div>
      </div>
    ),
  });
};
