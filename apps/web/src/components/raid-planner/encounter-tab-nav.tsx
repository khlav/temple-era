"use client";

import { TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useMemo } from "react";

interface EncounterTabItem {
  id: string;
  encounterName: string;
  useDefaultGroups?: boolean;
}

interface EncounterTabNavProps {
  encounters: EncounterTabItem[];
  activeTab: string;
  onTabChange: (value: string) => void;
  /** Extra buttons (manage) rendered to the right */
  actions?: React.ReactNode;
  /** Buttons (add) to render to the left */
  leftActions?: React.ReactNode;
}

export function EncounterTabNav({
  encounters,
  activeTab,
  onTabChange,
  actions,
  leftActions,
}: EncounterTabNavProps) {
  const allTabs = useMemo(() => {
    return [{ id: "default", encounterName: "Default/Trash" }, ...encounters];
  }, [encounters]);

  const currentIndex = allTabs.findIndex((t) => t.id === activeTab);
  const prevTab = allTabs[currentIndex - 1];
  const nextTab = allTabs[currentIndex + 1];

  return (
    <div className="flex w-full items-center gap-2 rounded-xl bg-muted/40 p-1.5 ring-1 ring-border/50 md:bg-transparent md:p-0 md:ring-0">
      {/* Label (Mobile only) */}
      <span className="ml-1 shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80 md:hidden">
        Encounter:
      </span>

      {/* Left Actions (Mobile & Desktop) */}
      {leftActions && (
        <div className="flex items-center gap-1 [&>button]:h-11 md:[&>button]:h-9">
          {leftActions}
        </div>
      )}

      {/* Mobile: styled dropdown + nav buttons */}
      <div className="flex flex-1 items-center gap-1.5 md:hidden">
        <Select value={activeTab} onValueChange={onTabChange}>
          <SelectTrigger className="h-11 min-w-[100px] flex-1 bg-background shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allTabs.map((tab) => (
              <SelectItem
                key={tab.id}
                value={tab.id}
                className={cn(
                  (tab as EncounterTabItem).useDefaultGroups
                    ? "italic opacity-50"
                    : "",
                )}
              >
                {tab.encounterName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 bg-background shadow-sm"
            disabled={!prevTab}
            onClick={() => prevTab && onTabChange(prevTab.id)}
            aria-label="Previous encounter"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 bg-background shadow-sm"
            disabled={!nextTab}
            onClick={() => nextTab && onTabChange(nextTab.id)}
            aria-label="Next encounter"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Desktop: tabs */}
      <TabsList className="hidden h-auto flex-wrap md:inline-flex">
        <TabsTrigger value="default">Default/Trash</TabsTrigger>
        {encounters.map((encounter) => (
          <TabsTrigger
            key={encounter.id}
            value={encounter.id}
            className={cn(
              encounter.useDefaultGroups ? "italic opacity-50" : "",
            )}
          >
            {encounter.encounterName}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Right Actions (Mobile & Desktop) */}
      {actions && (
        <div className="flex items-center gap-1 [&>button]:h-11 md:[&>button]:h-9">
          {actions}
        </div>
      )}
    </div>
  );
}
