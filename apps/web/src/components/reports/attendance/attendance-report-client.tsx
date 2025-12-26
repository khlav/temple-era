"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { AttendanceReportTable } from "./attendance-report-table";
import { DateRangeFilter } from "./date-range-filter";
import { ZoneFilter } from "./zone-filter";
import { DayOfWeekFilter } from "./day-of-week-filter";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Share2, Swords } from "lucide-react";
import { useToast } from "~/hooks/use-toast";

const DEFAULT_ZONES = ["naxxramas", "aq40", "mc", "bwl"];

interface ReportFilters {
  startDate?: string;
  endDate?: string;
  zones: string[];
  daysOfWeek: string[];
  characterIds: number[];
  displayMode: "icons" | "names";
}

// Helper to parse URL params into filter state
function parseUrlParams(
  searchParams: URLSearchParams,
  defaultCharacterId?: number,
): ReportFilters {
  const urlStartDate = searchParams.get("startDate") || undefined;
  const urlEndDate = searchParams.get("endDate") || undefined;
  const urlZones =
    searchParams.get("zones")?.split(",").filter(Boolean) || DEFAULT_ZONES;
  const urlDays = searchParams.get("days")?.split(",").filter(Boolean) || [];
  const urlCharacters =
    searchParams.get("characters")?.split(",").map(Number).filter(Boolean) ||
    [];
  const urlDisplayMode = searchParams.get("displayMode");
  const displayMode =
    urlDisplayMode === "names" || urlDisplayMode === "icons"
      ? urlDisplayMode
      : "icons";

  return {
    startDate: urlStartDate,
    endDate: urlEndDate,
    zones: urlZones,
    daysOfWeek: urlDays,
    characterIds:
      urlCharacters.length > 0
        ? urlCharacters
        : defaultCharacterId
          ? [defaultCharacterId]
          : [],
    displayMode,
  };
}

// Helper to build URL params from filter state
function buildUrlParams(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.zones.length > 0) params.set("zones", filters.zones.join(","));
  if (filters.daysOfWeek.length > 0)
    params.set("days", filters.daysOfWeek.join(","));
  if (filters.characterIds.length > 0)
    params.set("characters", filters.characterIds.join(","));
  if (filters.displayMode !== "icons")
    params.set("displayMode", filters.displayMode);
  return params;
}

// Helper to compare two filter objects
function filtersEqual(a: ReportFilters, b: ReportFilters): boolean {
  return (
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.zones.length === b.zones.length &&
    a.zones.every((z) => b.zones.includes(z)) &&
    a.daysOfWeek.length === b.daysOfWeek.length &&
    a.daysOfWeek.every((d) => b.daysOfWeek.includes(d)) &&
    a.characterIds.length === b.characterIds.length &&
    a.characterIds.every((c) => b.characterIds.includes(c)) &&
    a.displayMode === b.displayMode
  );
}

