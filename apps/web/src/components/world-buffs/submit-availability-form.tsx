"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { CircleCheck, UserRound, Shield } from "lucide-react";
import { useSession, signIn } from "next-auth/react";
import { api, type RouterOutputs } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { CharacterSelector } from "~/components/characters/character-selector";
import { ClassIcon } from "~/components/ui/class-icon";
import { WorldBuffIcon } from "./world-buff-icon";
import { cn } from "~/lib/utils";
import {
  WORLD_BUFF_ITEMS,
  WORLD_BUFF_ITEM_LABELS,
  WORLD_BUFF_BY_ITEM,
  WORLD_BUFF_LABELS,
  type WorldBuffItem,
} from "~/lib/world-buffs";

const QUEUE_TYPE_OPTIONS = [
  {
    value: "main",
    label: "Main Characters",
    Icon: CircleCheck,
    pillClassName:
      "peer-data-[state=checked]:border-chart-2/30 peer-data-[state=checked]:bg-chart-2/15 peer-data-[state=checked]:text-chart-2",
  },
  {
    value: "alt",
    label: "Alts",
    Icon: UserRound,
    pillClassName:
      "peer-data-[state=checked]:border-chart-4/30 peer-data-[state=checked]:bg-chart-4/15 peer-data-[state=checked]:text-chart-4",
  },
  {
    value: "backup",
    label: "Backup / Not Urgent",
    Icon: Shield,
    pillClassName:
      "peer-data-[state=checked]:border-primary/30 peer-data-[state=checked]:bg-primary/15 peer-data-[state=checked]:text-primary",
  },
] as const;

type QueueType = (typeof QUEUE_TYPE_OPTIONS)[number]["value"];
type NameMode = "type" | "pick";
type StatusRow = RouterOutputs["worldBuff"]["getAll"][number];

