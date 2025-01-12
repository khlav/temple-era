import {TableCell, TableRow} from "~/components/ui/table";
import {Skeleton} from "~/components/ui/skeleton";
import React from "react";

export function RecentTrackedRaidsTableRowSkeleton() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: 2 }).map((_, cellIndex) => {
            // Create a deterministic pseudo-random value
            const seed = rowIndex * 3 + cellIndex; // Unique seed per cell
            const pseudoRandomWidth = 40 + ((seed * 45) % 31); // Generates widths between 40% and 80%
            return (
              <TableCell key={cellIndex}>
                <Skeleton className="h-7 my-1 px-4" style={{ width: `${pseudoRandomWidth}%` }} />
              </TableCell>
            );
          })}
          <TableCell key={rowIndex*100} className="text-center">
            <Skeleton className="h-6  w-6 m-auto" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}