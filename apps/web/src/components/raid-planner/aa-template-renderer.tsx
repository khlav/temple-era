"use client";

import { useMemo, useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Copy, Check } from "lucide-react";
import { Button } from "~/components/ui/button";
import { ClassIcon } from "~/components/ui/class-icon";
import {
  parseAATemplate,
  renderAATemplate,
  type AACharacterAssignment,
} from "~/lib/aa-template";
import { AASlotInline } from "./aa-slot-dropzone";
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
  onRemove?: (planCharacterId: string) => void;
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
  const [copied, setCopied] = useState(false);
  const [activeCharacter, setActiveCharacter] =
    useState<RaidPlanCharacter | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  // Parse template to get slot definitions
  const { slots, errors } = useMemo(
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

  // Build character lookup for drag
  const characterLookup = useMemo(() => {
    const map = new Map<string, RaidPlanCharacter>();
    for (const char of characters) {
      map.set(char.id, char);
    }
    return map;
  }, [characters]);

  // Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    // Build the assignment map for rendering
    const assignmentMap = new Map<string, AACharacterAssignment[]>();
    for (const [slotName, chars] of slotCharacterMap) {
      assignmentMap.set(
        slotName,
        chars.map((c) => ({ name: c.name, class: c.class })),
      );
    }

    const output = renderAATemplate(template, assignmentMap);
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [template, slotCharacterMap]);

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

  // Render template with interactive slots
  const renderedContent = useMemo(() => {
    if (slots.length === 0) {
      // No slots found - just show the raw template
      return <pre className="whitespace-pre-wrap text-sm">{template}</pre>;
    }

    // Build the rendered output with inline slot components
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    // Sort slots by startIndex
    const sortedSlots = [...slots].sort((a, b) => a.startIndex - b.startIndex);

    for (const slot of sortedSlots) {
      // Add text before this slot
      if (slot.startIndex > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {template.slice(lastIndex, slot.startIndex)}
          </span>,
        );
      }

      // Add the slot component
      const slotChars = slotCharacterMap.get(slot.name) ?? [];
      const contextId = encounterId ?? raidPlanId ?? "unknown";

      parts.push(
        <AASlotInline
          key={`slot-${slot.startIndex}`}
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
          onRemove={disabled ? undefined : onRemove}
          disabled={disabled}
        />,
      );

      lastIndex = slot.endIndex;
    }

    // Add any remaining text
    if (lastIndex < template.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>{template.slice(lastIndex)}</span>,
      );
    }

    return (
      <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
        {parts}
      </pre>
    );
  }, [
    template,
    slots,
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
      <div className="rounded-lg border bg-card p-3">{renderedContent}</div>

      {/* Copy button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={disabled}
        >
          {copied ? (
            <>
              <Check className="mr-1 h-4 w-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="mr-1 h-4 w-4" />
              Copy for WoW
            </>
          )}
        </Button>
      </div>

      {/* Slot summary */}
      {slots.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {slots.length} slot{slots.length !== 1 ? "s" : ""} defined:{" "}
          {slots.map((s) => s.name).join(", ")}
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
