"use client";

import { useRef, useCallback } from "react";
import { Textarea } from "~/components/ui/textarea";
import { AATagReferencePanel } from "./aa-tag-reference-panel";
import { useAATagAutocomplete } from "./aa-tag-autocomplete";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = useCallback(
    (tagText: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        onChange(template + tagText);
        return;
      }
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = template.slice(0, start) + tagText + template.slice(end);
      onChange(newValue);
      // Restore cursor after the inserted text
      requestAnimationFrame(() => {
        textarea.selectionStart = start + tagText.length;
        textarea.selectionEnd = start + tagText.length;
        textarea.focus();
      });
    },
    [template, onChange],
  );

  const replaceRange = useCallback(
    (replacement: string, rangeStart: number, rangeEnd: number) => {
      const textarea = textareaRef.current;
      const newValue =
        template.slice(0, rangeStart) + replacement + template.slice(rangeEnd);
      onChange(newValue);
      const newCursor = rangeStart + replacement.length;
      requestAnimationFrame(() => {
        if (textarea) {
          textarea.selectionStart = newCursor;
          textarea.selectionEnd = newCursor;
          textarea.focus();
        }
      });
    },
    [template, onChange],
  );

  const autocomplete = useAATagAutocomplete({
    textareaRef,
    value: template,
    onInsert: replaceRange,
  });

  return (
    <div className="flex min-h-0 flex-1">
      <AATagReferencePanel onSelectTag={insertAtCursor} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Textarea
          ref={textareaRef}
          value={template}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={autocomplete.handleKeyDown}
          onBlur={autocomplete.handleBlur}
          onClick={() => {
            // Trigger re-detection on click (cursor position change)
          }}
          placeholder="Enter AA template with {assign:SlotName} and {ref:SlotName} placeholders..."
          className="min-h-0 flex-1 resize-none font-mono text-sm"
          disabled={disabled}
        />
        {autocomplete.dropdown}
      </div>
    </div>
  );
}
