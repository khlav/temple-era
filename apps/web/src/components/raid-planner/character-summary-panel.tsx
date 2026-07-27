"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { AA_CLASS_COLORS } from "~/lib/aa-formatting";
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

const HOVER_DELAY_MS = 150;
const TOOLTIP_OFFSET = 16;
const VIEWPORT_MARGIN = 8;

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

/** A tooltip that tracks and follows the cursor, clamped to stay within the viewport. */
function MouseTooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + TOOLTIP_OFFSET, top: y + TOOLTIP_OFFSET });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = x + TOOLTIP_OFFSET;
    let top = y + TOOLTIP_OFFSET;
    if (left + rect.width > window.innerWidth - VIEWPORT_MARGIN) {
      left = x - rect.width - TOOLTIP_OFFSET;
    }
    if (top + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
      top = y - rect.height - TOOLTIP_OFFSET;
    }
    setPos({ left: Math.max(VIEWPORT_MARGIN, left), top: Math.max(VIEWPORT_MARGIN, top) });
  }, [x, y]);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left: pos.left, top: pos.top }}
      className="pointer-events-none z-50 w-auto max-w-sm overflow-hidden rounded-md bg-card text-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
    >
      {children}
    </div>
  );
}

export function CharacterSummaryPanel({
  viewerPlanCharacterIds,
  encounterSummaries,
  allCharacters,
  onEncounterClick,
}: CharacterSummaryPanelProps) {
  const [showDetails, setShowDetails] = useState(true);
  const [hoveredEncounterId, setHoveredEncounterId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const handleRowMouseEnter = (encounterId: string, e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setHoveredEncounterId(encounterId), HOVER_DELAY_MS);
  };

  const handleRowMouseLeave = (encounterId: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredEncounterId((current) => (current === encounterId ? null : current));
  };

  const characterById = useMemo(
    () => new Map(allCharacters.map((c) => [c.id, c])),
    [allCharacters],
  );

  const assignedCharacters = useMemo(
    () => assignedCharactersFor(encounterSummaries, viewerPlanCharacterIds, characterById),
    [encounterSummaries, viewerPlanCharacterIds, characterById],
  );

  const hoveredSummary = useMemo(
    () => encounterSummaries.find((s) => s.encounterId === hoveredEncounterId) ?? null,
    [encounterSummaries, hoveredEncounterId],
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
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            {encounterSummaries.map((summary) => {
              const encounterCharacters = assignedCharactersFor(
                [summary],
                viewerPlanCharacterIds,
                characterById,
              );

              return (
                <button
                  key={summary.encounterId}
                  type="button"
                  onClick={() => onEncounterClick(summary.encounterId)}
                  onMouseEnter={(e) => handleRowMouseEnter(summary.encounterId, e)}
                  onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => handleRowMouseLeave(summary.encounterId)}
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
              );
            })}
          </div>
        </div>
      )}

      {hoveredSummary &&
        mousePos &&
        createPortal(
          <MouseTooltip x={mousePos.x} y={mousePos.y}>
            <AATemplateRenderer
              template={hoveredSummary.template}
              encounterId={
                hoveredSummary.encounterId !== "default" ? hoveredSummary.contextId : undefined
              }
              raidPlanId={
                hoveredSummary.encounterId === "default" ? hoveredSummary.contextId : undefined
              }
              characters={allCharacters}
              slotAssignments={hoveredSummary.slotAssignments}
              disabled
              hideUnassigned
              skipDndContext
            />
          </MouseTooltip>,
          document.body,
        )}
    </div>
  );
}