export function AttendanceReportClient({
  initialData,
  defaultCharacterId,
}: {
  initialData: any;
  defaultCharacterId?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // State - initialize with defaults (will sync from URL on mount)
  const [filters, setFilters] = useState<ReportFilters>(() =>
    parseUrlParams(searchParams, defaultCharacterId),
  );
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize on mount (client-side only to avoid hydration mismatch)
  useEffect(() => {
    const initialFilters = parseUrlParams(searchParams, defaultCharacterId);
    setFilters(initialFilters);
    setIsInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Sync state with URL when it changes (browser back/forward)
  useEffect(() => {
    if (!isInitialized) return;

    const newFilters = parseUrlParams(searchParams, defaultCharacterId);
    if (!filtersEqual(filters, newFilters)) {
      setFilters(newFilters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isInitialized]);

  // Update URL when filters change
  useEffect(() => {
    if (!isInitialized) return;

    const params = buildUrlParams(filters);
    const currentUrl = params.toString();
    const urlFromSearch = buildUrlParams(
      parseUrlParams(searchParams, defaultCharacterId),
    ).toString();

    // Only update URL if it differs (prevents loops)
    if (currentUrl !== urlFromSearch) {
      router.push(`/reports/attendance?${currentUrl}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, isInitialized, router]);

  // Fetch report data
  const { data } = api.reports.getAttendanceReportData.useQuery(
    {
      startDate: filters.startDate,
      endDate: filters.endDate,
      zones: filters.zones,
      daysOfWeek:
        filters.daysOfWeek.length > 0 ? filters.daysOfWeek : undefined,
      primaryCharacterIds:
        filters.characterIds.length > 0 ? filters.characterIds : undefined,
    },
    {
      initialData: isInitialized ? undefined : initialData,
      staleTime: 0,
    },
  );

  // Sync default dates into state when available
  useEffect(() => {
    if (!isInitialized || !data?.dateRange) return;
    if (
      !filters.startDate &&
      !filters.endDate &&
      data.dateRange.startDate &&
      data.dateRange.endDate
    ) {
      setFilters((prev) => ({
        ...prev,
        startDate: data.dateRange.startDate,
        endDate: data.dateRange.endDate,
      }));
    }
  }, [data?.dateRange, isInitialized, filters.startDate, filters.endDate]);

  // Share URL handler
  const handleShareUrl = async () => {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    toast({
      title: "URL Copied!",
      description: "Share this link to show others this exact report",
    });
  };

  // Character management
  const handleAddCharacter = (characterId: number) => {
    if (filters.characterIds.length >= 10) {
      toast({
        title: "Character limit reached",
        description: "Maximum 10 characters can be selected",
        variant: "destructive",
      });
      return;
    }
    if (!filters.characterIds.includes(characterId)) {
      setFilters((prev) => ({
        ...prev,
        characterIds: [...prev.characterIds, characterId],
      }));
    }
  };

  const handleRemoveCharacter = (characterId: number) => {
    setFilters((prev) => ({
      ...prev,
      characterIds: prev.characterIds.filter((id) => id !== characterId),
    }));
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <DateRangeFilter
          startDate={filters.startDate}
          endDate={filters.endDate}
          onStartDateChange={(date) =>
            setFilters((prev) => ({ ...prev, startDate: date }))
          }
          onEndDateChange={(date) =>
            setFilters((prev) => ({ ...prev, endDate: date }))
          }
          defaultDateRange={data?.dateRange}
        />

        <ZoneFilter
          selectedZones={filters.zones}
          onZonesChange={(zones) => setFilters((prev) => ({ ...prev, zones }))}
        />

        <DayOfWeekFilter
          selectedDays={filters.daysOfWeek}
          onDaysChange={(days) =>
            setFilters((prev) => ({ ...prev, daysOfWeek: days }))
          }
        />

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleShareUrl}>
            <Share2 className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 rounded-md border p-1">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 px-3 text-xs ${
                filters.displayMode === "icons"
                  ? "bg-chart-2/10 text-chart-2"
                  : ""
              }`}
              onClick={() =>
                setFilters((prev) => ({ ...prev, displayMode: "icons" }))
              }
            >
              <Swords
                className={`h-3.5 w-3.5 ${
                  filters.displayMode === "icons"
                    ? "text-chart-2"
                    : "text-muted-foreground"
                }`}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 px-3 text-xs ${
                filters.displayMode === "names"
                  ? "bg-chart-2/10 text-chart-2"
                  : ""
              }`}
              onClick={() =>
                setFilters((prev) => ({ ...prev, displayMode: "names" }))
              }
            >
              Names
            </Button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      {data && (
        <AttendanceReportTable
          raids={data.raids}
          characters={data.characters}
          attendance={data.attendance}
          selectedCharacterIds={filters.characterIds}
          displayMode={filters.displayMode}
          onAddCharacter={handleAddCharacter}
          onRemoveCharacter={handleRemoveCharacter}
        />
      )}

      {/* Empty State */}
      {data && data.characters.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Select characters above to view their attendance report
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
