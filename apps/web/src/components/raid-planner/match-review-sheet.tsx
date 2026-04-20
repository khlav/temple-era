"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  HelpCircle,
  MinusCircle,
  Search,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";
import type { SignupMatchResult } from "~/server/api/routers/raid-helper";

type ReviewFilter =
  | "all"
  | "matched"
  | "ambiguous"
  | "unmatched"
  | "skipped"
  | "discord"
  | "heuristic";

interface MatchReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchResults: SignupMatchResult[];
}

function getStatusIcon(status: SignupMatchResult["status"]) {
  if (status === "matched") {
    return <Check className="h-3.5 w-3.5 text-green-600" />;
  }
  if (status === "ambiguous") {
    return <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />;
  }
  if (status === "skipped") {
    return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground/70" />;
  }
  return <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function getStatusBadgeVariant(status: SignupMatchResult["status"]) {
  if (status === "matched") return "default";
  if (status === "ambiguous") return "secondary";
  return "outline";
}

function getSourceLabel(result: SignupMatchResult): string {
  switch (result.matchSource) {
    case "saved_override":
      return "Saved override";
    case "discord_link":
      return "Discord link";
    case "token_exact":
      return "Exact token";
    case "token_prefix":
      return "Token prefix";
    case "token_substring":
      return "Substring";
    case "manual_review":
      return "Needs review";
    case "skipped":
      return "Skipped";
    default:
      return "Unknown";
  }
}

function formatCandidates(result: SignupMatchResult): string {
  if (!result.candidates || result.candidates.length === 0) {
    return "None";
  }

  return result.candidates
    .map((candidate) => {
      const familySuffix = candidate.primaryCharacterName
        ? ` (${candidate.primaryCharacterName})`
        : "";
      return `${candidate.characterName} • ${candidate.characterClass}${familySuffix}`;
    })
    .join(", ");
}

export function MatchReviewSheet({
  open,
  onOpenChange,
  matchResults,
}: MatchReviewSheetProps) {
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>("all");

  const filteredResults = useMemo(() => {
    return matchResults.filter((result) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "discord")
        return result.matchSource === "discord_link";
      if (activeFilter === "heuristic") {
        return (
          result.matchSource === "token_exact" ||
          result.matchSource === "token_prefix" ||
          result.matchSource === "token_substring"
        );
      }
      return result.status === activeFilter;
    });
  }, [activeFilter, matchResults]);

  const filterButtons: Array<{ value: ReviewFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "matched", label: "Matched" },
    { value: "ambiguous", label: "Ambiguous" },
    { value: "unmatched", label: "Unmatched" },
    { value: "skipped", label: "Skipped" },
    { value: "discord", label: "Discord Link" },
    { value: "heuristic", label: "Heuristic" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-5xl"
      >
        <SheetHeader>
          <SheetTitle>Match Review</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {filterButtons.map((filter) => (
              <Button
                key={filter.value}
                variant={activeFilter === filter.value ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Signup</TableHead>
                  <TableHead className="w-[110px]">Class / Spec</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[140px]">Source</TableHead>
                  <TableHead className="w-[180px]">
                    Resolved Character
                  </TableHead>
                  <TableHead>Explanation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResults.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No rows match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredResults.map((result) => (
                    <TableRow key={`${result.userId}-${result.discordName}`}>
                      <TableCell>
                        <div className="font-medium">{result.discordName}</div>
                        <div className="text-xs text-muted-foreground">
                          Discord ID {result.userId}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{result.className}</div>
                        <div className="text-xs text-muted-foreground">
                          {result.specName || "No spec"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(result.status)}
                          <Badge variant={getStatusBadgeVariant(result.status)}>
                            {result.status}
                          </Badge>
                        </div>
                        {result.needsManagerReview ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Manager review
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div>{getSourceLabel(result)}</div>
                        {typeof result.confidence === "number" ? (
                          <div className="text-xs text-muted-foreground">
                            {Math.round(result.confidence * 100)}% confidence
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {result.matchedCharacter ? (
                          <div>
                            <div className="font-medium">
                              {result.matchedCharacter.characterName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {result.matchedCharacter.characterClass}
                              {result.matchedPrimaryCharacterName
                                ? ` • ${result.matchedPrimaryCharacterName}`
                                : ""}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Unresolved
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="text-sm">
                            {result.explanation || "No explanation available."}
                          </div>
                          {(result.status === "ambiguous" ||
                            result.status === "unmatched") &&
                          result.candidates &&
                          result.candidates.length > 0 ? (
                            <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                              <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
                                <Search className="h-3.5 w-3.5" />
                                Candidates
                              </div>
                              <div className={cn("leading-5")}>
                                {formatCandidates(result)}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
