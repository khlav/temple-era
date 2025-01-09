"use client";
import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import {
  type Raid,
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import { RaidDetailBase } from "~/components/raids/raid-detail-base";
import { Separator } from "~/components/ui/separator";
import { RaidBenchManager } from "~/components/raids/raid-bench-manager";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {ChevronsLeft, ChevronsRight, ExternalLinkIcon} from "lucide-react";
import { RaidEditorCoreControls } from "~/components/raids/raid-editor-core-controls";
import { useState } from "react";
import { api } from "~/trpc/react";
import { CharactersTable } from "~/components/players/characters-table";
import { GenerateWCLReportUrl } from "~/lib/helpers";
import { Button } from "~/components/ui/button";
import Link from "next/link";

export function RaidEditor({
  raidData,
  handleInputChangeAction,
  handleWeightChangeAction,
  handleSubmitAction,
  handleClearAction,
  handleBenchSelectAction,
  handleBenchRemoveAction,
  debug,
}: {
  raidData: Raid;
  handleInputChangeAction: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleWeightChangeAction: (e: React.FormEvent<HTMLButtonElement>) => void;
  handleSubmitAction: () => void;
  handleClearAction: () => void;
  handleBenchSelectAction: (character: RaidParticipant) => void;
  handleBenchRemoveAction: (character: RaidParticipant) => void;
  debug?: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const {
    data: raidParticipants,
    isSuccess: isSuccessParticipants,
  } = api.raidLog.getUniqueParticipantsFromMultipleLogs.useQuery(
    raidData.raidLogIds ?? [],
    { enabled: (raidData?.raidLogIds ?? []).length > 0 },
  );

  return (
    <>
      <div className="flex space-x-4">
        <div className="w-full">
          <RaidEditorCoreControls
            raidData={raidData}
            handleInputChangeAction={handleInputChangeAction}
            handleWeightChangeAction={handleWeightChangeAction}
            handleSubmitAction={handleSubmitAction}
            handleClearAction={handleClearAction}
          />
          <Separator className="my-3" />
          <div className="flex gap-4 xl:flex-nowrap">
            <div className="grow-0 text-sm text-nowrap">WCL reports:</div>
            <div className="shrink overflow-x-hidden">
              {(raidData.raidLogIds ?? []).map((raidLogId) => {
                const reportUrl = GenerateWCLReportUrl(raidLogId)
                return (
                  <div key={raidLogId} className="text-muted-foreground text-sm hover:underline hover:text-primary transition-all duration-100 group">
                    <Link href={reportUrl} target="_blank" rel="noopener noreferrer">
                      {reportUrl}
                      <ExternalLinkIcon className="hidden group-hover:inline-block ml-1 align-text-top " size={15}/>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
          <Separator className="my-3" />
          <div className="flex flex-wrap-reverse gap-4 xl:flex-nowrap">
            <div className="w-full xl:w-1/2">
              <div className="">Attendees from logs:</div>
              <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
                {isSuccessParticipants && (
                  <CharactersTable characters={raidParticipants} />
                )}
              </div>
              <div className="text-muted-foreground text-center text-sm">
                List of characters appearing in WCL logs. <br />
                Alts are mapped to primary characters when calc'ing attendance.
              </div>
            </div>
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
            <div className="inline-flex">
              Preview {previewOpen ? <ChevronsLeft /> : <ChevronsRight />}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
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
              value={raidData}
            />
          </div>
        </>
      )}
    </>
  );
}
