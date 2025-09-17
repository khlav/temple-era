import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Skeleton } from "~/components/ui/skeleton";
import React from "react";
import { TableSearchInput } from "~/components/ui/table-search-input";

export function RaidsTableSkeleton({ rows = 30 }: { rows?: number }) {
  return (
    <>
      <div className="space-y-2">
        <div className="space-y-1">
          <TableSearchInput onDebouncedChange={() => {}} isLoading={true} />
        </div>
      <div className="max-h-[calc(100vh-200px)] min-h-[600px] overflow-y-auto overflow-x-hidden">
        <Table className="text-muted-foreground max-h-[400px] whitespace-nowrap">
          <TableCaption className="text-wrap">
            Note: Only Tracked raids are considered for attendance restrictions.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/2 md:w-4/12">Raids</TableHead>
              <TableHead className="hidden md:table-cell md:w-2/12">
                Zone
              </TableHead>
              <TableHead className="hidden md:table-cell md:w-2/12">
                Date
              </TableHead>
              <TableHead className="w-1/4 md:w-2/12">Attendance</TableHead>
              <TableHead className="hidden md:table-cell md:w-1/12">
                Created By
              </TableHead>
              <TableHead className="w-1/4 text-center md:w-1/12">WCL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: 5 }).map((_, cellIndex) => {
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
                  <Skeleton className="m-auto h-4 w-4" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      </div>
      {/*<Table className="max-h-[400px]">*/}
      {/*  <TableHeader>*/}
      {/*    <TableRow>*/}
      {/*      <TableHead className="w-3/4">*/}
      {/*        Characters*/}
      {/*      </TableHead>*/}
      {/*      <TableHead className="w-1/3">Server</TableHead>*/}
      {/*      <TableHead className="w-1/3">Class</TableHead>*/}
      {/*    </TableRow>*/}
      {/*  </TableHeader>*/}
      {/*  <TableBody>*/}
      {/*    {Array.from({ length: rows }).map((_, rowIndex) => (*/}
      {/*      <TableRow key={rowIndex}>*/}
      {/*        {Array.from({ length: 5 }).map((_, cellIndex) => {*/}
      {/*          // Create a deterministic pseudo-random value*/}
      {/*          const seed = rowIndex * 3 + cellIndex; // Unique seed per cell*/}
      {/*          const pseudoRandomWidth = 40 + ((seed * 45) % 31); // Generates widths between 40% and 80%*/}
      {/*          return (*/}
      {/*            <TableCell key={cellIndex}>*/}
      {/*              <Skeleton*/}
      {/*                className="my-1 h-4 px-2"*/}
      {/*                style={{ width: `${pseudoRandomWidth}%` }}*/}
      {/*              />*/}
      {/*            </TableCell>*/}
      {/*          );*/}
      {/*        })}*/}
      {/*      </TableRow>*/}
      {/*    ))}*/}
      {/*  </TableBody>*/}
      {/*</Table>*/}
    </>
  );
}
