"use client";

import { useState, useEffect, useMemo } from "react";
import { Check, RotateCcw, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { parseAATemplate } from "~/lib/aa-template";
import { AATemplateInlineEditor } from "./aa-template-editor";
import { AATemplateRenderer } from "./aa-template-renderer";

interface AATemplateEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextLabel: string;
  zoneName: string;
  initialTemplate: string;
  hasExistingTemplate: boolean;
  onSave: (template: string) => void;
  onClear: () => void;
  isSaving: boolean;
  onResetToDefault?: () => void;
  isResetting?: boolean;
}

export function AATemplateEditorDialog({
  open,
  onOpenChange,
  contextLabel,
  zoneName,
  initialTemplate,
  hasExistingTemplate,
  onSave,
  onClear,
  isSaving,
  onResetToDefault,
  isResetting,
}: AATemplateEditorDialogProps) {
  const [localTemplate, setLocalTemplate] = useState(initialTemplate);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Re-initialize when dialog opens with new context
  useEffect(() => {
    if (open) {
      setLocalTemplate(initialTemplate);
    }
  }, [open, initialTemplate]);

  const { errors } = useMemo(
    () => parseAATemplate(localTemplate),
    [localTemplate],
  );

  const hasErrors = errors.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle>
            {zoneName} — {contextLabel} AA Template
          </DialogTitle>
          <DialogDescription>
            Use{" "}
            <code className="rounded bg-muted px-1">{"{assign:SlotName}"}</code>{" "}
            to create assignment slots. Use{" "}
            <code className="rounded bg-muted px-1">{"{ref:SlotName}"}</code> to
            mirror a slot&apos;s assignments (read-only).
          </DialogDescription>
        </DialogHeader>

        <div className="grid h-[min(400px,70vh)] grid-cols-2 gap-4">
          {/* Left: Editor */}
          <div className="flex min-h-0 flex-col">
            <AATemplateInlineEditor
              template={localTemplate}
              onChange={setLocalTemplate}
            />
          </div>

          {/* Right: Live preview */}
          <div className="min-h-0 overflow-auto">
            <AATemplateRenderer
              template={localTemplate}
              characters={[]}
              slotAssignments={[]}
              disabled={true}
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <div className="flex gap-2">
            {hasExistingTemplate && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setShowClearConfirm(true)}
                disabled={isSaving}
              >
                Clear template
              </Button>
            )}
            {onResetToDefault && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResetConfirm(true)}
                disabled={isSaving || isResetting}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Reset to Default
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => onSave(localTemplate)}
              disabled={isSaving || hasErrors}
            >
              <Check className="mr-1 h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear the AA template for {contextLabel}?
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowClearConfirm(false);
                onClear();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Default</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current AA template with the default
              template for this zone. Any customizations to the template text
              will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowResetConfirm(false);
                onResetToDefault?.();
              }}
              disabled={isResetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isResetting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset Template"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
