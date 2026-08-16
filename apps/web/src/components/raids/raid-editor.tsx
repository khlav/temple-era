"use client";

import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import type { Raid, RaidParticipant } from "~/server/api/interfaces/raid";
import { RaidDetailBase } from "~/components/raids/raid-detail-base";
import { RaidBenchManager } from "~/components/raids/raid-bench-manager";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { WCLIcon } from "~/components/ui/wcl-icon";
import { RaidEditorCoreControls } from "~/components/raids/raid-editor-core-controls";
import React, { type Dispatch, type SetStateAction, useState } from "react";
import { api } from "~/trpc/react";
import { CharactersTable } from "~/components/characters/characters-table";
import { GenerateWCLReportUrl } from "~/lib/helpers";
import Link from "next/link";

const EYEBROW_CLASSNAME =
  "font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground";

export function RaidEditor({
  raidData,
  setRaidDataAction,
  isSendingData,

  editingMode = "new",

  handleSubmitAction,
  handleDeleteAction,
  debug,
}: {
  raidData: Raid;
  setRaidDataAction: Dispatch<SetStateAction<Raid>>;
  isSendingData: boolean;

  editingMode: "new" | "existing";

  handleSubmitAction: () => void;
  handleDeleteAction: () => void;
  debug?: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleInputChangeAction = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setRaidDataAction((raidData) => ({
      ...raidData,
      [e.target.name]: e.target.value,
    }));
  };

  const handleWeightChangeAction = (e: React.FormEvent<HTMLButtonElement>) => {
    setRaidDataAction((raidData) => ({
      ...raidData,
      // @ts-expect-error Value exists, but IDE says not found

      attendanceWeight: parseFloat(e.target.value) ?? 0,
    }));
  };

  const handleBenchSelectAction = (character: RaidParticipant) => {
    setRaidDataAction((raidData) => ({
      ...raidData,
      bench: {
        ...raidData.bench,
        [character.characterId]: character,
      },
    }));
  };

  const handleBenchRemoveAction = (character: RaidParticipant) => {
    const newBench = raidData.bench ?? {};
    delete newBench[character.characterId.toString()];

    setRaidDataAction((raidData) => ({
      ...raidData,
      bench: newBench,
    }));
  };

  const { data: raidParticipants, isLoading: isLoadingParticipants } =
    api.raidLog.getUniqueParticipantsFromMultipleLogs.useQuery(raidData.raidLogIds ?? [], {
      enabled: (raidData?.raidLogIds ?? []).length > 0,
    });

  const attendeeCount = Object.keys(raidParticipants ?? {}).length;

  return (
    <div className="space-y-4 px-1">
      <div className="panel-surface rounded-2xl border border-border/70 p-4">
        <RaidEditorCoreControls
          raidData={raidData}
          isSendingData={isSendingData}
          editingMode={editingMode}
          handleInputChangeAction={handleInputChangeAction}
          handleWeightChangeAction={handleWeightChangeAction}
          handleSubmitAction={handleSubmitAction}
          handleDeleteAction={handleDeleteAction}
        />
      </div>

      <div className="panel-surface space-y-4 rounded-2xl border border-border/70 p-4">
        <div>
          <div className={EYEBROW_CLASSNAME}>WCL logs</div>
          <div className="mt-2 flex flex-col gap-1.5">
            {(raidData.raidLogIds ?? []).map((raidLogId) => {
              const reportUrl = GenerateWCLReportUrl(raidLogId);
              return (
                <Link
                  key={raidLogId}
                  href={reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {raidLogId}
                  <WCLIcon />
                </Link>
              );
            })}
            {(raidData.raidLogIds ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No logs linked.</div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-border/60 pt-4">
          <div className={EYEBROW_CLASSNAME}>
            Kills{raidData.kills ? ` · ${raidData.kills.length}` : ""}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(raidData.kills ?? []).map((killName, i) => (
              <span
                key={`kill_${i}`}
                className="rounded-lg bg-secondary px-2 py-1 text-xs text-muted-foreground"
              >
                {killName}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className={EYEBROW_CLASSNAME}>
            Attendees from logs{attendeeCount > 0 ? ` · ${attendeeCount}` : ""}
          </div>
          <div className="mt-2">
            <CharactersTable
              characters={raidParticipants}
              isLoading={isLoadingParticipants}
              targetNewTab
              showRaidColumns={false}
            />
          </div>
          <div className="mt-3 text-center text-sm text-muted-foreground">
            List of characters appearing in WCL logs. <br />
            Alts are mapped to primary characters when calc&apos;ing attendance.
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <RaidBenchManager
            characters={raidData.bench ?? {}}
            onSelectAction={handleBenchSelectAction}
            onRemoveAction={handleBenchRemoveAction}
          />
        </div>
      </div>

      <div className="w-full">
        <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
          <CollapsibleTrigger className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80">
            Preview{" "}
            {previewOpen ? (
              <ChevronsLeft className="h-4 w-4" />
            ) : (
              <ChevronsRight className="h-4 w-4" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 border-t border-border/60 pt-3">
              <RaidDetailBase raidData={raidData} isPreview />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {debug && (
        <div className="panel-surface rounded-2xl border border-border/70 p-4">
          <LabeledArrayCodeBlock
            label="DEBUG : Raid State"
            value={JSON.stringify(raidData, null, 2)}
          />
        </div>
      )}
    </div>
  );
}
