"use client";

import { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { ChevronDown, ChevronRight, Copy, Loader2, Users } from "lucide-react";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import { useToast } from "~/hooks/use-toast";
import type { SignupMatchResult } from "~/server/api/routers/raid-helper";
import { getTalentRoleBySpecId, CLASS_SPECS } from "~/lib/class-specs";
import { ClassIcon } from "~/components/ui/class-icon";
import { ZoneSelect } from "./zone-select";
import { CUSTOM_ZONE_ID } from "~/lib/raid-zones";
import { CLASS_TEXT_COLORS, RAIDHELPER_STATUS_ICONS } from "./constants";

interface FindGamersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
  eventStartTime: number;
  detectedZone: string | null;
  currentSignups: SignupMatchResult[];
}

type TalentRole = "Tank" | "Healer" | "Melee" | "Ranged";

// Role icon component using AA role icons
function RoleIcon({
  role,
  size = 16,
  className,
}: {
  role: TalentRole;
  size?: number;
  className?: string;
}) {
  const roleFile = role.toLowerCase();
  return (
    <Image
      src={`/img/aa/role_${roleFile}.svg`}
      alt={role}
      width={size}
      height={size}
      className={className}
    />
  );
}

// Discord icon SVG component
function DiscordIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

// Map class to default role (used when we don't have spec info)
const CLASS_DEFAULT_ROLE: Record<string, TalentRole> = {
  Warrior: "Melee",
  Rogue: "Melee",
  Hunter: "Ranged",
  Mage: "Ranged",
  Warlock: "Ranged",
  Priest: "Healer",
  Paladin: "Healer",
  Druid: "Healer",
  Shaman: "Healer",
  Deathknight: "Melee",
  Monk: "Melee",
};

// Map spec names to spec IDs for role lookup
function getSpecIdByName(className: string, specName: string): number | null {
  const normalizedClass =
    className.charAt(0).toUpperCase() + className.slice(1).toLowerCase();
  const specs = CLASS_SPECS[normalizedClass as keyof typeof CLASS_SPECS];
  if (!specs) return null;

  const spec = specs.find(
    (s) => s.name.toLowerCase() === specName.toLowerCase(),
  );
  return spec?.id ?? null;
}

function inferTalentRole(className: string, specName?: string): TalentRole {
  // Try to get from spec first
  if (specName) {
    const specId = getSpecIdByName(className, specName);
    if (specId) {
      const role = getTalentRoleBySpecId(specId);
      if (role) return role;
    }
  }

  // Fall back to class default
  return CLASS_DEFAULT_ROLE[className] ?? "Melee";
}

