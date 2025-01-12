import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "~/components/ui/table";
import { Skeleton } from "~/components/ui/skeleton";
import React from "react";
import {RaidParticipant} from "~/server/api/interfaces/raid";
import Link from "next/link";
import {ExternalLinkIcon} from "lucide-react";
import {Input} from "~/components/ui/input";

export function PrimaryCharacterRaidsTableRowSkeleton({
                                                     rows = 10,
                                                   }: {
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: 4 }).map((_, cellIndex) => {
            // Create a deterministic pseudo-random value
            const seed = rowIndex * 3 + cellIndex; // Unique seed per cell
            const pseudoRandomWidth = 40 + ((seed * 45) % 31); // Generates widths between 40% and 80%
            return (
              <TableCell key={cellIndex}>
                <Skeleton
                  className="my-1 h-4 px-2"
                  style={{ width: `${pseudoRandomWidth}%` }}
                />
              </TableCell>
            );
          })}
          <TableCell key={rowIndex * 100} className="text-center">
            <Skeleton className="m-auto h-6 w-6" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function AllCharactersTableRowSkeleton({
                                                        rows = 10,
                                                      }: {
  rows?: number;
}) {
  return (
    <>
      <Input
        placeholder="Search..."
        disabled={true}
      />
    <Table className="max-h-[400px]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-3/4">
            Characters
          </TableHead>
          <TableHead className="w-1/3">Server</TableHead>
          <TableHead className="w-1/3">Class</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {Array.from({ length: 3 }).map((_, cellIndex) => {
              // Create a deterministic pseudo-random value
              const seed = rowIndex * 3 + cellIndex; // Unique seed per cell
              const pseudoRandomWidth = 40 + ((seed * 45) % 31); // Generates widths between 40% and 80%
              return (
                <TableCell key={cellIndex}>
                  <Skeleton
                    className="my-1 h-4 px-2"
                    style={{ width: `${pseudoRandomWidth}%` }}
                  />
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </>

  );
}