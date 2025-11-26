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
import { Separator } from "~/components/ui/separator";

export function RaidsTableSkeleton({ rows = 30 }: { rows?: number }) {
  return (
    <>
      <div className="space-y-2">
        <div className="space-y-1">
          <TableSearchInput isLoading={true} />
        </div>
        <div className="max-h-[calc(100vh-200px)] min-h-[600px] overflow-y-auto overflow-x-hidden">
          <Table className="max-h-[400px] whitespace-nowrap text-muted-foreground">
            <TableCaption className="text-wrap">
              Note: Only Tracked raids are considered for attendance
              restrictions.
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
                <TableHead className="w-1/4 text-center md:w-1/12">
                  WCL
                </TableHead>
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

export function RaidDetailSkeleton() {
  return (
    <div className="px-3">
      {/* Raid header */}
      <div className="flex gap-2 pb-0">
        <div className="grow-0">
          <Skeleton className="mb-2 h-8 w-64" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="grow" />
        <div className="align-right grow-0">
          <Skeleton className="mb-2 h-6 w-20" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="grow-0">
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      <Separator className="my-3" />

      {/* WCL logs and creator */}
      <div className="flex items-center gap-4">
        <div className="grow-0">
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="flex grow items-center gap-2">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="flex grow-0 items-center gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>

      <Separator className="my-3" />

      {/* Kills section */}
      <div className="flex gap-2">
        <div className="grow-0">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="flex shrink flex-wrap gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded" />
          ))}
        </div>
      </div>

      <Separator className="my-3" />

      {/* Attendees and Bench sections */}
      <div className="flex gap-2 xl:flex-nowrap">
        <div className="w-full xl:w-1/2">
          <div className="rounded-xl border bg-card p-3 shadow">
            <Skeleton className="mb-3 h-6 w-48" />
            <div className="my-1 flex justify-center">
              <Skeleton className="h-32 w-full" />
            </div>
            <div className="mb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Character</TableHead>
                    <TableHead>Server</TableHead>
                    <TableHead>Class</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Skeleton className="mx-auto h-4 w-64" />
          </div>
        </div>
        <div className="w-full xl:w-1/2">
          <div className="rounded-xl border bg-card p-3 shadow">
            <Skeleton className="mb-3 h-6 w-24" />
            <div className="mb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Character</TableHead>
                    <TableHead>Server</TableHead>
                    <TableHead>Class</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Separator className="m-auto my-3" />
            <Skeleton className="mx-auto h-4 w-64" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function RaidEditSkeleton() {
  return (
    <div className="px-2">
      {/* Similar to RaidDetailSkeleton but with form elements */}
      <div className="space-y-4">
        {/* Form header */}
        <div className="flex gap-2">
          <div className="grow-0">
            <Skeleton className="mb-2 h-8 w-64" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="grow" />
          <div className="grow-0">
            <Skeleton className="h-10 w-24" />
          </div>
        </div>

        <Separator />

        {/* Form fields */}
        <div className="space-y-4">
          <div>
            <Skeleton className="mb-2 h-5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div>
            <Skeleton className="mb-2 h-5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div>
            <Skeleton className="mb-2 h-5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div>
            <Skeleton className="mb-2 h-5 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        <Separator />

        {/* WCL logs section */}
        <div>
          <Skeleton className="mb-2 h-6 w-32" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>

        <Separator />

        {/* Bench section */}
        <div>
          <Skeleton className="mb-2 h-6 w-24" />
          <div className="rounded-xl border bg-card p-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Character</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Class</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <Separator />

        {/* Action buttons */}
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
    </div>
  );
}
