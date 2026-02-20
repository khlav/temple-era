"use client";

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
import { Info, AlertTriangle, XCircle } from "lucide-react";
import type { SoftResScanResult } from "~/server/api/routers/softres";
import { CharacterLink } from "~/components/ui/character-link";
import { ClassIcon } from "~/components/ui/class-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

const iconMap = {
  Info,
  AlertTriangle,
  XCircle,
};

const levelColors = {
  info: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  highlight:
    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  warning:
    "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  future:
    "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  error: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

export function SoftResScanTable({
  results,
}: {
  results: SoftResScanResult[];
}) {
  if (results.length === 0) {
    return (
      <div className="rounded-md border p-4 text-center text-muted-foreground">
        No characters found in this SoftRes raid.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Character</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Soft Reserves</TableHead>
            <TableHead>Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result) => {
            const isUnmatched = result.characterId === null;

            return (
              <TableRow
                key={
                  isUnmatched
                    ? `unmatched-${result.characterName}`
                    : result.characterId
                }
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
                      <Badge
                        variant="outline"
                        className="border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-400"
                      >
                        Not Found
                      </Badge>
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
                        <>
                          {parts[0]}{" "}
                          <span className="text-xs text-muted-foreground">
                            {parts[1]}
                          </span>
                        </>
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
                        className="text-primary hover:underline"
                      >
                        {item.itemName ?? `Item ${item.itemId}`}
                      </Link>
                    ))}
                    {result.srItems.length === 0 && (
                      <span className="text-muted-foreground">No items</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {result.matchingRules.map((rule) => {
                      const IconComponent =
                        iconMap[rule.icon as keyof typeof iconMap] ?? Info;
                      return (
                        <Tooltip key={rule.id} delayDuration={300}>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className={`cursor-help ${levelColors[rule.level]}`}
                            >
                              <IconComponent className="mr-1 h-3 w-3" />
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
                                  : rule.level === "future"
                                    ? "text-orange-700 dark:text-orange-400"
                                    : rule.level === "warning"
                                      ? "text-yellow-700 dark:text-yellow-400"
                                      : "text-muted-foreground";
                              const parts =
                                rule.description.split(/`([^`]+)`/g);
                              return parts.map((part, index) => {
                                // Odd indices are the quoted item names
                                if (index % 2 === 1) {
                                  return (
                                    <span
                                      key={index}
                                      className={`${itemNameColor} font-medium`}
                                    >
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
