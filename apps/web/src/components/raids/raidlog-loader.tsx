"use client";

import { api } from "~/trpc/react";
import { useEffect, useState } from "react";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Check, XIcon } from "lucide-react";
import { RaidLog } from "~/server/api/interfaces/raid";

interface RaidLogLoaderProps {
  label?: string;
  onDataLoaded?: (raidLog: RaidLog | undefined) => void; // onLoad callback function
  forceRefresh?: boolean;
}

export function RaidLogLoader({
  label,
  onDataLoaded,
  forceRefresh,
}: RaidLogLoaderProps): React.ReactNode {
  const [urlInput, setUrlInput] = useState<string>("");
  const [raidLogId, setRaidLogId] = useState<string>("");
  const utils = api.useUtils();

  const invalidateResult = async () => {await utils.invalidate()};

  const {
    data: raidLog,
    isLoading,
    isSuccess,
    isError,
  } = api.raidLog.importAndGetRaidLogByRaidLogId.useQuery(
    {
      raidLogId: raidLogId,
      forceRaidLogRefresh: forceRefresh,
    },
    {
      enabled: !!raidLogId,
      staleTime: 0, // Ensures no caching and always fetches from the server
    }, // Fetch only if a raidLogId is present
  );
  const onUrlInputChange = (value: string) => {
    const reportIdRegex = /([a-zA-Z0-9]{16})/;
    const match = reportIdRegex.exec(value);

    setUrlInput(value);

    if (match) {
      setRaidLogId(match[1] ?? "");
    } else {
    }
  };

  useEffect(() => {
    if (isSuccess && raidLog && onDataLoaded) {
      setUrlInput("");
      setRaidLogId("");
      onDataLoaded(raidLog);
    }
  }, [isSuccess, raidLog, onDataLoaded]);

  return (
    <div>
      <div className="max-w-xl">
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
