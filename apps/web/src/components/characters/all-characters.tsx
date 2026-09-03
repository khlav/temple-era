"use client";
import { api } from "~/trpc/react";
import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { TableSearchInput } from "~/components/ui/table-search-input";
import { TableSearchTips } from "~/components/ui/table-search-tips";
import { SearchSyntaxTips } from "~/components/ui/search-syntax-tips";
import { matchesSearchQuery } from "~/lib/table-search";
import type { RaidParticipant, RaidParticipantCollection } from "~/server/api/interfaces/raid";
import { AllCharactersTableSkeleton } from "~/components/characters/skeletons";
import type { Session } from "next-auth";
import {
  CharactersRosterList,
  type RosterAttendance,
} from "~/components/characters/characters-roster-list";

function characterSearchableText(player: RaidParticipant): string {
  return [
    player.name,
    player.server,
    player.class,
    player.classDetail,
    player.slug,
    player.primaryCharacterName,
    player.raidAttendanceByZone?.["Molten Core"]?.attendee ? "Molten Core mc" : "",
    player.raidAttendanceByZone?.["Blackwing Lair"]?.attendee ? "Blackwing Lair bwl" : "",
    player.raidAttendanceByZone?.["Temple of Ahn'Qiraj"]?.attendee
      ? "Temple of Ahn'Qiraj aq40"
      : "",
    player.raidAttendanceByZone?.Naxxramas?.attendee ? "Naxxramas" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function AllCharacters({
  session,
  characters: initialCharacters,
  attendance: initialAttendance,
  initialSearchTerm,
}: {
  session?: Session;
  characters?: RaidParticipantCollection | null;
  attendance?: RosterAttendance[] | null;
  initialSearchTerm?: string;
}) {
  const { data: fetchedCharacters } = api.character.getCharacters.useQuery(undefined, {
    enabled: !initialCharacters,
  });
  const { data: fetchedAttendance } = api.character.getAllPrimaryRaidAttendanceL6LockoutWk.useQuery(
    undefined,
    { enabled: !initialAttendance },
  );
  const players = initialCharacters ?? fetchedCharacters;
  const attendance = initialAttendance ?? fetchedAttendance;
  const [searchTerm, setSearchTerm] = useState<string>(initialSearchTerm ?? "");
  const [sortBy, setSortBy] = useState<"attendance" | "alphabetical">("attendance");

  const attendanceByCharacterId = useMemo(() => {
    const map = new Map<number, RosterAttendance>();
    for (const row of attendance ?? []) {
      if (row.characterId != null) map.set(row.characterId, row);
    }
    return map;
  }, [attendance]);

  const groups = useMemo(() => {
    const all = players ? Object.values(players) : [];
    // Anyone not linked to a main (isPrimary false, no primaryCharacterId — e.g. a fresh
    // secondary the character manager hasn't assigned yet) renders as its own row rather than
    // silently disappearing from the roster.
    const mains = all.filter((c) => c.isPrimary || !c.primaryCharacterId);
    const altsByMainId = new Map<number, RaidParticipant[]>();
    for (const c of all) {
      if (c.isPrimary || !c.primaryCharacterId) continue;
      const list = altsByMainId.get(c.primaryCharacterId) ?? [];
      list.push(c);
      altsByMainId.set(c.primaryCharacterId, list);
    }

    const allGroups = mains
      .map((main) => ({
        main,
        alts: (altsByMainId.get(main.characterId) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
      }))
      .sort((a, b) => {
        if (sortBy === "alphabetical") {
          return a.main.name.localeCompare(b.main.name, undefined, { sensitivity: "base" });
        }
        return (
          (attendanceByCharacterId.get(b.main.characterId)?.weightedAttendancePct ?? 0) -
          (attendanceByCharacterId.get(a.main.characterId)?.weightedAttendancePct ?? 0)
        );
      });

    if (!searchTerm.trim()) return allGroups;

    return allGroups.filter(({ main, alts }) => {
      const searchable = [characterSearchableText(main), ...alts.map(characterSearchableText)].join(
        " ",
      );
      return matchesSearchQuery(searchable, searchTerm);
    });
  }, [players, attendanceByCharacterId, searchTerm, sortBy]);

  // Show content if we have data (either from server or client fetch)
  const hasData = !!players;

  return (
    <>
      {hasData ? (
        <div className="space-y-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <TableSearchInput
                className="h-11"
                placeholder="Search characters, server, class, or main..."
                defaultValue={initialSearchTerm}
                onDebouncedChange={(v) => setSearchTerm(v)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
              <button
                type="button"
                onClick={() =>
                  setSortBy((prev) => (prev === "attendance" ? "alphabetical" : "attendance"))
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/14 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                Sort: {sortBy === "attendance" ? "Attendance" : "Alphabetical"}
                <ArrowUpDown className="h-3 w-3" />
              </button>
              <TableSearchTips>
                <p className="mb-1 font-medium">Search tips:</p>
                <ul className="mb-1 list-disc space-y-1 pl-4">
                  <li>Search by name, server, class, slug, or primary name</li>
                </ul>
                <SearchSyntaxTips />
              </TableSearchTips>
            </div>
          </div>
          <CharactersRosterList
            groups={groups}
            attendanceByCharacterId={attendanceByCharacterId}
            session={session}
          />
        </div>
      ) : (
        <AllCharactersTableSkeleton rows={14} />
      )}
    </>
  );
}
