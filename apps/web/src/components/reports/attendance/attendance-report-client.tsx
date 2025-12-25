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
import { Share2 } from "lucide-react";
import { useToast } from "~/hooks/use-toast";

const DEFAULT_ZONES = ["naxxramas", "aq40", "mc", "bwl"];

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

  // Initialize state - start with defaults to avoid hydration mismatch
  // We'll sync with URL params in useEffect (client-side only)
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);
  const [selectedZones, setSelectedZones] = useState<string[]>(DEFAULT_ZONES);
  const [selectedDaysOfWeek, setSelectedDaysOfWeek] = useState<string[]>([]); // Empty = all days
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>(
    defaultCharacterId ? [defaultCharacterId] : [],
  );
  const [isInitialized, setIsInitialized] = useState(false);

  // Sync with URL params on mount (client-side only) - this prevents hydration mismatch
  useEffect(() => {
    const urlStartDate = searchParams.get("startDate");
    const urlEndDate = searchParams.get("endDate");
    const urlZones = searchParams.get("zones")?.split(",").filter(Boolean);
    const urlDays = searchParams.get("days")?.split(",").filter(Boolean);
    const urlCharacters = searchParams
      .get("characters")
      ?.split(",")
      .map(Number)
      .filter(Boolean);

    if (urlStartDate) setStartDate(urlStartDate);
    if (urlEndDate) setEndDate(urlEndDate);
    if (urlZones && urlZones.length > 0) setSelectedZones(urlZones);
    if (urlDays && urlDays.length > 0) setSelectedDaysOfWeek(urlDays);
    if (urlCharacters && urlCharacters.length > 0) {
      setSelectedCharacterIds(urlCharacters);
    } else if (defaultCharacterId && urlCharacters?.length === 0) {
      // Only use default if no URL params
      setSelectedCharacterIds([defaultCharacterId]);
    }

    setIsInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Fetch report data
  // Only use initialData on the very first render (before URL sync)
  // After that, let the query refetch normally when inputs change
  // Fetch report data - query will automatically refetch when inputs change
  const { data } = api.reports.getAttendanceReportData.useQuery(
    {
      startDate,
      endDate,
      zones: selectedZones, // Pass instance identifiers
      daysOfWeek:
        selectedDaysOfWeek.length > 0 ? selectedDaysOfWeek : undefined,
      primaryCharacterIds:
        selectedCharacterIds.length > 0 ? selectedCharacterIds : undefined,
    },
    {
      // Only use initialData on the very first render (before URL sync)
      // After initialization, let the query refetch normally when inputs change
      initialData: isInitialized ? undefined : initialData,
      // Ensure fresh data when inputs change
      staleTime: 0,
    },
  );

  // Sync default dates into state when they're available (if no explicit dates are set)
  useEffect(() => {
    if (!isInitialized || !data?.dateRange) return;
    // Only sync defaults if no explicit dates are set
    if (
      !startDate &&
      !endDate &&
      data.dateRange.startDate &&
      data.dateRange.endDate
    ) {
      setStartDate(data.dateRange.startDate);
      setEndDate(data.dateRange.endDate);
    }
  }, [data?.dateRange, isInitialized, startDate, endDate]);

  // Update URL when filters change (skip initial mount to avoid hydration issues)
  useEffect(() => {
    if (!isInitialized) return; // Don't update URL until we've synced from URL params

    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (selectedZones.length > 0) params.set("zones", selectedZones.join(","));
    if (selectedDaysOfWeek.length > 0)
      params.set("days", selectedDaysOfWeek.join(","));
    if (selectedCharacterIds.length > 0)
      params.set("characters", selectedCharacterIds.join(","));

    router.push(`/reports/attendance?${params.toString()}`, { scroll: false });
  }, [
    startDate,
    endDate,
    selectedZones,
    selectedDaysOfWeek,
    selectedCharacterIds,
    router,
    isInitialized,
  ]);

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
    if (selectedCharacterIds.length >= 10) {
      toast({
        title: "Character limit reached",
        description: "Maximum 10 characters can be selected",
        variant: "destructive",
      });
      return;
    }
    if (!selectedCharacterIds.includes(characterId)) {
      setSelectedCharacterIds([...selectedCharacterIds, characterId]);
    }
  };

  const handleRemoveCharacter = (characterId: number) => {
    setSelectedCharacterIds(
      selectedCharacterIds.filter((id) => id !== characterId),
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              defaultDateRange={data?.dateRange}
            />

            <ZoneFilter
              selectedZones={selectedZones}
              onZonesChange={setSelectedZones}
            />

            <DayOfWeekFilter
              selectedDays={selectedDaysOfWeek}
              onDaysChange={setSelectedDaysOfWeek}
            />

            <Button
              variant="outline"
              size="sm"
              onClick={handleShareUrl}
              className="ml-auto"
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      {data && (
        <AttendanceReportTable
          raids={data.raids}
          characters={data.characters}
          attendance={data.attendance}
          selectedCharacterIds={selectedCharacterIds}
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
