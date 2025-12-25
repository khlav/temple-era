# Attendance Report Feature - Implementation Plan

## Feature Overview

Create a public attendance report page at `/attendance-report` that displays a raid attendance matrix where users can:

- Select multiple primary characters (as columns)
- Filter by date range (default: last 6 complete lockout weeks)
- Filter by zones (multiselect, default: Naxx, AQ40, MC, BWL)
- View attendance status (attended/benched/blank) for each character at each raid
- **Share reports via URL** - All filters encoded in URL parameters for easy sharing via Discord/email

## Requirements Summary

### Page Location & Access

- Path: `/attendance-report`
- Access: **Public** (no authentication required)
- Available to all website viewers
- **Shareable**: URL parameters encode entire report state

### Table Structure

- **Rows**: One per individual raid
- **Columns**: One per selected primary character (user can add/remove)
- **Cell Values**:
  - Attended = Swords icon (⚔️)
  - Benched = Armchair icon (🪑)
  - Did not attend = Blank/empty

### Filters & URL State

- **Timeframe**:
  - Default: Last 6 complete lockout weeks
  - Option: Custom date range picker
  - URL params: `?startDate=2025-01-01&endDate=2025-02-15`
- **Zones**:
  - Multiselect dropdown
  - Default selected: Naxx, AQ40, MC, BWL
  - URL param: `?zones=Naxxramas,Temple%20of%20Ahn'Qiraj,Molten%20Core,Blackwing%20Lair`
- **Characters**:
  - Selected character IDs
  - URL param: `?characters=123,456,789`

### Data Logic

- Use primary character IDs (alt attendance counts toward primary)
- Show ALL raids in filtered timeframe regardless of character join date
- Summary stats per character column: `⚔️ # 🪑 #`
- Hide icon + count if value is 0

---

## Implementation Guide

### PHASE 1: Backend (tRPC Router & Procedures)

#### File: `src/server/api/routers/attendanceReport.ts` (CREATE NEW)

