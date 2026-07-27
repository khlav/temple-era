import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

export function SoftResScanSkeleton() {
  return (
    <div className="space-y-4">
      {/* Raid info header */}
      <div className="space-y-1">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Character</TableHead>
              <TableHead>Class - Specialization</TableHead>
              <TableHead>Items SR'd</TableHead>
              <TableHead>Matching Rules</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-28" />
                    {/* Secondary character name skeleton (sometimes shown) */}
                    {i % 3 === 0 && <Skeleton className="h-3 w-20" />}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {/* Variable number of items per character */}
                    {Array.from({ length: i % 3 === 0 ? 2 : 1 }).map((_, j) => (
                      <Skeleton key={j} className="h-4 w-32" />
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {/* Variable number of rule badges */}
                    {Array.from({
                      length: i % 4 === 0 ? 2 : i % 4 === 1 ? 1 : 0,
                    }).map((_, j) => (
                      <Skeleton key={j} className="h-5 w-24 rounded-full" />
                    ))}
                    {i % 4 === 3 && <Skeleton className="h-3 w-20" />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
