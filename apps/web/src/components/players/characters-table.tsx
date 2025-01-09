import {
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
import {ExternalLinkIcon} from "lucide-react";

export function CharactersTable({
  characters,
}: {
  characters: RaidParticipantCollection | undefined;
}) {
  const characterList =
    characters &&
    Object.values(characters).sort((a, b) =>
      anyAscii(a.name) > anyAscii(b.name) ? 1 : -1,
    );

  return (
    <div>
      <Table className="max-h-[400px] ">
        <TableHeader>
          <TableRow>
            <TableHead className="w-3/4">Characters {characterList && `(${characterList.length})`}</TableHead>
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
                      className="hover:text-primary w-full transition-all hover:font-bold group"
                      target="_blank"
                      href={"/players/" + c.characterId}
                    >
                      <div>
                        {c.name}
                      <ExternalLinkIcon className="hidden group-hover:inline-block ml-1 align-text-top " size={15}/>
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
    </div>
  );
}
