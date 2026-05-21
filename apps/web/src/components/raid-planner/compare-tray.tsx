"use client";

import { Fragment, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { ClassIcon } from "~/components/ui/class-icon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useCompareTray, type PinnedCharacter } from "./compare-tray-context";
import { WOW_CLASSES_SET } from "./constants";
import { RAID_ZONE_CONFIG } from "~/lib/raid-zones";

const FALLBACK_ZONE = "naxxramas";
const ALL_ZONE_INSTANCES = RAID_ZONE_CONFIG.map((z) => z.instance) as string[];

const DAYS = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

function getLockoutWeekStart(dateStr: string): string {
  const parts = dateStr.split("-");
  const date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  const dayOfWeek = date.getUTCDay();
  const daysBack = (dayOfWeek + 5) % 7;
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date.toISOString().split("T")[0]!;
}

function formatWeekLabel(weekStart: string): string {
  const parts = weekStart.split("-");
  const date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return `${m}/${d}`;
}

type WeekStatus = "attendee" | "bench" | "absent";

interface WeekRaid {
  name: string;
  status: WeekStatus;
}

interface WeekData {
  week: string;
  status: WeekStatus;
  raids: WeekRaid[];
}

function buildWeekData(
  raids: Array<{ raidId: number; name: string; date: string }>,
  attendance: Array<{ raidId: number; primaryCharacterId: number; status: string | null }>,
  primaryCharacterId: number,
): WeekData[] {
  const raidWeekMap = new Map<number, string>();
  const weekSet = new Set<string>();
  for (const raid of raids) {
    const week = getLockoutWeekStart(String(raid.date));
    raidWeekMap.set(raid.raidId, week);
    weekSet.add(week);
  }

  const weekStatusMap = new Map<string, WeekStatus>();
  const weekRaidsMap = new Map<string, WeekRaid[]>();
  for (const week of weekSet) {
    weekStatusMap.set(week, "absent");
    weekRaidsMap.set(week, []);
  }

  const attendanceByRaid = new Map<number, WeekStatus>();
  for (const entry of attendance) {
    if (entry.primaryCharacterId !== primaryCharacterId) continue;
    const next: WeekStatus = entry.status === "attendee" ? "attendee" : "bench";
    attendanceByRaid.set(entry.raidId, next);
  }

  for (const raid of raids) {
    const week = raidWeekMap.get(raid.raidId);
    if (!week) continue;
    const raidStatus = attendanceByRaid.get(raid.raidId) ?? "absent";

    weekRaidsMap.get(week)!.push({ name: raid.name, status: raidStatus });

    const current = weekStatusMap.get(week)!;
    if (current === "absent" || (current === "bench" && raidStatus === "attendee")) {
      weekStatusMap.set(week, raidStatus);
    }
  }

  return Array.from(weekSet)
    .sort()
    .reverse()
    .map((week) => ({
      week,
      status: weekStatusMap.get(week)!,
      raids: weekRaidsMap.get(week)!,
    }));
}

const DOT_CLASSES: Record<WeekStatus, string> = {
  attendee: "bg-emerald-500",
  bench: "bg-amber-400",
  absent: "bg-muted-foreground/20",
};

function AttendanceDot({ status }: { status: WeekStatus }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 cursor-default rounded-full ${DOT_CLASSES[status]}`}
    />
  );
}

function WeeksTooltipContent({
  character,
  weeks,
}: {
  character: PinnedCharacter;
  weeks: WeekData[];
}) {
  const rows = weeks.flatMap((weekData) =>
    weekData.raids.length === 0
      ? [
          {
            week: weekData.week,
            symbol: "–",
            symbolClass: "text-muted-foreground/40",
            name: "No raids",
            nameClass: "text-muted-foreground/50",
          },
        ]
      : weekData.raids.map((r) => ({
          week: weekData.week,
          symbol: r.status === "attendee" ? "✓" : r.status === "bench" ? "~" : "✗",
          symbolClass:
            r.status === "attendee"
              ? "text-emerald-400"
              : r.status === "bench"
                ? "text-amber-400"
                : "text-muted-foreground/60",
          name: r.name,
          nameClass: r.status === "absent" ? "text-muted-foreground/50" : "text-foreground",
        })),
  );

  const isWowClass = !!character.characterClass && WOW_CLASSES_SET.has(character.characterClass);

  return (
    <div className="max-h-64 overflow-y-auto">
      <div className="mb-1.5 flex items-center gap-1 text-xs">
        {isWowClass && character.characterClass && (
          <ClassIcon characterClass={character.characterClass} px={12} />
        )}
        <span className="font-bold text-foreground">{character.characterName}</span>
        <span className="text-muted-foreground">Lockout Wk &amp; Raid</span>
      </div>
      <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-2 gap-y-0.5 text-xs">
        {rows.map((row, i) => (
          <Fragment key={i}>
            <span className="text-muted-foreground whitespace-nowrap">
              {formatWeekLabel(row.week)}
            </span>
            <span className={`text-center ${row.symbolClass}`}>{row.symbol}</span>
            <span className={row.nameClass}>{row.name}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function CharacterColumn({
  character,
  raids,
  attendance,
  onUnpin,
}: {
  character: PinnedCharacter;
  raids: Array<{ raidId: number; name: string; date: string }>;
  attendance: Array<{ raidId: number; primaryCharacterId: number; status: string | null }>;
  onUnpin: () => void;
}) {
  const weeks = buildWeekData(raids, attendance, character.primaryCharacterId);
  const attended = weeks.filter((w) => w.status === "attendee").length;
  const benched = weeks.filter((w) => w.status === "bench").length;
  const denominator = weeks.length;
  const pct = denominator > 0 ? Math.round(((attended + benched * 0.5) / denominator) * 100) : null;
  const isWowClass = !!character.characterClass && WOW_CLASSES_SET.has(character.characterClass);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-md border border-border/50 bg-muted/30 p-2">
          <div className="flex items-center justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1">
              {isWowClass && character.characterClass && (
                <ClassIcon characterClass={character.characterClass} px={12} />
              )}
              <span className="truncate text-xs font-medium">{character.characterName}</span>
            </div>
            <button
              type="button"
              onClick={onUnpin}
              className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Remove ${character.characterName} from compare`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            {weeks.length > 0 ? (
              <div className="flex items-center gap-1">
                {weeks.map((w) => (
                  <AttendanceDot key={w.week} status={w.status} />
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground">No data</span>
            )}
            {pct !== null && <span className="ml-1 text-[10px] text-muted-foreground">{pct}%</span>}
          </div>
        </div>
      </TooltipTrigger>
      {weeks.length > 0 && (
        <TooltipContent side="top" className="dark border-none bg-secondary text-muted-foreground">
          <WeeksTooltipContent character={character} weeks={weeks} />
        </TooltipContent>
      )}
    </Tooltip>
  );
}

function EmptySlot() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center rounded-md border border-dashed border-border/30 p-2">
      <span className="text-[10px] text-muted-foreground/40">Pin a character</span>
    </div>
  );
}

interface CompareTrayProps {
  defaultZone?: string;
  defaultDay?: string;
}

export function CompareTray({ defaultZone, defaultDay }: CompareTrayProps) {
  const { pinnedCharacters, unpinCharacter } = useCompareTray();

  const [selectedZone, setSelectedZone] = useState(defaultZone ?? FALLBACK_ZONE);
  const [selectedDay, setSelectedDay] = useState(defaultDay ?? "all");

  const primaryIds = pinnedCharacters.map((c) => c.primaryCharacterId);

  const zones = ALL_ZONE_INSTANCES.includes(selectedZone) ? [selectedZone] : [FALLBACK_ZONE];
  const daysOfWeek = selectedDay !== "all" ? [selectedDay] : undefined;

  const { data, isLoading } = api.reports.getAttendanceReportData.useQuery(
    { primaryCharacterIds: primaryIds, zones, daysOfWeek },
    { enabled: pinnedCharacters.length > 0 },
  );

  if (pinnedCharacters.length === 0) return null;

  const raids = data?.raids ?? [];
  const attendance = data?.attendance ?? [];

  const uniqueLockouts = new Set(raids.map((r) => getLockoutWeekStart(String(r.date)))).size;
  const raidCountLabel = isLoading
    ? "…"
    : `${uniqueLockouts} lockout${uniqueLockouts !== 1 ? "s" : ""}`;

  const reportParams = new URLSearchParams({
    characters: primaryIds.join(","),
    zones: selectedZone,
    ...(selectedDay !== "all" && { days: selectedDay }),
  });
  const reportUrl = `/reports/attendance?${reportParams.toString()}`;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 shadow-lg backdrop-blur-sm">
        {/* Header row */}
        <div className="flex flex-col gap-1 border-b border-border/40 px-4 py-1.5 md:flex-row md:items-center md:gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-foreground">Attendance</span>
            <span className="text-xs text-muted-foreground">Last {raidCountLabel}</span>
            <Select value={selectedZone} onValueChange={setSelectedZone}>
              <SelectTrigger className="h-6 w-auto gap-1 border-0 bg-transparent px-1.5 text-xs shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RAID_ZONE_CONFIG.map((z) => (
                  <SelectItem key={z.instance} value={z.instance} className="text-xs">
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedDay} onValueChange={setSelectedDay}>
              <SelectTrigger className="h-6 w-auto gap-1 border-0 bg-transparent px-1.5 text-xs shadow-none focus:ring-0">
                <SelectValue placeholder="All days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All days
                </SelectItem>
                {DAYS.map((d) => (
                  <SelectItem key={d.value} value={d.value} className="text-xs">
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 md:ml-auto">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> attended
              <span className="ml-1 inline-block h-2 w-2 rounded-full bg-amber-400" /> bench
            </div>
            <Link
              href={reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              Full report
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
        {/* Character columns */}
        <div className="mx-auto grid max-w-screen-xl grid-cols-3 items-stretch gap-2 px-4 py-2 md:grid-cols-6">
          {pinnedCharacters.map((char) => (
            <CharacterColumn
              key={char.planCharacterId}
              character={char}
              raids={raids}
              attendance={attendance}
              onUnpin={() => unpinCharacter(char.planCharacterId)}
            />
          ))}
          {Array.from({ length: 6 - pinnedCharacters.length }).map((_, i) => (
            <EmptySlot key={i} />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
