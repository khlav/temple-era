import { Skeleton } from "~/components/ui/skeleton";
import React from "react";

export function CharacterManagerRowSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr
          key={rowIndex}
          className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
        >
          {Array.from({ length: 2 }).map((_, cellIndex) => {
            // Create a deterministic pseudo-random value
            const seed = rowIndex * 3 + cellIndex; // Unique seed per cell
            const pseudoRandomWidth = 40 + ((seed * 45) % 31); // Generates widths between 40% and 80%
            return (
              <td
                key={cellIndex}
                className="p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]"
              >
                <Skeleton
                  className="my-1 h-7 px-4"
                  style={{ width: `${pseudoRandomWidth}%` }}
                />
              </td>
            );
          })}
          <td
            key={rowIndex * 100}
            className="p-2 text-right align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]"
          >
            <Skeleton className="ml-auto h-6 w-6" />
          </td>
        </tr>
      ))}
    </>
  );
}
