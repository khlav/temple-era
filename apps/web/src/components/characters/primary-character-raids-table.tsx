"use client";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import Link from "next/link";
import { Armchair, ExternalLinkIcon, Search } from "lucide-react";
import { api } from "~/trpc/react";
import { GenerateWCLReportUrl, PrettyPrintDate } from "~/lib/helpers";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import { PrimaryCharacterRaidsTableRowSkeleton } from "~/components/characters/skeletons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { TableSearchInput } from "~/components/ui/table-search-input";
import { TableSearchTips } from "~/components/ui/table-search-tips";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import type { RaidParticipant } from "~/server/api/interfaces/raid";

export function PrimaryCharacterRaidsTable({
  characterId,
  characterData,
}: {
  characterId: number;
  characterData: RaidParticipant;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams?.get("s") ?? "";
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [searchTerms, setSearchTerms] = useState<string>(initialSearch);

  // Focus search input on component mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Update URL when search changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString());

    if (searchTerms) {
      params.set("s", searchTerms);
    } else {
      params.delete("s");
    }

    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchTerms, router, searchParams]);

  // Only fetch raids if this is a primary character
  const { data: raids, isSuccess } =
    api.character.getRaidsForPrimaryCharacterId.useQuery(characterId, {
      enabled: characterData.isPrimary === true,
    });

  // Filter raids based on search terms
  const filteredRaids = useMemo(() => {
    if (!raids || !searchTerms.trim()) {
      return raids;
    }

    // Split search terms and convert to lowercase
    const terms = searchTerms
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term);

    return raids.filter((raid) => {
      // Create searchable string from raid data
      const searchableString = [
        raid.name?.toLowerCase() ?? "",
        raid.zone?.toLowerCase() ?? "",
        PrettyPrintDate(new Date(raid.date), true).toLowerCase(),
        raid.attendanceWeight?.toString() ?? "",
        raid.attendeeOrBench?.toLowerCase() ?? "",
        ...(raid.allCharacters?.map((c) => c.name?.toLowerCase()) ?? []),
      ].join(" ");

      // Check if ALL terms are present (AND search)
      return terms.every((term) => searchableString.includes(term));
    });
  }, [raids, searchTerms]);

  // Count stats for attendance summary
  const raidStats = useMemo(() => {
    const total = filteredRaids?.length ?? 0;
    const attended =
      filteredRaids?.filter((r) => r.attendeeOrBench === "attendee").length ??
      0;
    const benched =
      filteredRaids?.filter((r) => r.attendeeOrBench === "bench").length ?? 0;

    return { total, attended, benched };
  }, [filteredRaids]);

  return (
    <div>
      {/* Search Bar */}
      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-[18px] -translate-y-1/2 text-muted-foreground"
          size={20}
        />
        <TableSearchInput
          ref={searchInputRef}
          type="text"
          placeholder="Search raids by name, zone, date, character..."
          className="w-full pl-10"
          initialValue={initialSearch}
          onDebouncedChange={(v) => setSearchTerms(v ?? "")}
        />
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <TableSearchTips>
            <p className="mb-1 font-medium">Search tips:</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Search by raid name, zone, date text, or character names</li>
              <li>Enter multiple terms to narrow results (AND search)</li>
            </ul>
          </TableSearchTips>
          <span>
            All-time raids: {raidStats.total} ({raidStats.attended} attended,{" "}
            {raidStats.benched} benched)
          </span>
        </div>
      </div>

      <Table className="max-h-[400px] whitespace-nowrap text-muted-foreground">
        <TableCaption className="text-wrap">
          Note: Only Tracked raids are considered for attendance restrictions.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2 md:w-4/12">Raid</TableHead>
            <TableHead className="hidden md:table-cell md:w-2/12">
              Zone
            </TableHead>
            <TableHead className="hidden md:table-cell md:w-2/12">
              Date
            </TableHead>
            <TableHead className="w-1/4 md:w-2/12">Attendance</TableHead>
            <TableHead className="hidden md:table-cell md:w-1/12">
              Character
            </TableHead>
            <TableHead className="w-1/4 text-center md:w-1/12">WCL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isSuccess ? (
            filteredRaids && filteredRaids.length > 0 ? (
              filteredRaids.map((r) => (
                <TableRow key={r.raidId}>
                  <TableCell className="text-secondary-foreground">
                    <Link
                      className="group w-full transition-all hover:text-primary"
                      target="_self"
                      href={"/raids/" + r.raidId}
                    >
                      <div>{r.name}</div>
                      <div className="text-xs text-muted-foreground md:hidden">
                        {PrettyPrintDate(new Date(r.date), true)}
                      </div>
                      <div className="mt-1 flex gap-1 text-xs text-muted-foreground md:hidden">
                        {(r.allCharacters ?? []).map((c) => (
                          <div
                            key={c.characterId}
                            className="grow-0 rounded bg-secondary px-2 py-1"
                          >
                            {c.name}
                          </div>
                        ))}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {r.zone}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {PrettyPrintDate(new Date(r.date), true)}
                  </TableCell>
                  <TableCell>
                    <RaidAttendenceWeightBadge
                      attendanceWeight={r.attendanceWeight}
                    />
                  </TableCell>
                  <TableCell className="hidden gap-1 md:flex">
                    {r.attendeeOrBench == "bench" && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Armchair size={16} className="cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent className="bg-secondary text-muted-foreground">
                          Bench
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {(r.allCharacters ?? []).map((c) => {
                      return (
                        <Link
                          key={c.characterId}
                          className="group shrink rounded bg-secondary px-2 py-1 text-xs transition-all hover:text-primary"
                          target="_self"
                          href={"/characters/" + c.characterId}
                        >
                          {c.name}
                        </Link>
                      );
                    })}
                  </TableCell>
                  <TableCell className="text-center">
                    {(r.raidLogIds ?? []).map((raidLogId: string) => {
                      const reportUrl = GenerateWCLReportUrl(raidLogId);
                      return (
                        <Link
                          key={raidLogId}
                          href={reportUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group text-sm transition-all hover:text-primary hover:underline"
                        >
                          <ExternalLinkIcon
                            className="ml-1 inline-block align-text-top"
                            size={15}
                          />
                        </Link>
                      );
                    })}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-4 text-center">
                  No raids found matching your search
                </TableCell>
              </TableRow>
            )
          ) : (
            <PrimaryCharacterRaidsTableRowSkeleton />
          )}
        </TableBody>
      </Table>
    </div>
  );
}
