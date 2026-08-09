"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Info, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import type { SoftResScanResult } from "~/server/api/routers/softres";
import { CharacterLink } from "~/components/ui/character-link";
import { ClassIcon } from "~/components/ui/class-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useItemIcon, getItemIconUrl } from "~/hooks/use-item-icon";

const iconMap = {
  Info,
  AlertTriangle,
  XCircle,
};

// Standard WoW item-quality text colors
const qualityColors: Record<string, string> = {
  Epic: "text-purple-600 dark:text-purple-400",
  Rare: "text-blue-600 dark:text-blue-400",
  Uncommon: "text-green-600 dark:text-green-500",
};

const levelColors = {
  info: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  highlight: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  warning: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  inactive: "bg-transparent italic text-orange-700 dark:text-orange-400 border-orange-500/20",
  error: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

/**
 * Small item icon fetched from Wowhead's tooltip API, mirroring the
 * spell-icon loading pattern in ui/aa-icons.tsx (placeholder while loading,
 * fallback icon on error).
 */
function SoftResItemIcon({ itemId }: { itemId: number }) {
  const { icon, loading } = useItemIcon(itemId);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgErrored, setImgErrored] = useState(false);

  const size = 18;
  const showPlaceholder = loading || !icon || (!imgLoaded && !imgErrored);

  if (!loading && (!icon || imgErrored)) {
    return (
      <HelpCircle
        className="shrink-0 text-muted-foreground"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {showPlaceholder && (
        <HelpCircle
          className="absolute inset-0 text-muted-foreground"
          style={{ width: size, height: size }}
        />
      )}
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={getItemIconUrl(icon, "small")}
          alt=""
          width={size}
          height={size}
          className={imgLoaded ? "rounded-sm" : "opacity-0"}
          style={{ width: size, height: size }}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgErrored(true)}
        />
      )}
    </span>
  );
}

export function SoftResScanTable({ results }: { results: SoftResScanResult[] }) {
  const searchParams = useSearchParams();
  const showInactiveFlags = searchParams.has("debug");

  if (results.length === 0) {
    return (
      <div className="rounded-md border p-4 text-center text-muted-foreground">
        No characters found in this SoftRes raid.
      </div>
    );
  }

  return (
    <div className="w-fit rounded-md border">
      <Table className="w-auto whitespace-nowrap">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[160px]">Character</TableHead>
            <TableHead className="min-w-[160px]">Class</TableHead>
            <TableHead className="min-w-[160px]">Soft Reserves</TableHead>
            <TableHead className="min-w-[160px]">Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result) => {
            const isUnmatched = result.characterId === null;

            return (
              <TableRow
                key={isUnmatched ? `unmatched-${result.characterName}` : result.characterId}
              >
                <TableCell className="font-medium">
                  {isUnmatched ? (
                    <div className="flex flex-row items-center gap-2">
                      <div className="flex flex-row items-center">
                        <ClassIcon
                          characterClass={result.characterClass.toLowerCase()}
                          px={20}
                          className="mr-1 grow-0"
                        />
                        <div className="grow-0">{result.characterName}</div>
                      </div>
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="cursor-help border-orange-500/20 bg-orange-500/10 px-2 text-orange-700 dark:text-orange-400"
                          >
                            ?
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="bg-muted text-xs text-muted-foreground"
                        >
                          Character not found
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  ) : (
                    <div>
                      <CharacterLink
                        characterId={result.characterId!}
                        characterName={result.characterName}
                        characterClass={result.characterClass}
                        primaryCharacterName={result.primaryCharacterName}
                        iconSize={20}
                      />
                      {result.stats && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {result.stats.primaryAttendancePct !== null
                            ? `${Math.round(result.stats.primaryAttendancePct * 100)}% attendance`
                            : "0% attendance"}
                        </div>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {(() => {
                    // Split "Class - Spec" format
                    const parts = result.classDetail.split(" - ");
                    if (parts.length === 2) {
                      return (
                        <div className="flex flex-col">
                          <span>{parts[0]}</span>
                          <span className="text-xs text-muted-foreground">{parts[1]}</span>
                        </div>
                      );
                    }
                    return result.classDetail;
                  })()}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {result.srItems.map((item, idx) => (
                      <Link
                        key={idx}
                        href={`https://classic.wowhead.com/item=${item.itemId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-1.5 hover:underline ${
                          item.itemQuality ? qualityColors[item.itemQuality] : "text-primary"
                        }`}
                      >
                        <SoftResItemIcon itemId={item.itemId} />
                        {item.itemName ?? `Item ${item.itemId}`}
                      </Link>
                    ))}
                    {result.srItems.length === 0 && (
                      <span className="text-muted-foreground">No items</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-0.5">
                    {result.matchingRules
                      .filter((rule) => showInactiveFlags || rule.level !== "inactive")
                      .map((rule) => {
                        const IconComponent = iconMap[rule.icon as keyof typeof iconMap] ?? Info;
                        return (
                          <Tooltip key={rule.id} delayDuration={300}>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={`cursor-help px-1.5 py-0.5 text-[10px] ${levelColors[rule.level]}`}
                              >
                                <IconComponent className="mr-1 h-2.5 w-2.5" />
                                {rule.name}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-xs bg-muted p-3 text-xs text-muted-foreground"
                            >
                              {(() => {
                                // Parse description to highlight item names
                                // Use red for error rules, yellow for warning rules, matching the label colors
                                const itemNameColor =
                                  rule.level === "error"
                                    ? "text-red-700 dark:text-red-400"
                                    : rule.level === "inactive"
                                      ? "text-orange-700 dark:text-orange-400"
                                      : rule.level === "warning"
                                        ? "text-yellow-700 dark:text-yellow-400"
                                        : "text-muted-foreground";
                                const parts = rule.description.split(/`([^`]+)`/g);
                                return parts.map((part, index) => {
                                  // Odd indices are the quoted item names
                                  if (index % 2 === 1) {
                                    return (
                                      <span key={index} className={`${itemNameColor} font-medium`}>
                                        {part}
                                      </span>
                                    );
                                  }
                                  return <span key={index}>{part}</span>;
                                });
                              })()}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
