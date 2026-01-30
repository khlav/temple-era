"use client";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

interface MRTEnrichInputProps {
  value: string;
  onChange: (value: string) => void;
  onEnrich: () => void;
  isLoading: boolean;
}

export function MRTEnrichInput({
  value,
  onChange,
  onEnrich,
  isLoading,
}: MRTEnrichInputProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onEnrich();
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <Input
          id="mrt-input"
          placeholder="Paste RaidHelper export string here..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm"
          autoComplete="off"
        />
        <Button type="submit" disabled={!value.trim() || isLoading}>
          {isLoading ? "Fixing..." : "Fix Names"}
        </Button>
      </div>
    </form>
  );
}
