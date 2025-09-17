"use client";
import { api } from "~/trpc/react";
import { CharactersTable } from "~/components/characters/characters-table";
import { useState } from "react";
import { TableSearchInput } from "~/components/ui/table-search-input";
import { TableSearchTips } from "~/components/ui/table-search-tips";
import type { RaidParticipantCollection } from "~/server/api/interfaces/raid";
import { AllCharactersTableSkeleton } from "~/components/characters/skeletons";
import type { Session } from "next-auth";

export function AllCharacters({ session }: { session?: Session }) {
  const { data: players, isSuccess } = api.character.getCharacters.useQuery();
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Function to normalize text (remove non-ASCII characters and convert to lowercase)
  const normalizeText = (text: string) => {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^\x00-\x7F]/g, "") // Remove non-ASCII characters
      .toLowerCase(); // Convert to lowercase
  };

  // Filter characters based on search term
  const filteredPlayers = (
    players
      ? Object.values(players).filter((player) => {
          // Search only in specific fields, excluding characterId
          const searchableFields = [
            player.name,
            player.server,
            player.class,
            player.classDetail,
            player.slug,
            player.primaryCharacterName,
            player.raidAttendanceByZone?.["Molten Core"]?.attendee
              ? "Molten Core mc"
              : "",
            player.raidAttendanceByZone?.["Blackwing Lair"]?.attendee
              ? "Blackwing Lair bwl"
              : "",
            player.raidAttendanceByZone?.["Temple of Ahn'Qiraj"]?.attendee
              ? "Temple of Ahn'Qiraj aq40"
              : "",
            player.raidAttendanceByZone?.Naxxramas?.attendee ? "Naxxramas" : "",
          ].filter(Boolean); // Remove null/undefined values

          return searchableFields.some((value) => {
            // Normalize and check if any field contains the search term
            return normalizeText(String(value)).includes(
              normalizeText(searchTerm),
            );
          });
        })
      : []
  ).reduce((acc, rel) => {
    acc[rel.characterId] = rel;
    return acc;
  }, {} as RaidParticipantCollection);

  return (
    <>
      {isSuccess ? (
        <div className="space-y-2">
          <div className="space-y-1">
            <TableSearchInput
              placeholder="Search..."
              onDebouncedChange={(v) => setSearchTerm(v)}
            />
            <TableSearchTips>
              <p className="mb-1 font-medium">Search tips:</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Search by name, server, class, slug, or primary name</li>
                <li>Terms are ANDed together (must all appear)</li>
              </ul>
            </TableSearchTips>
          </div>
          <CharactersTable characters={filteredPlayers} session={session} />
        </div>
      ) : (
        <AllCharactersTableSkeleton rows={14} />
      )}
    </>
  );
}
