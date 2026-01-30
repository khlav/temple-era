"use client";

import { useState, useRef } from "react";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Copy } from "lucide-react";

interface MRTEnrichOutputProps {
  value: string;
}

export function MRTEnrichOutput({ value }: MRTEnrichOutputProps) {
  const [showCopied, setShowCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleClick = () => {
    if (inputRef.current) {
      inputRef.current.select();
      void handleCopy();
    }
  };

  const handleFocus = () => {
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  return (
    <div className="flex gap-2">
      <TooltipProvider>
        <Tooltip open={showCopied}>
          <TooltipTrigger asChild>
            <Input
              ref={inputRef}
              id="mrt-output"
              value={value}
              readOnly
              onClick={handleClick}
              onFocus={handleFocus}
              className="cursor-pointer font-mono text-sm"
              placeholder="Updated export/import string will appear here..."
              autoComplete="off"
            />
          </TooltipTrigger>
          <TooltipContent className="bg-secondary text-muted-foreground">
            <p>Copied</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleCopy}
        disabled={!value}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}
