"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { AA_CLASS_COLORS } from "~/lib/aa-formatting";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { AATemplateRenderer } from "./aa-template-renderer";
import type { RaidPlanCharacter, AASlotAssignment } from "./types";

export interface CharacterEncounterSummary {
  encounterId: string | "default";
  encounterName: string;
  slotNames: string[];
  template: string;
  slotAssignments: AASlotAssignment[];
  contextId: string;
}

interface CharacterSummaryPanelProps {
  viewerPlanCharacterIds: Set<string>;
  encounterSummaries: CharacterEncounterSummary[];
  allCharacters: RaidPlanCharacter[];
  onEncounterClick: (encounterId: string) => void;
}

function classColorFor(characterClass: string | null): string | undefined {
  return characterClass
    ? (AA_CLASS_COLORS[characterClass.toLowerCase().replace(/\s+/g, "")] ?? undefined)
    : undefined;
}

/** Unique rostered characters (from the viewer's family) assigned within the given summaries. */
function assignedCharactersFor(
  summaries: CharacterEncounterSummary[],
  viewerPlanCharacterIds: Set<string>,
  characterById: Map<string, RaidPlanCharacter>,
): RaidPlanCharacter[] {
  const ids = new Set<string>();
  for (const summary of summaries) {
    for (const assignment of summary.slotAssignments) {
      if (viewerPlanCharacterIds.has(assignment.planCharacterId)) {
        ids.add(assignment.planCharacterId);
      }
    }
  }
  return [...ids].map((id) => characterById.get(id)).filter((c): c is RaidPlanCharacter => !!c);
}

export function CharacterSummaryPanel({
  viewerPlanCharacterIds,
  encounterSummaries,
  allCharacters,
  onEncounterClick,
}: CharacterSummaryPanelProps) {
  const [showDetails, setShowDetails] = useState(true);

  const characterById = useMemo(
    () => new Map(allCharacters.map((c) => [c.id, c])),
    [allCharacters],
  );

  const assignedCharacters = useMemo(
    () => assignedCharactersFor(encounterSummaries, viewerPlanCharacterIds, characterById),
    [encounterSummaries, viewerPlanCharacterIds, characterById],
  );

  const MAX_SUMMARY = 3;
  const summaryEncounters = encounterSummaries.slice(0, MAX_SUMMARY);
  const remainingCount = Math.max(0, encounterSummaries.length - MAX_SUMMARY);

  if (assignedCharacters.length === 0) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
      {/* Summary line */}
      <div className="flex items-start justify-between gap-3 px-3 py-2">
        <p className="flex-1 text-sm leading-relaxed">
          {assignedCharacters.map((char, i) => (
            <span key={char.id}>
              {char.class && (
                <ClassIcon
                  characterClass={char.class}
                  px={16}
                  className="mr-1 inline-block align-middle"
                />
              )}
              <span className="font-bold" style={{ color: classColorFor(char.class) }}>
                {char.characterName}
              </span>
              {i < assignedCharacters.length - 1 ? ", " : " "}
            </span>
          ))}
          {assignedCharacters.length > 1 ? "have" : "has"} assignments in{" "}
          {summaryEncounters.map((s, i) => (
            <span key={s.encounterId}>
              <span className="font-semibold text-foreground">{s.encounterName}</span>
              {i < summaryEncounters.length - 1 ? ", " : ""}
            </span>
          ))}
          {remainingCount > 0 &&
            `, and ${remainingCount} more encounter${remainingCount !== 1 ? "s" : ""}.`}
        </p>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-muted-foreground hover:text-foreground"
        >
          {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showDetails ? "Hide details" : "Show details"}
        </button>
      </div>

      {/* Encounter list — single column on mobile, two columns on larger screens */}
      {showDetails && encounterSummaries.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          <TooltipProvider delayDuration={300}>
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              {encounterSummaries.map((summary) => {
                const encounterCharacters = assignedCharactersFor(
                  [summary],
                  viewerPlanCharacterIds,
                  characterById,
                );

                return (
                  <Tooltip key={summary.encounterId}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onEncounterClick(summary.encounterId)}
                        className="flex items-center gap-2 py-0.5 text-left text-sm transition-opacity hover:opacity-70"
                      >
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                        <div className="flex shrink-0 items-center gap-0.5">
                          {encounterCharacters.map(
                            (char) =>
                              char.class && (
                                <ClassIcon
                                  key={char.id}
                                  characterClass={char.class}
                                  px={14}
                                  className="shrink-0"
                                />
                              ),
                          )}
                        </div>
                        <span className="shrink-0 font-semibold text-foreground">
                          {summary.encounterName}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {summary.slotNames.map((name) => (
                            <span
                              key={name}
                              className="inline-block rounded border border-purple-500/25 bg-purple-500/10 px-1 text-xs font-medium text-purple-300"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="w-auto max-w-sm bg-card p-0 text-foreground shadow-xl"
                    >
                      <AATemplateRenderer
                        template={summary.template}
                        encounterId={
                          summary.encounterId !== "default" ? summary.contextId : undefined
                        }
                        raidPlanId={
                          summary.encounterId === "default" ? summary.contextId : undefined
                        }
                        characters={allCharacters}
                        slotAssignments={summary.slotAssignments}
                        disabled
                        hideUnassigned
                        skipDndContext
                      />
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}
