"use client";

import { useState } from "react";
import { Loader2, Pencil, RotateCcw } from "lucide-react";
import { Button } from "~/components/ui/button";
import { AATemplateRenderer } from "./aa-template-renderer";
import { AATemplateEditorDialog } from "./aa-template-editor-dialog";
import type { RaidPlanCharacter, AASlotAssignment } from "./types";

interface AAPanelProps {
  template: string | null;
  onSaveTemplate?: (template: string) => void;
  characters: RaidPlanCharacter[];
  slotAssignments: AASlotAssignment[];
  onAssign?: (planCharacterId: string, slotName: string) => void;
  onRemove?: (planCharacterId: string, slotName: string) => void;
  onReorder?: (slotName: string, planCharacterIds: string[]) => void;
  contextId: string;
  contextLabel: string;
  zoneName: string;
  isSaving?: boolean;
  defaultTemplate?: string | null;
  onResetToDefault?: () => void;
  isResetting?: boolean;
  readOnly?: boolean;
  userCharacterIds?: number[];
}

export function AAPanel({
  template,
  onSaveTemplate,
  characters,
  slotAssignments,
  onAssign,
  onRemove,
  onReorder,
  contextId,
  contextLabel,
  zoneName,
  isSaving,
  defaultTemplate,
  onResetToDefault,
  isResetting,
  readOnly,
  userCharacterIds = [],
}: AAPanelProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const hasDefaultTemplate = !!defaultTemplate;

  // If no template yet, show create options (unless readOnly)
  if (!template) {
    if (readOnly) {
      return (
        <div className="rounded-lg border border-dashed p-6">
          <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
            No AA template configured
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4 rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">
          Create an AA template with <code>{"{assign:SlotName}"}</code>{" "}
          placeholders, then drag characters from the groups to assign them. Use{" "}
          <code>{"{ref:SlotName}"}</code> to mirror a slot in multiple places.
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditorOpen(true)}
            className="w-full"
          >
            <Pencil className="mr-2 h-4 w-4" />
            Create Template
          </Button>
          {hasDefaultTemplate && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onResetToDefault?.()}
              disabled={isResetting}
              className="w-full"
            >
              {isResetting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Load Default Template
                </>
              )}
            </Button>
          )}
        </div>
        <AATemplateEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          contextLabel={contextLabel}
          zoneName={zoneName}
          initialTemplate=""
          hasExistingTemplate={false}
          onSave={(t) => {
            onSaveTemplate?.(t);
            setEditorOpen(false);
          }}
          onClear={() => {}}
          isSaving={isSaving ?? false}
        />
      </div>
    );
  }

  // Show full AA interface with renderer + edit button
  return (
    <div className="space-y-4">
      <AATemplateRenderer
        template={template}
        encounterId={contextId.includes("-") ? contextId : undefined}
        raidPlanId={!contextId.includes("-") ? contextId : undefined}
        characters={characters}
        slotAssignments={slotAssignments}
        onAssign={readOnly ? undefined : onAssign}
        onRemove={readOnly ? undefined : onRemove}
        onReorder={readOnly ? undefined : onReorder}
        disabled={readOnly}
        skipDndContext
        userCharacterIds={userCharacterIds}
      />

      {!readOnly && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => setEditorOpen(true)}
          >
            <Pencil className="h-4 w-4" />
            Edit Template
          </Button>

          <AATemplateEditorDialog
            open={editorOpen}
            onOpenChange={setEditorOpen}
            contextLabel={contextLabel}
            zoneName={zoneName}
            initialTemplate={template}
            hasExistingTemplate={true}
            onSave={(t) => {
              onSaveTemplate?.(t);
              setEditorOpen(false);
            }}
            onClear={() => {
              onSaveTemplate?.("");
              setEditorOpen(false);
            }}
            isSaving={isSaving ?? false}
            onResetToDefault={
              hasDefaultTemplate
                ? () => {
                    onResetToDefault?.();
                    setEditorOpen(false);
                  }
                : undefined
            }
            isResetting={isResetting}
          />
        </>
      )}
    </div>
  );
}
