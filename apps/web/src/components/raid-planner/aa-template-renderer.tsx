"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AlertTriangle } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { AAIcon } from "~/components/ui/aa-icons";
import {
  parseAATemplate,
  renderAATemplate,
  type AACharacterAssignment,
} from "~/lib/aa-template";
import { parseAAFormatting } from "~/lib/aa-formatting";
import { AASlotInline, AARefInline } from "./aa-slot-dropzone";
import type { RaidPlanCharacter } from "./raid-plan-groups-grid";

export interface AASlotAssignment {
  id: string;
  encounterId: string | null;
  raidPlanId: string | null;
  planCharacterId: string;
  slotName: string;
  sortOrder: number;
}

interface AATemplateRendererProps {
  template: string;
  /** Either encounterId or raidPlanId for the context */
  encounterId?: string;
  raidPlanId?: string;
  characters: RaidPlanCharacter[];
  slotAssignments: AASlotAssignment[];
  onAssign?: (planCharacterId: string, slotName: string) => void;
  onRemove?: (planCharacterId: string, slotName: string) => void;
  /** Future: reorder within slots */
  onReorder?: (slotName: string, planCharacterIds: string[]) => void;
  disabled?: boolean;
  /** Skip internal DndContext - parent will provide one */
  skipDndContext?: boolean;
}

