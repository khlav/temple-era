import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Skeleton } from "~/components/ui/skeleton";
import React from "react";
import { TableSearchInput } from "~/components/ui/table-search-input";
import { Separator } from "~/components/ui/separator";

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

export function AllCharactersTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <>
      <TableSearchInput isLoading={true} />
      <GenericCharactersTableSkeleton rows={rows} />
    </>
  );
}

export function GenericCharactersTableSkeleton({
  rows = 10,
  showRaidColumns = true,
}: {
  rows?: number;
  showRaidColumns?: boolean;
}) {
  return (
    <>
      <Table className="max-h-[400px] w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2">Characters</TableHead>
            <TableHead className="w-1/4">Server</TableHead>
            {showRaidColumns && (
              <>
                <TableHead className="w-16 text-center text-xs">MC</TableHead>
                <TableHead className="w-16 text-center text-xs">BWL</TableHead>
                <TableHead className="w-16 text-center text-xs">AQ40</TableHead>
                <TableHead className="w-16 text-center text-xs">Naxx</TableHead>
              </>
            )}
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
              {showRaidColumns && (
                <>
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
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

export function CharacterDetailSkeleton() {
  return (
    <div className="flex flex-col">
      {/* Character header */}
      <div className="flex flex-row items-center gap-1">
        <div className="grow-0">
          <Skeleton className="h-8 w-8 rounded" />
        </div>
        <div className="grow-0">
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="grow" />
        <div className="grow-0">
          <Skeleton className="h-10 w-40" />
        </div>
      </div>

      {/* Secondary characters section (conditional) */}
      <Separator className="my-2 w-full" />
      <div className="flex flex-row gap-2">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-9 w-32 rounded-xl" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
      </div>

      {/* Recipes section */}
      <Separator className="my-2 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <div className="space-y-1">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>

      {/* Raids table section (for primary characters) */}
      <Separator className="my-2 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/2">Raid</TableHead>
              <TableHead className="w-1/4">Zone</TableHead>
              <TableHead className="w-1/4">Date</TableHead>
              <TableHead className="w-16 text-center">WCL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                <TableCell>
                  <Skeleton
                    className="h-4 w-full"
                    style={{ width: `${40 + ((rowIndex * 45) % 40)}%` }}
                  />
                </TableCell>
                <TableCell>
                  <Skeleton
                    className="h-4 w-full"
                    style={{ width: `${50 + ((rowIndex * 45 + 1) % 30)}%` }}
                  />
                </TableCell>
                <TableCell>
                  <Skeleton
                    className="h-4 w-full"
                    style={{ width: `${60 + ((rowIndex * 45 + 2) % 20)}%` }}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Skeleton className="m-auto h-4 w-4" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