```typescript
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  raids,
  characters,
  primaryRaidAttendeeAndBenchMap,
  reportDates,
} from "~/server/db/schema";
import { and, eq, gte, lte, inArray, desc } from "drizzle-orm";

export const attendanceReport = createTRPCRouter({
  /**
   * Main procedure: Fetches complete report data in one call
   * Returns raids, characters, attendance matrix, and summary stats
   */
  getReportData: publicProcedure
    .input(
      z.object({
        startDate: z.string().optional(), // ISO date string
        endDate: z.string().optional(),
        zones: z
          .array(z.string())
          .min(1)
          .default([
            "Naxxramas",
            "Temple of Ahn'Qiraj",
            "Molten Core",
            "Blackwing Lair",
          ]),
        primaryCharacterIds: z.array(z.number()).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // 1. Get date boundaries (use reportDates view if no custom dates)
      let startDate = input.startDate;
      let endDate = input.endDate;

      if (!startDate || !endDate) {
        const dates = await ctx.db.select().from(reportDates).limit(1);
        startDate = dates[0]?.reportPeriodStart?.toISOString().split("T")[0];
        endDate = dates[0]?.reportPeriodEnd?.toISOString().split("T")[0];
      }

      // 2. Build raid query filters
      const raidFilters = [
        gte(raids.date, startDate!),
        lte(raids.date, endDate!),
        inArray(raids.zone, input.zones),
      ];

      // 3. Fetch raids in date/zone range
      const raidsData = await ctx.db
        .select({
          raidId: raids.raidId,
          name: raids.name,
          date: raids.date,
          zone: raids.zone,
          attendanceWeight: raids.attendanceWeight,
        })
        .from(raids)
        .where(and(...raidFilters))
        .orderBy(desc(raids.date));

      // 4. Fetch characters (if specified, or return empty for selector)
      let charactersData: Array<{
        characterId: number;
        name: string;
        class: string;
      }> = [];

      if (input.primaryCharacterIds && input.primaryCharacterIds.length > 0) {
        const characterFilters = [
          eq(characters.isPrimary, true),
          eq(characters.isIgnored, false),
          inArray(characters.characterId, input.primaryCharacterIds),
        ];

        charactersData = await ctx.db
          .select({
            characterId: characters.characterId,
            name: characters.name,
            class: characters.class,
          })
          .from(characters)
          .where(and(...characterFilters))
          .orderBy(characters.name);
      }

      // 5. Fetch attendance data for these raids & characters
      const raidIds = raidsData.map((r) => r.raidId);
      const characterIds = charactersData.map((c) => c.characterId);

      let attendanceData: Array<{
        raidId: number;
        primaryCharacterId: number;
        status: string | null;
      }> = [];

      if (raidIds.length > 0 && characterIds.length > 0) {
        attendanceData = await ctx.db
          .select({
            raidId: primaryRaidAttendeeAndBenchMap.raidId,
            primaryCharacterId:
              primaryRaidAttendeeAndBenchMap.primaryCharacterId,
            status: primaryRaidAttendeeAndBenchMap.attendeeOrBench,
          })
          .from(primaryRaidAttendeeAndBenchMap)
          .where(
            and(
              inArray(primaryRaidAttendeeAndBenchMap.raidId, raidIds),
              inArray(
                primaryRaidAttendeeAndBenchMap.primaryCharacterId,
                characterIds,
              ),
            ),
          );
      }

      // 6. Calculate summary statistics
      const summaryMap = new Map<
        number,
        { attended: number; benched: number }
      >();

      for (const attendance of attendanceData) {
        const charId = attendance.primaryCharacterId;
        if (!summaryMap.has(charId)) {
          summaryMap.set(charId, { attended: 0, benched: 0 });
        }
        const summary = summaryMap.get(charId)!;

        if (attendance.status === "attendee") {
          summary.attended++;
        } else if (attendance.status === "bench") {
          summary.benched++;
        }
      }

      const summary = Array.from(summaryMap.entries()).map(
        ([charId, stats]) => ({
          primaryCharacterId: charId,
          attendedCount: stats.attended,
          benchedCount: stats.benched,
        }),
      );

      return {
        raids: raidsData,
        characters: charactersData,
        attendance: attendanceData,
        summary,
        dateRange: { startDate, endDate },
      };
    }),

  /**
   * Helper: Get all primary characters for the character selector dropdown
   */
  getPrimaryCharacters: publicProcedure.query(async ({ ctx }) => {
    return await ctx.db
      .select({
        characterId: characters.characterId,
        name: characters.name,
        class: characters.class,
      })
      .from(characters)
      .where(
        and(eq(characters.isPrimary, true), eq(characters.isIgnored, false)),
      )
      .orderBy(characters.name);
  }),
});
```

#### File: `src/server/api/root.ts` (MODIFY)

Add the new router to exports:

```typescript
import { attendanceReport } from "~/server/api/routers/attendanceReport";

export const appRouter = createTRPCRouter({
  raid: raid,
  raidLog: raidLog,
  character: character,
  recipe: recipe,
  dashboard: dashboard,
  profile: profile,
  user: user,
  search: searchRouter,
  discord: discordRouter,
  attendanceReport: attendanceReport, // ADD THIS LINE
});
```

---

### PHASE 2: Page & Main Component

#### File: `src/app/attendance-report/page.tsx` (CREATE NEW)

```typescript
import { Suspense } from "react";
import { AttendanceReportClient } from "~/components/attendance-report/attendance-report-client";
import { api } from "~/trpc/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Raid Attendance Report | Temple Raids",
  description: "View detailed raid attendance reports with customizable filters and date ranges",
};

export default async function AttendanceReportPage() {
  // Fetch initial data with defaults (6 weeks, default zones, no characters)
  const initialData = await api.attendanceReport.getReportData({
    zones: ["Naxxramas", "Temple of Ahn'Qiraj", "Molten Core", "Blackwing Lair"],
  });

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Raid Attendance Report</h1>
        <p className="text-muted-foreground mt-2">
          View and share detailed attendance reports. Select characters, adjust filters, and share the URL.
        </p>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <AttendanceReportClient initialData={initialData} />
      </Suspense>
    </div>
  );
}
```

#### File: `src/components/attendance-report/attendance-report-client.tsx` (CREATE NEW)

