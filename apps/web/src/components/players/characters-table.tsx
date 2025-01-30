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
import { Edit, ExternalLinkIcon } from "lucide-react";
import { GenericCharactersTableSkeleton } from "~/components/players/skeletons";
import type { Session } from "next-auth";
import {ClassIcon} from "~/components/ui/class-icon";
import React from "react";

export function CharactersTable({
  characters,
  targetNewTab = false,
  isLoading = false,
  session,
}: {
  characters: RaidParticipantCollection | undefined;
  targetNewTab?: boolean;
  isLoading?: boolean;
  session?: Session;
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
              {session?.user?.isAdmin && (
                <TableHead className="w-40"> </TableHead>
              )}
              <TableHead className="w-3/4">
                Characters {characterList && `(${characterList.length})`}
              </TableHead>
              <TableHead className="w-1/3">Server</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {characterList
              ? characterList?.map((c: RaidParticipant) => (
                  <TableRow key={c.characterId} className="group">
                    {session?.user?.isAdmin && (
                      <TableCell>
                        <Link
                          href={`/admin/character-manager?s=${c.name}`}
                          className="transition-all hover:text-primary"
                        >
                          <Edit
                            className="opacity-0 group-hover:opacity-100"
                            size={16}
                          />
                        </Link>
                      </TableCell>
                    )}
                    <TableCell>
                      <Link
                        className="group w-full transition-all hover:text-primary"
                        target={targetNewTab ? "_blank" : "_self"}
                        href={"/players/" + c.characterId}
                      >
                        <div className="flex flex-row">
                          <ClassIcon characterClass={c.class.toLowerCase()} px={20} className="grow-0 mr-1" />
                          <div className="grow-0">{c.name}</div>
                          {c.primaryCharacterName ? (
                            <div className="pl-1.5 text-xs font-normal text-muted-foreground">
                              {c.primaryCharacterName}
                            </div>
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
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