export function FindGamersDialog({
  open,
  onOpenChange,
  eventId: _eventId,
  eventTitle,
  eventStartTime,
  detectedZone,
  currentSignups,
}: FindGamersDialogProps) {
  const { toast } = useToast();
  const [registeredOpen, setRegisteredOpen] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(
    new Set(),
  );
  const [selectedZone, setSelectedZone] = useState<string>(
    detectedZone ?? CUSTOM_ZONE_ID,
  );
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<string>(
    new Date(eventStartTime * 1000).getDay().toString(),
  );
  const [roleFilter, setRoleFilter] = useState<
    "all" | "tank" | "healer" | "melee" | "ranged"
  >("all");

  // ... (omitted helper functions) ...

  // Process current signups to get role distribution and primary character IDs
  const { roleDistribution, registeredPrimaryCharacterIds, statusMap } =
    useMemo(() => {
      const roles: Record<
        TalentRole,
        Array<{ name: string; class: string }>
      > = {
        Tank: [],
        Healer: [],
        Melee: [],
        Ranged: [],
      };
      const primaryIds = new Set<number>();
      // Map DiscordUserID -> Status (e.g. "Bench", "Late")
      const statusMap = new Map<string, string>();

      for (const signup of currentSignups) {
        if (signup.status === "skipped") {
          // Use userId (Discord ID) for mapping
          statusMap.set(signup.userId, signup.className);
          continue;
        }

        const characterName =
          signup.status === "matched" && signup.matchedCharacter
            ? signup.matchedCharacter.characterName
            : signup.discordName;

        const characterClass =
          signup.status === "matched" && signup.matchedCharacter
            ? signup.matchedCharacter.characterClass
            : signup.className;

        const role = inferTalentRole(characterClass, signup.specName);
        roles[role].push({ name: characterName, class: characterClass });

        // Track primary character ID for exclusion
        if (signup.status === "matched" && signup.matchedCharacter) {
          const primaryId =
            signup.matchedCharacter.primaryCharacterId ??
            signup.matchedCharacter.characterId;
          primaryIds.add(primaryId);
        }
      }

      return {
        roleDistribution: roles,
        registeredPrimaryCharacterIds: Array.from(primaryIds),
        statusMap,
      };
    }, [currentSignups]);

  // Fetch potential players
  const { data: potentialPlayersData, isLoading } =
    api.raidHelper.findPotentialPlayers.useQuery(
      {
        registeredPrimaryCharacterIds,
        filterZone:
          selectedZone === CUSTOM_ZONE_ID || !selectedZone
            ? null
            : selectedZone,
        filterDayOfWeek:
          selectedDayOfWeek !== "any" ? parseInt(selectedDayOfWeek) : null,
        roleFilter: "all", // Always fetch all, filter on client
      },
      { enabled: open },
    );

  const potentialPlayers = useMemo(() => {
    let players = potentialPlayersData?.potentialPlayers ?? [];

    if (roleFilter !== "all") {
      players = players.filter((p) =>
        p.familyRoles.some((r) => r.toLowerCase() === roleFilter),
      );
    }

    const deduped = new Map<number | string, (typeof players)[number]>();

    for (const p of players) {
      deduped.set(p.primaryCharacterId, p);
    }

    return Array.from(deduped.values()).sort((a, b) => {
      // 1. Status Priority
      const getStatusWeight = (p: (typeof players)[number]) => {
        const s = p.discordUserId ? statusMap.get(p.discordUserId) : null;
        if (!s) return 1; // No status
        if (s === "Bench") return 4;
        if (s === "Tentative") return 3;
        if (s === "Late") return 2;
        if (s === "Absence" || s === "Absent") return 0;
        return 1;
      };

      const statusDiff = getStatusWeight(b) - getStatusWeight(a);
      if (statusDiff !== 0) return statusDiff;

      // 2. Attendance (High -> Low)
      const attDiff = (b.attendanceCount ?? 0) - (a.attendanceCount ?? 0);
      if (attDiff !== 0) return attDiff;

      // 3. Role (Tank > Melee > Ranged > Healer)
      const getRoleWeight = (r: string) => {
        if (r === "Tank") return 4;
        if (r === "Melee") return 3;
        if (r === "Ranged") return 2;
        if (r === "Healer") return 1;
        return 0;
      };
      const getPlayerRoleWeight = (p: (typeof players)[number]) => {
        if (!p.familyRoles || p.familyRoles.length === 0) return 0;
        return Math.max(...p.familyRoles.map(getRoleWeight));
      };

      const roleDiff = getPlayerRoleWeight(b) - getPlayerRoleWeight(a);
      if (roleDiff !== 0) return roleDiff;

      // 4. Name (A-Z)
      return a.characterName.localeCompare(b.characterName);
    });
  }, [potentialPlayersData?.potentialPlayers, roleFilter, statusMap]);

  // Handle player selection
  const togglePlayerSelection = useCallback((playerId: number) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }, []);

  // Generate Discord pings
  const handleCopyPings = useCallback(() => {
    const selectedPlayers = potentialPlayers.filter((p) =>
      selectedPlayerIds.has(p.primaryCharacterId),
    );

    const playersWithDiscord = selectedPlayers.filter((p) => p.discordUserId);
    const playersWithoutDiscord = selectedPlayers.filter(
      (p) => !p.discordUserId,
    );

    if (playersWithDiscord.length === 0) {
      toast({
        title: "No Discord links",
        description:
          "None of the selected players have Discord accounts linked.",
        variant: "destructive",
      });
      return;
    }

    const pings = playersWithDiscord
      .map((p) => `<@${p.discordUserId}>`)
      .join(" ");
    const message = `Looking for more for ${eventTitle}: ${pings}`;

    void navigator.clipboard.writeText(message).then(() => {
      const extraInfo =
        playersWithoutDiscord.length > 0
          ? ` (${playersWithoutDiscord.length} player(s) without Discord not included)`
          : "";
      toast({
        title: "Copied to clipboard",
        description: `${playersWithDiscord.length} Discord ping(s) copied${extraInfo}`,
      });
    });
  }, [potentialPlayers, selectedPlayerIds, eventTitle, toast]);

  const selectedCount = selectedPlayerIds.size;
  const totalRegistered = currentSignups.filter(
    (s) => s.status !== "skipped",
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between gap-4">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {eventTitle} - Find Gamers
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Currently Registered Section */}
          <Collapsible open={registeredOpen} onOpenChange={setRegisteredOpen}>
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border bg-muted/30 p-3 hover:bg-muted/50">
              {registeredOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <span className="font-medium">
                Currently Registered ({totalRegistered})
              </span>
              <div className="ml-auto flex gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <RoleIcon role="Tank" size={14} />
                  {roleDistribution.Tank.length}
                </span>
                <span className="flex items-center gap-1">
                  <RoleIcon role="Melee" size={14} />
                  {roleDistribution.Melee.length}
                </span>
                <span className="flex items-center gap-1">
                  <RoleIcon role="Ranged" size={14} />
                  {roleDistribution.Ranged.length}
                </span>
                <span className="flex items-center gap-1">
                  <RoleIcon role="Healer" size={14} />
                  {roleDistribution.Healer.length}
                </span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-4">
                {(["Tank", "Melee", "Ranged", "Healer"] as TalentRole[]).map(
                  (role) => (
                    <div key={role}>
                      <div className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground">
                        <RoleIcon role={role} size={14} />
                        {role}
                        {["Tank", "Healer"].indexOf(role) >= 0 ? "s" : ""} (
                        {roleDistribution[role].length})
                      </div>
                      <ul className="space-y-0.5">
                        {roleDistribution[role]
                          .sort((a, b) => {
                            // Sort by Class then Name
                            const classCompare = a.class.localeCompare(b.class);
                            if (classCompare !== 0) return classCompare;
                            return a.name.localeCompare(b.name);
                          })
                          .map((player, i) => {
                            const textColor =
                              CLASS_TEXT_COLORS[player.class] ??
                              "text-muted-foreground";
                            const StatusIcon =
                              RAIDHELPER_STATUS_ICONS[player.class];

                            return (
                              <li
                                key={i}
                                className={cn(
                                  "flex items-center gap-1.5 truncate",
                                  textColor,
                                )}
                              >
                                {StatusIcon ? (
                                  <StatusIcon className="h-3.5 w-3.5 opacity-70" />
                                ) : (
                                  <ClassIcon
                                    characterClass={player.class}
                                    px={14}
                                  />
                                )}
                                {player.name}
                              </li>
                            );
                          })}
                        {roleDistribution[role].length === 0 && (
                          <li className="text-muted-foreground/60">None</li>
                        )}
                      </ul>
                    </div>
                  ),
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm">
              <span>Zone:</span>
              <ZoneSelect
                value={selectedZone}
                onValueChange={setSelectedZone}
                className="w-60"
              />
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span>Day:</span>
              <Select
                value={selectedDayOfWeek}
                onValueChange={setSelectedDayOfWeek}
              >
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue placeholder="Any Day" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any" className="py-1 text-xs">
                    Any Day
                  </SelectItem>
                  <SelectItem value="0" className="py-1 text-xs">
                    Sunday
                  </SelectItem>
                  <SelectItem value="1" className="py-1 text-xs">
                    Monday
                  </SelectItem>
                  <SelectItem value="2" className="py-1 text-xs">
                    Tuesday
                  </SelectItem>
                  <SelectItem value="3" className="py-1 text-xs">
                    Wednesday
                  </SelectItem>
                  <SelectItem value="4" className="py-1 text-xs">
                    Thursday
                  </SelectItem>
                  <SelectItem value="5" className="py-1 text-xs">
                    Friday
                  </SelectItem>
                  <SelectItem value="6" className="py-1 text-xs">
                    Saturday
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span>Role:</span>
              <Select
                value={roleFilter}
                onValueChange={(value) =>
                  setRoleFilter(
                    value as "all" | "tank" | "healer" | "melee" | "ranged",
                  )
                }
              >
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="py-1 text-xs">
                    All Roles
                  </SelectItem>
                  <SelectItem value="tank" className="py-1 text-xs">
                    <div className="flex items-center gap-2">
                      <RoleIcon role="Tank" size={14} />
                      <span>Tanks</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="melee" className="py-1 text-xs">
                    <div className="flex items-center gap-2">
                      <RoleIcon role="Melee" size={14} />
                      <span>Melee</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ranged" className="py-1 text-xs">
                    <div className="flex items-center gap-2">
                      <RoleIcon role="Ranged" size={14} />
                      <span>Ranged</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="healer" className="py-1 text-xs">
                    <div className="flex items-center gap-2">
                      <RoleIcon role="Healer" size={14} />
                      <span>Healers</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Potential Players Table */}
          <div className="rounded-lg border">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
              <span className="grow font-medium">
                Potential Players ({potentialPlayers.length})
              </span>

              <span className="text-sm text-muted-foreground">
                {selectedCount} selected
              </span>
              <Button
                onClick={handleCopyPings}
                disabled={selectedCount === 0}
                size="sm"
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy Discord Ping
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading potential players...
              </div>
            ) : potentialPlayers.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {registeredPrimaryCharacterIds.length > 0
                  ? "Matching players already signed up!"
                  : "No potential players found matching filters."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-full">Character</TableHead>
                    <TableHead
                      className="w-[140px] min-w-[140px] whitespace-nowrap text-center"
                      style={{ width: 140 }}
                    >
                      Class
                    </TableHead>
                    <TableHead
                      className="w-[110px] min-w-[110px] whitespace-nowrap text-center"
                      style={{ width: 110 }}
                    >
                      Role
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-center">
                      <TooltipProvider>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <div className="flex cursor-help justify-end">
                              <span className="text-nowrap border-b border-dotted border-muted-foreground/50 text-muted-foreground hover:text-foreground">
                                Last 6 Wks
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="bg-secondary text-secondary-foreground">
                            <p>
                              Attendance over the last 6 weeks matching
                              <br />
                              current Zone + Day filters.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-center">
                      <TooltipProvider>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <div className="mx-auto w-fit cursor-help">
                              <DiscordIcon
                                size={16}
                                className="text-muted-foreground opacity-60 transition-opacity hover:text-foreground hover:opacity-100"
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="bg-secondary text-secondary-foreground">
                            <p>Discord account linked?</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {potentialPlayers.map((player) => (
                    <TableRow
                      key={player.primaryCharacterId}
                      className={cn(
                        "cursor-pointer",
                        selectedPlayerIds.has(player.primaryCharacterId) &&
                          "bg-primary/10",
                        player.discordUserId &&
                          ["absence", "absent"].includes(
                            (
                              statusMap.get(player.discordUserId) ?? ""
                            ).toLowerCase(),
                          ) &&
                          "opacity-60 grayscale",
                      )}
                      onClick={() =>
                        togglePlayerSelection(player.primaryCharacterId)
                      }
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedPlayerIds.has(
                            player.primaryCharacterId,
                          )}
                          onCheckedChange={() =>
                            togglePlayerSelection(player.primaryCharacterId)
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {player.characterName}
                          {(() => {
                            const status = player.discordUserId
                              ? statusMap.get(player.discordUserId)
                              : null;
                            if (!status) return null;

                            const StatusIcon = RAIDHELPER_STATUS_ICONS[status];

                            return (
                              <TooltipProvider>
                                <Tooltip delayDuration={0}>
                                  <TooltipTrigger asChild>
                                    <div className="flex cursor-help items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                                      {StatusIcon && (
                                        <StatusIcon className="h-3 w-3" />
                                      )}
                                      <span className="font-semibold">
                                        {status}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent className="bg-secondary text-secondary-foreground">
                                    <p>
                                      Signed up as <strong>{status}</strong>
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-nowrap justify-center gap-1">
                          {(
                            player.familyClasses ?? [player.characterClass]
                          ).map((cls) => {
                            const names =
                              player.familyClassNames?.[cls]?.join(", ") ??
                              "Unknown";
                            return (
                              <TooltipProvider key={cls}>
                                <Tooltip delayDuration={0}>
                                  <TooltipTrigger asChild>
                                    <div className="inline-block cursor-help">
                                      <ClassIcon characterClass={cls} px={20} />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent className="bg-secondary text-secondary-foreground">
                                    <p>{names}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-nowrap justify-center gap-1">
                          {(player.familyRoles ?? [player.talentRole]).map(
                            (role) => (
                              <RoleIcon
                                key={role}
                                role={role as TalentRole}
                                size={20}
                                className="inline-block"
                              />
                            ),
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-0.5">
                          {player.recentAttendance.map(
                            (attended: boolean, i: number) => (
                              <div
                                key={i}
                                className={cn(
                                  "h-2 w-2 rounded-[1px]",
                                  attended ? "bg-primary" : "bg-muted",
                                )}
                              />
                            ),
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {player.discordUserId ? (
                          <div className="flex justify-center">
                            <DiscordIcon size={16} className="text-[#5865F2]" />
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
