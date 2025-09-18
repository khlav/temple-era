import { Skeleton } from "~/components/ui/skeleton";

export function ProfileEditorSkeleton() {
  return (
    <div className="flex flex-col items-start gap-6 md:flex-row">
      {/* Profile Avatar Skeleton */}
      <div className="mx-auto pt-4 md:mx-0">
        <Skeleton className="h-24 w-24 rounded-full" />
      </div>

      {/* Editable Fields Skeleton */}
      <div className="flex w-[200px] flex-col gap-4 md:w-auto">
        {/* Display Name Skeleton */}
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full rounded-md md:w-60" />
        </div>

        {/* Character ID Skeleton */}
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full rounded-md md:w-60" />
        </div>

        {/* Save Button Skeleton */}
        <div>
          <Skeleton className="h-10 w-full rounded-md md:w-auto" />
        </div>
      </div>
    </div>
  );
}
