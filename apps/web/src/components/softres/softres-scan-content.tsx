import { SoftResScanTable } from "./softres-scan-table";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type { SoftResScanResponse } from "~/server/api/routers/softres";

export function SoftResScanContent({ data }: { data: SoftResScanResponse }) {
  if (!data) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No Data</AlertTitle>
        <AlertDescription>
          No data available for this SoftRes raid.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-lg font-semibold">
          <a
            href={`https://softres.it/raid/${data.raidId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            https://softres.it/raid/{data.raidId}
          </a>
        </div>
        <div className="text-sm text-muted-foreground">
          {data.zone ?? data.instance}{" "}
          {data.raidDate && (
            <>— {new Date(data.raidDate).toLocaleDateString()}</>
          )}
        </div>
      </div>

      <SoftResScanTable results={data.results} />
    </div>
  );
}
