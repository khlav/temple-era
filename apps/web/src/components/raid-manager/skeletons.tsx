import { TableCell, TableRow } from "~/components/ui/table";
import { Skeleton } from "~/components/ui/skeleton";
import React from "react";
import { TableSearchInput } from "~/components/ui/table-search-input";

export function CharacterManagerRowSkeleton({
                                                     rows = 12,
                                                   }: {
  rows?: number;
}) {
  return (
    <>
      <div className="sticky top-0 z-10 bg-white dark:bg-black/80 backdrop-blur-sm p-2">
        <TableSearchInput isLoading={true} />
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: 2 }).map((_, cellIndex) => {
            // Create a deterministic pseudo-random value
            const seed = rowIndex * 3 + cellIndex; // Unique seed per cell
            const pseudoRandomWidth = 40 + ((seed * 45) % 31); // Generates widths between 40% and 80%
            return (
              <TableCell key={cellIndex}>
                <Skeleton
                  className="my-1 h-7 px-4"
                  style={{ width: `${pseudoRandomWidth}%` }}
                />
              </TableCell>
            );
          })}
          <TableCell key={rowIndex * 100} className="text-right">
            <Skeleton className="ml-auto h-6 w-6" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