export function AATemplateRenderer({
  template,
  encounterId,
  raidPlanId,
  characters,
  slotAssignments,
  onAssign,
  onRemove,
  onReorder: _onReorder,
  disabled,
  skipDndContext,
}: AATemplateRendererProps) {
  const [activeCharacter, setActiveCharacter] =
    useState<RaidPlanCharacter | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  // Parse template to get slot definitions and ref definitions
  const { slots, refs, errors } = useMemo(
    () => parseAATemplate(template),
    [template],
  );

  // Build a map of slot name -> assigned characters
  const slotCharacterMap = useMemo(() => {
    const map = new Map<
      string,
      {
        planCharacterId: string;
        name: string;
        class: string | null;
        sortOrder: number;
      }[]
    >();

    for (const assignment of slotAssignments) {
      const char = characters.find((c) => c.id === assignment.planCharacterId);
      if (!char) continue;

      const existing = map.get(assignment.slotName) ?? [];
      existing.push({
        planCharacterId: assignment.planCharacterId,
        name: char.characterName,
        class: char.class,
        sortOrder: assignment.sortOrder,
      });
      map.set(assignment.slotName, existing);
    }

    // Sort each slot's characters by sortOrder
    for (const [slotName, chars] of map) {
      chars.sort((a, b) => a.sortOrder - b.sortOrder);
      map.set(slotName, chars);
    }

    return map;
  }, [slotAssignments, characters]);

  // Find characters assigned to multiple slots
  const multiSlotCharacters = useMemo(() => {
    const charSlotCounts = new Map<string, string[]>();

    for (const assignment of slotAssignments) {
      const existing = charSlotCounts.get(assignment.planCharacterId) ?? [];
      existing.push(assignment.slotName);
      charSlotCounts.set(assignment.planCharacterId, existing);
    }

    const multiAssigned: { name: string; slots: string[] }[] = [];
    for (const [charId, slotNames] of charSlotCounts) {
      if (slotNames.length > 1) {
        const char = characters.find((c) => c.id === charId);
        if (char) {
          multiAssigned.push({
            name: char.characterName,
            slots: slotNames,
          });
        }
      }
    }

    return multiAssigned;
  }, [slotAssignments, characters]);

  // Build character lookup for drag
  const characterLookup = useMemo(() => {
    const map = new Map<string, RaidPlanCharacter>();
    for (const char of characters) {
      map.set(char.id, char);
    }
    return map;
  }, [characters]);

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const charId = event.active.id as string;
    const char = characterLookup.get(charId);
    setActiveCharacter(char ?? null);
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCharacter(null);

    const { active, over } = event;
    if (!over || !onAssign) return;

    const charId = active.id as string;
    const dropId = over.id as string;

    // Parse drop target: "aa-slot:{contextId}:{slotName}"
    if (dropId.startsWith("aa-slot:")) {
      const parts = dropId.split(":");
      const slotName = parts.slice(2).join(":"); // Handle slot names with colons
      onAssign(charId, slotName);
    }
  };

  // Render template with interactive slots and full AA formatting
  const renderedContent = useMemo(() => {
    // Parse the full AA formatting
    const segments = parseAAFormatting(template, slots, refs);

    if (segments.length === 0) {
      return <pre className="whitespace-pre-wrap text-sm">{template}</pre>;
    }

    const contextId = encounterId ?? raidPlanId ?? "unknown";

    // Render each segment
    const parts: React.ReactNode[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const key = `seg-${i}`;

      switch (segment.type) {
        case "text":
          parts.push(<span key={key}>{segment.content}</span>);
          break;

        case "colored-text":
          parts.push(
            <span key={key} style={{ color: segment.color }}>
              {segment.content}
            </span>,
          );
          break;

        case "icon":
          if (segment.iconType && segment.iconName) {
            parts.push(
              <AAIcon
                key={key}
                type={segment.iconType}
                name={segment.iconName}
                size={18}
              />,
            );
          }
          break;

        case "slot":
          if (segment.slotDef) {
            const slot = segment.slotDef;
            const slotChars = slotCharacterMap.get(slot.name) ?? [];
            parts.push(
              <AASlotInline
                key={key}
                slotName={slot.name}
                encounterId={contextId}
                characters={slotChars.map((c) => ({
                  planCharacterId: c.planCharacterId,
                  characterName: c.name,
                  characterClass: c.class,
                  sortOrder: c.sortOrder,
                }))}
                maxCharacters={slot.maxCharacters}
                noColor={slot.noColor}
                onRemove={
                  disabled || !onRemove
                    ? undefined
                    : (charId) => onRemove(charId, slot.name)
                }
                disabled={disabled}
              />,
            );
          }
          break;

        case "ref":
          if (segment.refDef) {
            const refDef = segment.refDef;
            const matchedSlot = slots.find(
              (s) => s.name.toLowerCase() === refDef.name.toLowerCase(),
            );

            if (!matchedSlot) {
              // Unmatched ref: render with yellow warning
              parts.push(
                <span
                  key={key}
                  className="inline-flex items-center gap-0.5 text-yellow-500"
                >
                  <AlertTriangle className="inline h-3 w-3" />
                  <code className="text-xs">{`{ref:${refDef.name}}`}</code>
                </span>,
              );
            } else {
              const refChars = slotCharacterMap.get(refDef.name) ?? [];
              // Determine noColor: use ref's own noColor if set, else inherit from the referenced slot
              const refNoColor =
                refDef.noColor !== undefined
                  ? refDef.noColor
                  : matchedSlot.noColor;
              parts.push(
                <AARefInline
                  key={key}
                  slotName={refDef.name}
                  characters={refChars.map((c) => ({
                    planCharacterId: c.planCharacterId,
                    characterName: c.name,
                    characterClass: c.class,
                    sortOrder: c.sortOrder,
                  }))}
                  noColor={refNoColor}
                />,
              );
            }
          }
          break;
      }
    }

    return (
      <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
        {parts}
      </pre>
    );
  }, [
    template,
    slots,
    refs,
    slotCharacterMap,
    encounterId,
    raidPlanId,
    onRemove,
    disabled,
  ]);

  const content = (
    <div className="space-y-3">
      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
          {errors.map((error, i) => (
            <div key={i}>{error}</div>
          ))}
        </div>
      )}

      {/* Template preview */}
      <div className="relative rounded-lg border bg-card p-3">
        {renderedContent}

        {/* Slot summary */}
        {slots.length > 0 && slotCharacterMap.size != slots.length && (
          <div className="absolute right-2 top-2 flex items-center gap-1 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3" />
            {slots.length - slotCharacterMap.size} empty assignment
            {slots.length - slotCharacterMap.size !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Multi-slot warning */}
      {multiSlotCharacters.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
          <div>
            <div className="font-medium">
              Character{multiSlotCharacters.length > 1 ? "s" : ""} assigned to
              multiple slots:
            </div>
            <ul className="mt-1 list-inside list-disc text-xs">
              {multiSlotCharacters.map((c) => (
                <li key={c.name}>
                  {c.name}: {c.slots.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );

  // Skip internal DndContext if parent provides one
  if (skipDndContext) {
    return content;
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {content}

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeCharacter && (
          <div className="flex items-center gap-1 rounded bg-card px-2 py-1 text-xs font-medium shadow-lg ring-2 ring-primary/50">
            {activeCharacter.class && (
              <ClassIcon characterClass={activeCharacter.class} px={14} />
            )}
            {activeCharacter.characterName}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Simple preview mode without drag-drop functionality
 */
interface AATemplatePreviewProps {
  template: string;
  slotAssignments: Map<string, AACharacterAssignment[]>;
}

export function AATemplatePreview({
  template,
  slotAssignments,
}: AATemplatePreviewProps) {
  const output = useMemo(
    () => renderAATemplate(template, slotAssignments),
    [template, slotAssignments],
  );

  return (
    <pre className="whitespace-pre-wrap rounded-lg border bg-card p-3 font-mono text-sm">
      {output}
    </pre>
  );
}
