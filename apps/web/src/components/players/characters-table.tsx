"use client";

import type {
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import anyAscii from "any-ascii";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { GenericCharactersTableSkeleton } from "~/components/players/skeletons";

export function CharactersTable({
  characters,
  targetNewTab = false,
  isLoading = false,
}: {
  characters: RaidParticipantCollection | undefined;
  targetNewTab?: boolean;
  isLoading?: boolean;
}) {
  const characterList =
    characters &&
    Object.values(characters).sort((a, b) =>
      anyAscii(a.name) > anyAscii(b.name) ? 1 : -1,
    );

  return (
    <div>
      {isLoading ? (
        <GenericCharactersTableSkeleton rows={13} />
      ) : (
        <Table className="max-h-[400px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-3/4">
                Characters {characterList && `(${characterList.length})`}
              </TableHead>
              <TableHead className="w-1/3">Server</TableHead>
              <TableHead className="w-1/3">Class</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {characterList
              ? characterList?.map((c: RaidParticipant) => (
                  <TableRow key={c.characterId}>
                    <TableCell>
                      <Link
                        className="hover:text-primary group w-full transition-all"
                        target={targetNewTab ? "_blank" : "_self"}
                        href={"/players/" + c.characterId}
                      >
                        <div>
                          {c.name}
                          {c.primaryCharacterName ? (
                            <span className="text-muted-foreground pl-1.5 text-xs font-normal">
                              {c.primaryCharacterName}
                            </span>
                          ) : (
                            ""
                          )}
                          {targetNewTab && (
                            <ExternalLinkIcon
                              className="ml-1 hidden align-text-top group-hover:inline-block"
                              size={15}
                            />
                          )}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.server}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.class}
                    </TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
