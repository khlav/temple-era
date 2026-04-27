"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { AA_CLASS_COLORS } from "~/lib/aa-formatting";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
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
  viewAsCharacter: { name: string; class: string | null };
  encounterSummaries: CharacterEncounterSummary[];
  allCharacters: RaidPlanCharacter[];
  onEncounterClick: (encounterId: string) => void;
}

export function CharacterSummaryPanel({
  viewAsCharacter,
  encounterSummaries,
  allCharacters,
  onEncounterClick,
}: CharacterSummaryPanelProps) {
  const [showDetails, setShowDetails] = useState(true);

  const classColor = viewAsCharacter.class
    ? (AA_CLASS_COLORS[
        viewAsCharacter.class.toLowerCase().replace(/\s+/g, "")
      ] ?? undefined)
    : undefined;

  const MAX_SUMMARY = 3;
  const summaryEncounters = encounterSummaries.slice(0, MAX_SUMMARY);
  const remainingCount = Math.max(0, encounterSummaries.length - MAX_SUMMARY);

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
      {/* Summary line */}
      <div className="flex items-start justify-between gap-3 px-3 py-2">
        <p className="flex-1 text-sm leading-relaxed">
          {viewAsCharacter.class && (
            <ClassIcon
              characterClass={viewAsCharacter.class}
              px={16}
              className="mr-1 inline-block align-middle"
            />
          )}
          <span
            className="font-bold"
            style={classColor ? { color: classColor } : undefined}
          >
            {viewAsCharacter.name}
          </span>{" "}
          has assignments in{" "}
          {summaryEncounters.map((s, i) => (
            <span key={s.encounterId}>
              <span className="font-semibold text-foreground">
                {s.encounterName}
              </span>
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
          {showDetails ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {showDetails ? "Hide details" : "Show details"}
        </button>
      </div>

      {/* Encounter list — two compact columns, left-aligned */}
      {showDetails && encounterSummaries.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          <TooltipProvider delayDuration={300}>
            <div className="flex items-start gap-x-8">
              {[
                encounterSummaries.slice(
                  0,
                  Math.ceil(encounterSummaries.length / 2),
                ),
                encounterSummaries.slice(
                  Math.ceil(encounterSummaries.length / 2),
                ),
              ].map((col, ci) => (
                <div key={ci} className="flex flex-col">
                  {col.map((summary) => (
                    <Tooltip key={summary.encounterId}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onEncounterClick(summary.encounterId)}
                          className="flex items-center gap-2 py-0.5 text-left text-sm transition-opacity hover:opacity-70"
                        >
                          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
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
                            summary.encounterId !== "default"
                              ? summary.contextId
                              : undefined
                          }
                          raidPlanId={
                            summary.encounterId === "default"
                              ? summary.contextId
                              : undefined
                          }
                          characters={allCharacters}
                          slotAssignments={summary.slotAssignments}
                          disabled
                          hideUnassigned
                          skipDndContext
                        />
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              ))}
            </div>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}