export function SubmitAvailabilityForm() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const utils = api.useUtils();
  const [nameMode, setNameMode] = useState<NameMode>("pick");
  const [characterName, setCharacterName] = useState("");
  const [characterId, setCharacterId] = useState<number | null>(null);
  const [pickedClass, setPickedClass] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<WorldBuffItem>>(new Set());
  const [queueType, setQueueType] = useState<QueueType>("main");
  const [notes, setNotes] = useState("");

  const submitAvailability = api.worldBuff.submitAvailability.useMutation({
    onMutate: async (input) => {
      await utils.worldBuff.getAll.cancel();
      const prevGetAll = utils.worldBuff.getAll.getData();
      const characterNameTrimmed = input.characterName.trim();
      const normalized = characterNameTrimmed.toLowerCase();

      utils.worldBuff.getAll.setData(undefined, (old) => {
        if (!old) return old;
        const idx = old.findIndex(
          (row) => row.characterNameNormalized === normalized && row.item === input.item,
        );
        if (idx >= 0) {
          const existing = old[idx]!;
          const updated: StatusRow = {
            ...existing,
            characterName: characterNameTrimmed,
            characterId: input.characterId ?? existing.characterId,
            queueType: input.queueType ?? existing.queueType,
            notes: input.notes !== undefined ? (input.notes ?? null) : existing.notes,
          };
          return old.map((row, i) => (i === idx ? updated : row));
        }
        const optimisticRow: StatusRow = {
          id: `optimistic-${crypto.randomUUID()}`,
          characterName: characterNameTrimmed,
          characterNameNormalized: normalized,
          characterId: input.characterId ?? null,
          item: input.item,
          state: "ready_to_drop",
          queueType: input.queueType ?? "main",
          notes: input.notes ?? null,
          droppedAt: null,
          markedInactiveAt: null,
          createdById: session?.user?.id ?? "",
          updatedById: session?.user?.id ?? "",
          createdAt: new Date(),
          updatedAt: new Date(),
          assignments: [],
          characterClass: pickedClass,
          primaryCharacterName: null,
          discordUserId: null,
          discordUsername: null,
          isIdle: false,
          idleLastRaidAt: null,
        };
        return [...old, optimisticRow];
      });

      return { prevGetAll };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevGetAll) utils.worldBuff.getAll.setData(undefined, ctx.prevGetAll);
      toast({ title: "Failed to submit", description: error.message, variant: "destructive" });
    },
    onSettled: () => {
      void utils.worldBuff.getAll.invalidate();
    },
  });

  const toggleItem = (item: WorldBuffItem) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const resetForm = () => {
    setNameMode("pick");
    setCharacterName("");
    setCharacterId(null);
    setPickedClass(null);
    setSelectedItems(new Set());
    setQueueType("main");
    setNotes("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = characterName.trim();
    if (!trimmedName || selectedItems.size === 0) return;

    await Promise.all(
      Array.from(selectedItems).map((item) =>
        submitAvailability.mutateAsync({
          characterName: trimmedName,
          characterId: characterId ?? undefined,
          item,
          queueType,
          notes: notes.trim() || null,
        }),
      ),
    );

    toast({
      title: "Availability submitted",
      description: `${trimmedName} marked ready for ${selectedItems.size} item${selectedItems.size === 1 ? "" : "s"}`,
    });
    resetForm();
  };

  return (
    <div className="relative h-full">
      <Card
        className={cn(
          "h-full transition-all duration-300",
          !session && "pointer-events-none select-none opacity-50 blur-[2px]",
        )}
      >
        <CardHeader>
          <CardTitle className="text-base">Join the drop list</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wb-character-name" className="sr-only">
                Character name
              </Label>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  {nameMode === "type" ? (
                    <Input
                      id="wb-character-name"
                      value={characterName}
                      onChange={(e) => {
                        setCharacterName(e.target.value);
                        setCharacterId(null);
                        setPickedClass(null);
                      }}
                      placeholder="e.g. Dunckan"
                      maxLength={128}
                      required
                    />
                  ) : (
                    <CharacterSelector
                      characterSet="all"
                      onSelectAction={(character) => {
                        setCharacterName(character.name);
                        setCharacterId(character.characterId);
                        setPickedClass(character.class);
                        // Default the queue based on whether this character has a primary
                        // linked (i.e. it's an alt) — the raid lead can still override manually.
                        setQueueType(character.primaryCharacterId ? "alt" : "main");
                      }}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        className="h-10 w-full justify-start px-3 text-base font-normal text-muted-foreground md:text-sm"
                      >
                        {characterName ? (
                          <span className="flex items-center gap-2 text-foreground">
                            {pickedClass && <ClassIcon characterClass={pickedClass} px={16} />}
                            {characterName}
                          </span>
                        ) : (
                          "Select a character..."
                        )}
                      </Button>
                    </CharacterSelector>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={nameMode === "pick" ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setNameMode("pick")}
                  >
                    Pick a character
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={nameMode === "type" ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setNameMode("type")}
                  >
                    Type a name
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {nameMode === "type"
                  ? "Doesn't need to be in the raid roster yet — this works for characters who haven't raided."
                  : "Only characters appearing in raid logs show up here."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Which item(s) are you ready to drop?</Label>
                <div className="space-y-2 pt-1.5">
                  {WORLD_BUFF_ITEMS.map((item) => {
                    const checked = selectedItems.has(item);
                    return (
                      <div key={item} className="flex items-start gap-2">
                        <Checkbox
                          id={`wb-item-${item}`}
                          checked={checked}
                          onCheckedChange={() => toggleItem(item)}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={`wb-item-${item}`}
                          className="flex cursor-pointer items-start gap-2 text-sm font-normal leading-5"
                        >
                          <WorldBuffIcon
                            item={item}
                            size={36}
                            className={cn(
                              "shrink-0 rounded-sm transition-all duration-150",
                              checked ? "opacity-100 grayscale-0" : "opacity-40 grayscale",
                            )}
                          />
                          <span>
                            <span className="block">{WORLD_BUFF_ITEM_LABELS[item]}</span>
                            <span className="block text-xs text-muted-foreground">
                              {WORLD_BUFF_LABELS[WORLD_BUFF_BY_ITEM[item]]}
                            </span>
                          </span>
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Which drop list?</Label>
                <RadioGroup
                  value={queueType}
                  onValueChange={(v) => setQueueType(v as QueueType)}
                  className="flex flex-col gap-2 pt-1.5"
                >
                  {QUEUE_TYPE_OPTIONS.map((opt) => (
                    <div key={opt.value}>
                      <RadioGroupItem
                        value={opt.value}
                        id={`wb-queue-type-${opt.value}`}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={`wb-queue-type-${opt.value}`}
                        className={cn(
                          "inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                          opt.pillClassName,
                        )}
                      >
                        {opt.label}
                        <opt.Icon className="h-3.5 w-3.5" />
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wb-notes">Notes (optional)</Label>
              <Input
                id="wb-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={submitAvailability.isPending}
              >
                Clear
              </Button>
              <Button
                type="submit"
                disabled={
                  submitAvailability.isPending || !characterName.trim() || selectedItems.size === 0
                }
              >
                Register drops
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {!session && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg border bg-card/80 p-6 text-center shadow-lg backdrop-blur-xs">
            <div className="flex flex-col items-center gap-4">
              <Button
                onClick={() => signIn("discord", { redirectTo: "/world-buffs" })}
                className="flex w-full items-center justify-center gap-2 bg-[#5865F2] text-white hover:bg-[#8891f2] sm:w-auto"
              >
                <Image src="/img/discord-mark-white.svg" alt="Discord" height={18} width={18} />
                Sign in with Discord
              </Button>
              <p className="text-sm text-muted-foreground">
                to submit your character&apos;s availability.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
