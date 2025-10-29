"use client";

import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import type { Raid, RaidParticipant } from "~/server/api/interfaces/raid";
import { RaidDetailBase } from "~/components/raids/raid-detail-base";
import { Separator } from "~/components/ui/separator";
import { RaidBenchManager } from "~/components/raids/raid-bench-manager";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { ChevronsLeft, ChevronsRight, ExternalLinkIcon } from "lucide-react";
import { RaidEditorCoreControls } from "~/components/raids/raid-editor-core-controls";
import React, { type Dispatch, type SetStateAction, useState } from "react";
import { api } from "~/trpc/react";
import { CharactersTable } from "~/components/characters/characters-table";
import { GenerateWCLReportUrl } from "~/lib/helpers";
import Link from "next/link";

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

  const handleInputChangeAction = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    api.raidLog.getUniqueParticipantsFromMultipleLogs.useQuery(
      raidData.raidLogIds ?? [],
      { enabled: (raidData?.raidLogIds ?? []).length > 0 },
    );

  return (
    <>
      <div className="flex space-x-4 px-1">
        <div className="w-full">
          <RaidEditorCoreControls
            raidData={raidData}
            isSendingData={isSendingData}
            editingMode={editingMode}
            handleInputChangeAction={handleInputChangeAction}
            handleWeightChangeAction={handleWeightChangeAction}
            handleSubmitAction={handleSubmitAction}
            handleDeleteAction={handleDeleteAction}
          />
          <Separator className="my-3" />
          <div className="flex gap-4 xl:flex-nowrap">
            <div className="grow-0 text-nowrap text-sm">WCL logs:</div>
            <div className="shrink overflow-ellipsis">
              {(raidData.raidLogIds ?? []).map((raidLogId) => {
                const reportUrl = GenerateWCLReportUrl(raidLogId);
                return (
                  <div
                    key={raidLogId}
                    className="group text-sm text-muted-foreground transition-all duration-100 hover:text-primary hover:underline"
                  >
                    <Link
                      href={reportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-nowrap"
                    >
                      <span className="hidden md:inline-block">
                        {reportUrl.replace("https://", "")}
                      </span>
                      <span className="inline-block md:hidden">
                        {raidLogId}
                      </span>
                      <ExternalLinkIcon
                        className="ml-1 inline-block align-text-top"
                        size={15}
                      />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
          <Separator className="my-3" />
          <div className="flex gap-4 xl:flex-nowrap">
            <div className="grow-0 text-nowrap text-sm">
              Kills {raidData.kills ? `(${raidData?.kills?.length})` : ""}:
            </div>
            <div className="flex shrink flex-wrap gap-1 overflow-x-hidden text-nowrap">
              {(raidData.kills ?? []).map((killName, i) => {
                return (
                  <div
                    key={`kill_${i}`}
                    className="grow-0 rounded bg-secondary px-2 py-1 text-sm text-muted-foreground"
                  >
                    {killName}
                  </div>
                );
              })}
            </div>
          </div>
          <Separator className="my-3" />
          <div className="flex flex-wrap-reverse gap-4 xl:flex-nowrap">
            <div className="w-full xl:w-1/2">
              <div className="">Attendees from logs:</div>
              <CharactersTable
                characters={raidParticipants}
                isLoading={isLoadingParticipants}
                targetNewTab
                showRaidColumns={false}
              />
              <div className="text-center text-sm text-muted-foreground">
                List of characters appearing in WCL logs. <br />
                Alts are mapped to primary characters when calc&apos;ing
                attendance.
              </div>
            </div>

            <Separator className="my-1 xl:hidden" />

            <div className="w-full xl:w-1/2">
              <div className="grow-0">Benched Characters:</div>
              <div className="grow">
                <RaidBenchManager
                  characters={raidData.bench ?? {}}
                  onSelectAction={handleBenchSelectAction}
                  onRemoveAction={handleBenchRemoveAction}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <Separator className="my-3" />
      <div className="w-full">
        <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
          <CollapsibleTrigger>
            <div className="inline-flex text-primary">
              Preview {previewOpen ? <ChevronsLeft /> : <ChevronsRight />}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator className="mx-auto my-2 w-[90%]" />
            <RaidDetailBase raidData={raidData} isPreview />
          </CollapsibleContent>
        </Collapsible>
      </div>
      {debug && (
        <>
          <Separator className="my-3" />
          <div className="flex-1">
            <LabeledArrayCodeBlock
              label="DEBUG : Raid State"
              value={JSON.stringify(raidData, null, 2)}
            />
          </div>
        </>
      )}
    </>
  );
}
