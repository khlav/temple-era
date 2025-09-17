import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "~/components/ui/table";
import { Skeleton } from "~/components/ui/skeleton";
import React from "react";
import { TableSearchInput } from "~/components/ui/table-search-input";

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

export function AllCharactersTableSkeleton({
                                                        rows = 10,
                                                      }: {
  rows?: number;
}) {
  return (
    <>
      <TableSearchInput onDebouncedChange={() => {}} isLoading={true} />
    <GenericCharactersTableSkeleton rows={rows} />
    </>

  );
}

export function GenericCharactersTableSkeleton({
                                                rows = 10,
                                              }: {
  rows?: number;
}) {
  return (
    <>
      <Table className="max-h-[400px] w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2">
              Characters
            </TableHead>
            <TableHead className="w-1/4">Server</TableHead>
            <TableHead className="w-16 text-center text-xs">MC</TableHead>
            <TableHead className="w-16 text-center text-xs">BWL</TableHead>
            <TableHead className="w-16 text-center text-xs">AQ40</TableHead>
            <TableHead className="w-16 text-center text-xs">Naxx</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              <TableCell>
                <Skeleton
                  className="my-1 h-4 px-2"
                  style={{ width: `${40 + ((rowIndex * 45) % 31)}%` }}
                />
              </TableCell>
              <TableCell>
                <Skeleton
                  className="my-1 h-4 px-2"
                  style={{ width: `${40 + ((rowIndex * 45 + 1) % 31)}%` }}
                />
              </TableCell>
              <TableCell className="text-center">
                <Skeleton className="m-auto h-4 w-6" />
              </TableCell>
              <TableCell className="text-center">
                <Skeleton className="m-auto h-4 w-6" />
              </TableCell>
              <TableCell className="text-center">
                <Skeleton className="m-auto h-4 w-6" />
              </TableCell>
              <TableCell className="text-center">
                <Skeleton className="m-auto h-4 w-6" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>

  );
}