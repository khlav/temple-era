"use client";

import { useState, useEffect, useCallback } from "react";
import { MRTEnrichInput } from "./mrt-enrich-input";
import { MRTEnrichOutput } from "./mrt-enrich-output";
import { MRTEnrichResults } from "./mrt-enrich-results";
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";

export function MRTEnrichContent() {
  const [inputValue, setInputValue] = useState("");
  const [previousInput, setPreviousInput] = useState("");
  const { toast } = useToast();

  const enrichMutation = api.character.enrichMRTComposition.useMutation({
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to enrich MRT composition",
        variant: "destructive",
      });
    },
  });

  const handleEnrich = useCallback(() => {
    if (!inputValue.trim()) {
      toast({
        title: "Error",
        description: "Please enter an MRT string",
        variant: "destructive",
      });
      return;
    }

    enrichMutation.mutate(inputValue);
    setPreviousInput(inputValue);
  }, [inputValue, toast, enrichMutation]);

  // Auto-process when input changes (paste detection)
  useEffect(() => {
    if (
      inputValue &&
      inputValue !== previousInput &&
      inputValue.startsWith("MRTRGR")
    ) {
      handleEnrich();
    }
  }, [inputValue, previousInput, handleEnrich]);

  const handleInputChange = (value: string) => {
    setInputValue(value);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <MRTEnrichInput
          value={inputValue}
          onChange={handleInputChange}
          onEnrich={handleEnrich}
          isLoading={enrichMutation.isPending}
        />
        <MRTEnrichOutput value={enrichMutation.data?.enriched ?? ""} />
      </div>

      {enrichMutation.data && (
        <MRTEnrichResults results={enrichMutation.data.results} />
      )}
    </div>
  );
}
