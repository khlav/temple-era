"use client";

import { Textarea } from "~/components/ui/textarea";

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
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Textarea
        value={template}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter AA template with {assign:SlotName} and {ref:SlotName} placeholders..."
        className="min-h-0 flex-1 resize-none font-mono text-sm"
        disabled={disabled}
      />
    </div>
  );
}