```typescript
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { api } from "~/trpc/react";
import { AttendanceReportTable } from "./attendance-report-table";
import { DateRangeFilter } from "./date-range-filter";
import { ZoneFilter } from "./zone-filter";
import { CharacterSelector } from "./character-selector";
import { AttendanceSummary } from "./attendance-summary";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Share2 } from "lucide-react";
import { useToast } from "~/hooks/use-toast";

const DEFAULT_ZONES = ["Naxxramas", "Temple of Ahn'Qiraj", "Molten Core", "Blackwing Lair"];

export function AttendanceReportClient({
  initialData
}: {
  initialData: any
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Parse URL parameters
  const urlStartDate = searchParams.get('startDate');
  const urlEndDate = searchParams.get('endDate');
  const urlZones = searchParams.get('zones')?.split(',') || DEFAULT_ZONES;
  const urlCharacters = searchParams.get('characters')?.split(',').map(Number).filter(Boolean) || [];

  // State
  const [startDate, setStartDate] = useState<string | undefined>(urlStartDate || undefined);
  const [endDate, setEndDate] = useState<string | undefined>(urlEndDate || undefined);
  const [selectedZones, setSelectedZones] = useState<string[]>(urlZones);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>(urlCharacters);

  // Fetch report data
  const { data, isLoading } = api.attendanceReport.getReportData.useQuery(
    {
      startDate,
      endDate,
      zones: selectedZones,
      primaryCharacterIds: selectedCharacterIds.length > 0 ? selectedCharacterIds : undefined,
    },
    {
      initialData,
      keepPreviousData: true,
    }
  );

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (selectedZones.length > 0) params.set('zones', selectedZones.join(','));
    if (selectedCharacterIds.length > 0) params.set('characters', selectedCharacterIds.join(','));

    router.push(`/attendance-report?${params.toString()}`, { scroll: false });
  }, [startDate, endDate, selectedZones, selectedCharacterIds, router]);

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
    if (!selectedCharacterIds.includes(characterId)) {
      setSelectedCharacterIds([...selectedCharacterIds, characterId]);
    }
  };

  const handleRemoveCharacter = (characterId: number) => {
    setSelectedCharacterIds(selectedCharacterIds.filter(id => id !== characterId));
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
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

            <CharacterSelector
              selectedCharacterIds={selectedCharacterIds}
              onAddCharacter={handleAddCharacter}
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

      {/* Summary Stats */}
      {data && data.characters.length > 0 && (
        <AttendanceSummary
          characters={data.characters}
          summary={data.summary}
          onRemoveCharacter={handleRemoveCharacter}
        />
      )}

      {/* Main Table */}
      {data && (
        <AttendanceReportTable
          raids={data.raids}
          characters={data.characters}
          attendance={data.attendance}
          isLoading={isLoading}
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
```

---

### PHASE 3: Filter Components

#### File: `src/components/attendance-report/date-range-filter.tsx` (CREATE NEW)

```typescript
"use client";

import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Calendar } from "~/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";

export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  defaultDateRange,
}: {
  startDate?: string;
  endDate?: string;
  onStartDateChange: (date: string | undefined) => void;
  onEndDateChange: (date: string | undefined) => void;
  defaultDateRange?: { startDate?: string; endDate?: string };
}) {
  const handleReset = () => {
    onStartDateChange(undefined);
    onEndDateChange(undefined);
  };

  const displayText = startDate && endDate
    ? `${format(new Date(startDate), 'MMM d, yyyy')} - ${format(new Date(endDate), 'MMM d, yyyy')}`
    : "Last 6 weeks (default)";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Start Date</label>
            <Calendar
              mode="single"
              selected={startDate ? new Date(startDate) : undefined}
              onSelect={(date) => onStartDateChange(date?.toISOString().split('T')[0])}
            />
          </div>
          <div>
            <label className="text-sm font-medium">End Date</label>
            <Calendar
              mode="single"
              selected={endDate ? new Date(endDate) : undefined}
              onSelect={(date) => onEndDateChange(date?.toISOString().split('T')[0])}
            />
          </div>
          <Button onClick={handleReset} variant="outline" className="w-full">
            Reset to Default (6 weeks)
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

#### File: `src/components/attendance-report/zone-filter.tsx` (CREATE NEW)

```typescript
"use client";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger
} from "~/components/ui/dropdown-menu";
import { Filter } from "lucide-react";

