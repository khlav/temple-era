"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Save, AlertTriangle } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { parseAATemplate, getSlotDefinitions } from "~/lib/aa-template";
import { cn } from "~/lib/utils";

interface AATemplateEditorProps {
  template: string;
  onSave: (template: string) => void;
  isSaving?: boolean;
  disabled?: boolean;
}

export function AATemplateEditor({
  template,
  onSave,
  isSaving,
  disabled,
}: AATemplateEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editedTemplate, setEditedTemplate] = useState(template);
  const [hasChanges, setHasChanges] = useState(false);

  // Parse the edited template for validation
  const { errors } = useMemo(
    () => parseAATemplate(editedTemplate),
    [editedTemplate],
  );

  // Get unique slot definitions
  const slotDefinitions = useMemo(
    () => getSlotDefinitions(editedTemplate),
    [editedTemplate],
  );

  const handleTemplateChange = (value: string) => {
    setEditedTemplate(value);
    setHasChanges(value !== template);
  };

  const handleSave = () => {
    if (errors.length > 0) return;
    onSave(editedTemplate);
    setHasChanges(false);
  };

  const handleReset = () => {
    setEditedTemplate(template);
    setHasChanges(false);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Edit Template
          {hasChanges && (
            <span className="ml-auto rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-600">
              Unsaved
            </span>
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 pt-3">
        {/* Template textarea */}
        <Textarea
          value={editedTemplate}
          onChange={(e) => handleTemplateChange(e.target.value)}
          placeholder="Enter AA template with {assign:SlotName} placeholders..."
          className="min-h-[200px] font-mono text-sm"
          disabled={disabled || isSaving}
        />

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              {errors.map((error, i) => (
                <div key={i}>{error}</div>
              ))}
            </div>
          </div>
        )}

        {/* Detected slots */}
        {slotDefinitions.length > 0 && (
          <div className="rounded-md border bg-muted/50 p-2">
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              Detected Slots ({slotDefinitions.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {slotDefinitions.map((slot) => (
                <span
                  key={slot.name}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs",
                    "bg-primary/10 text-primary",
                  )}
                >
                  {slot.name}
                  {slot.maxCharacters && (
                    <span className="ml-1 opacity-70">
                      (max {slot.maxCharacters})
                    </span>
                  )}
                  {slot.noColor && (
                    <span className="ml-1 opacity-70">(no color)</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Syntax help */}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            Slot Syntax Help
          </summary>
          <div className="mt-2 space-y-1 rounded-md border bg-muted/30 p-2 font-mono">
            <div>
              <code>{"{assign:SlotName}"}</code> - Basic slot
            </div>
            <div>
              <code>{"{assign:SlotName:4}"}</code> - Max 4 characters
            </div>
            <div>
              <code>{"{assign:SlotName:nocolor}"}</code> - No class coloring
            </div>
            <div>
              <code>{"{assign:SlotName:4:nocolor}"}</code> - Both options
            </div>
          </div>
        </details>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2">
          {hasChanges && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isSaving}
            >
              Reset
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || errors.length > 0 || disabled || isSaving}
          >
            {isSaving ? (
              "Saving..."
            ) : (
              <>
                <Save className="mr-1 h-4 w-4" />
                Save Template
              </>
            )}
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Inline editor variant for simpler use cases
 */
interface AATemplateInlineEditorProps {
  template: string;
  onChange: (template: string) => void;
  disabled?: boolean;
}

export function AATemplateInlineEditor({
  template,
  onChange,
  disabled,
}: AATemplateInlineEditorProps) {
  const { errors } = useMemo(() => parseAATemplate(template), [template]);
  const slotDefinitions = useMemo(
    () => getSlotDefinitions(template),
    [template],
  );

  return (
    <div className="space-y-2">
      <Textarea
        value={template}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter AA template with {assign:SlotName} placeholders..."
        className="min-h-[150px] font-mono text-sm"
        disabled={disabled}
      />

      {errors.length > 0 && (
        <div className="text-xs text-destructive">
          {errors.map((error, i) => (
            <div key={i}>{error}</div>
          ))}
        </div>
      )}

      {slotDefinitions.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Slots: {slotDefinitions.map((s) => s.name).join(", ")}
        </div>
      )}
    </div>
  );
}
