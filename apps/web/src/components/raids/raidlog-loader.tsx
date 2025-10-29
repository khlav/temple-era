"use client";

import { api } from "~/trpc/react";
import { useEffect, useState, useCallback } from "react";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Check, XIcon } from "lucide-react";
import type { RaidLog } from "~/server/api/interfaces/raid";

interface RaidLogLoaderProps {
  label?: string;
  onDataLoaded?: (raidLog: RaidLog | undefined) => void; // onLoad callback function
  urlInput?: string;
  setUrlInput?: (value: string) => void;
}

export function RaidLogLoader({
  label,
  onDataLoaded,
  urlInput: externalUrlInput,
  setUrlInput: externalSetUrlInput,
}: RaidLogLoaderProps): React.ReactNode {
  const [internalUrlInput, setInternalUrlInput] = useState<string>("");
  const [raidLogId, setRaidLogId] = useState<string>("");
  const utils = api.useUtils();

  // Use external state if provided, otherwise use internal state
  const urlInput = externalUrlInput ?? internalUrlInput;
  const setUrlInput = externalSetUrlInput ?? setInternalUrlInput;

  const {
    data: raidLog,
    isLoading,
    isSuccess,
    isError,
  } = api.raidLog.importAndGetRaidLogByRaidLogId.useQuery(raidLogId, {
    enabled: !!raidLogId,
    staleTime: 0, // Ensures no caching and always fetches from the server
  });
  const onUrlInputChange = useCallback(
    (value: string) => {
      const reportIdRegex = /([a-zA-Z0-9]{16})/;
      const match = reportIdRegex.exec(value);

      setUrlInput(value);

      if (match) {
        setRaidLogId(match[1] ?? "");
      }
    },
    [setUrlInput],
  );

  useEffect(() => {
    const invalidateResult = async () => {
      await utils.invalidate(undefined, { refetchType: "all" });
    };
    invalidateResult()
      .then(() => console.log("Cache invalidated successfully"))
      .catch((error) => console.error("Error invalidating cache:", error));
  }, [utils]);

  useEffect(() => {
    if (isSuccess && raidLog && onDataLoaded) {
      setUrlInput("");
      setRaidLogId("");
      onDataLoaded(raidLog);
    }
  }, [isSuccess, raidLog, onDataLoaded, setUrlInput]);

  // Watch for external urlInput changes and process them
  useEffect(() => {
    if (
      externalUrlInput !== undefined &&
      externalUrlInput !== internalUrlInput
    ) {
      onUrlInputChange(externalUrlInput);
    }
  }, [externalUrlInput, internalUrlInput, onUrlInputChange]);

  return (
    <div>
      <div className="w-full">
        <Label htmlFor="wclUrl">
          {label ?? "Load log data from WCL link:"}
        </Label>
        <div className="relative">
          <Input
            id="wclUrl"
            value={urlInput}
            type="text"
            placeholder="e.g. https://vanilla.warcraftlogs.com/reports/bmThXYVCxyFPARta"
            onChange={(e) => onUrlInputChange(e.target.value)}
            disabled={isLoading}
            className="pr-10"
            autoComplete="off"
          />
          {isSuccess && (
            <Check
              className="absolute right-3 top-1/2 -translate-y-1/2 transform text-emerald-600"
              aria-label="Success"
            />
          )}
          {isError && (
            <XIcon
              className="absolute right-3 top-1/2 -translate-y-1/2 transform text-red-700"
              aria-label="Error"
            />
          )}
        </div>
      </div>
    </div>
  );
}