const ALL_ZONES = [
  "Molten Core",
  "Blackwing Lair",
  "Temple of Ahn'Qiraj",
  "Naxxramas",
  "Onyxia's Lair",
  "Zul'Gurub",
  "Ruins of Ahn'Qiraj",
];

export function ZoneFilter({
  selectedZones,
  onZonesChange,
}: {
  selectedZones: string[];
  onZonesChange: (zones: string[]) => void;
}) {
  const handleToggleZone = (zone: string, checked: boolean) => {
    if (checked) {
      onZonesChange([...selectedZones, zone]);
    } else {
      const filtered = selectedZones.filter(z => z !== zone);
      if (filtered.length > 0) {
        onZonesChange(filtered);
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Zones ({selectedZones.length})
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {ALL_ZONES.map(zone => (
          <DropdownMenuCheckboxItem
            key={zone}
            checked={selectedZones.includes(zone)}
            onCheckedChange={(checked) => handleToggleZone(zone, checked)}
          >
            {zone}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

#### File: `src/components/attendance-report/character-selector.tsx` (CREATE NEW)

```typescript
"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "~/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandEmpty,
  CommandGroup,
  CommandItem
} from "~/components/ui/command";
import { UserPlus } from "lucide-react";
import { api } from "~/trpc/react";
import { ClassIcon } from "~/components/ui/class-icon";

export function CharacterSelector({
  selectedCharacterIds,
  onAddCharacter,
}: {
  selectedCharacterIds: number[];
  onAddCharacter: (characterId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: characters } = api.attendanceReport.getPrimaryCharacters.useQuery();

  const availableCharacters = characters?.filter(
    char => !selectedCharacterIds.includes(char.characterId)
  ) || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Character
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search characters..." />
          <CommandEmpty>No characters found.</CommandEmpty>
          <CommandGroup className="max-h-[300px] overflow-auto">
            {availableCharacters.map(char => (
              <CommandItem
                key={char.characterId}
                onSelect={() => {
                  onAddCharacter(char.characterId);
                  setOpen(false);
                }}
              >
                <ClassIcon class={char.class} className="mr-2" />
                {char.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

---

### PHASE 4: Table & Cell Components

#### File: `src/components/attendance-report/attendance-report-table.tsx` (CREATE NEW)

```typescript
"use client";

import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Card, CardContent } from "~/components/ui/card";
import { Swords, Armchair } from "lucide-react";
import { format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export function AttendanceReportTable({
  raids,
  characters,
  attendance,
  isLoading,
}: {
  raids: Array<{ raidId: number; name: string; date: string; zone: string }>;
  characters: Array<{ characterId: number; name: string; class: string }>;
  attendance: Array<{ raidId: number; primaryCharacterId: number; status: string | null }>;
  isLoading: boolean;
}) {
  // Build attendance lookup map
  const attendanceMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const entry of attendance) {
      const key = `${entry.raidId}-${entry.primaryCharacterId}`;
      map.set(key, entry.status);
    }
    return map;
  }, [attendance]);

  const getAttendanceStatus = (raidId: number, characterId: number) => {
    const key = `${raidId}-${characterId}`;
    return attendanceMap.get(key) || null;
  };

  if (characters.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-20 min-w-[200px]">
                  Raid
                </TableHead>
                <TableHead className="min-w-[120px]">Zone</TableHead>
                <TableHead className="min-w-[100px]">Date</TableHead>
                {characters.map(char => (
                  <TableHead key={char.characterId} className="text-center min-w-[80px]">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          {char.name}
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{char.class}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {raids.map(raid => (
                <TableRow key={raid.raidId}>
                  <TableCell className="sticky left-0 bg-background font-medium">
                    {raid.name}
                  </TableCell>
                  <TableCell>{raid.zone}</TableCell>
                  <TableCell>{format(new Date(raid.date), 'MMM d, yyyy')}</TableCell>
                  {characters.map(char => {
                    const status = getAttendanceStatus(raid.raidId, char.characterId);
                    return (
                      <TableCell key={char.characterId} className="text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              {status === 'attendee' && (
                                <Swords className="inline h-5 w-5 text-chart-2" />
                              )}
                              {status === 'bench' && (
                                <Armchair className="inline h-5 w-5 text-muted-foreground" />
                              )}
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{raid.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {status === 'attendee' ? 'Attended' : status === 'bench' ? 'Benched' : 'Did not attend'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
```

#### File: `src/components/attendance-report/attendance-summary.tsx` (CREATE NEW)

```typescript
"use client";

import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Swords, Armchair, X } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";

export function AttendanceSummary({
  characters,
  summary,
  onRemoveCharacter,
}: {
  characters: Array<{ characterId: number; name: string; class: string }>;
  summary: Array<{ primaryCharacterId: number; attendedCount: number; benchedCount: number }>;
  onRemoveCharacter: (characterId: number) => void;
}) {
  const summaryMap = new Map(
    summary.map(s => [s.primaryCharacterId, s])
  );

  return (
    <div className="flex gap-2 flex-wrap">
      {characters.map(char => {
        const stats = summaryMap.get(char.characterId);
        const attended = stats?.attendedCount || 0;
        const benched = stats?.benchedCount || 0;

        return (
          <Card key={char.characterId}>
            <CardContent className="flex items-center gap-2 p-3">
              <ClassIcon class={char.class} />
              <span className="font-medium">{char.name}</span>

              {attended > 0 && (
                <Badge variant="default" className="gap-1">
                  <Swords size={14} />
                  {attended}
                </Badge>
              )}

              {benched > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Armchair size={14} />
                  {benched}
                </Badge>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => onRemoveCharacter(char.characterId)}
              >
                <X size={14} />
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

---

### PHASE 5: Navigation

#### File: `src/components/nav/app-sidebar.tsx` (MODIFY)

Add a new navigation item for the attendance report. Find the navigation items section and add:

```typescript
{
  title: "Attendance Report",
  url: "/attendance-report",
  icon: ClipboardList, // or appropriate icon
}
```

---

## URL Sharing Strategy

### URL Parameter Format

```
/attendance-report?startDate=2025-01-01&endDate=2025-02-15&zones=Naxxramas,Temple%20of%20Ahn'Qiraj&characters=123,456,789
```

### How It Works

1. **On Filter Change**: `useEffect` hook updates URL via `router.push()`
2. **On Page Load**: `useSearchParams` reads URL and sets initial state
3. **Share Button**: Copies `window.location.href` to clipboard
4. **Recipient**: Opens URL and sees exact same report configuration

### Benefits

- Works with Discord link previews
- Browser back/forward buttons work correctly
- Bookmarkable reports
- No database storage needed
- Public and shareable

---

## Implementation Checklist

- [ ] Phase 1: Create `attendanceReport.ts` router
- [ ] Phase 1: Add router to `root.ts`
- [ ] Phase 2: Create page at `/attendance-report/page.tsx`
- [ ] Phase 2: Create `attendance-report-client.tsx`
- [ ] Phase 3: Create `date-range-filter.tsx`
- [ ] Phase 3: Create `zone-filter.tsx`
- [ ] Phase 3: Create `character-selector.tsx`
- [ ] Phase 4: Create `attendance-report-table.tsx`
- [ ] Phase 4: Create `attendance-summary.tsx`
- [ ] Phase 5: Add navigation link to sidebar
- [ ] Test URL parameter encoding/decoding
- [ ] Test sharing via Discord
- [ ] Test with various filter combinations
- [ ] Test responsive design on mobile
- [ ] Verify performance with large datasets

---

## Testing URLs

After implementation, test with these URLs:

```
# No parameters (defaults)
/attendance-report

# Custom date range
/attendance-report?startDate=2025-01-01&endDate=2025-02-28

# Specific zones
/attendance-report?zones=Naxxramas,Temple%20of%20Ahn'Qiraj

# With characters
/attendance-report?characters=1,2,3

# Full configuration
/attendance-report?startDate=2025-01-01&endDate=2025-02-28&zones=Naxxramas&characters=1,2,3
```

---

## Notes

- All procedures use `publicProcedure` (no auth required)
- Uses existing database views (`primary_raid_attendee_and_bench_map`)
- Follows existing patterns from dashboard and character pages
- Icons from `lucide-react` (Swords, Armchair)
- ShadCN UI components throughout
- URL state automatically syncs with filter changes
