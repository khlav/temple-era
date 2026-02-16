"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { AAIcon } from "~/components/ui/aa-icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { getAATagRegistry } from "~/lib/aa-tag-registry";
import type { AATagEntry, AATagCategory } from "~/lib/aa-tag-registry";
import type { AAIconType } from "~/lib/aa-formatting";

interface AATagReferencePanelProps {
  onSelectTag: (tag: string) => void;
}

export function AATagReferencePanel({ onSelectTag }: AATagReferencePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const registry = getAATagRegistry();

  const toggleCategory = (key: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filterLower = filter.toLowerCase();
  const filteredRegistry: AATagCategory[] = filterLower
    ? registry
        .map((cat) => ({
          ...cat,
          entries: cat.entries.filter(
            (e) =>
              e.tag.toLowerCase().includes(filterLower) ||
              e.displayName.toLowerCase().includes(filterLower),
          ),
        }))
        .filter((cat) => cat.entries.length > 0)
    : registry;

  if (!expanded) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-auto shrink-0 flex-col gap-1 px-1.5 py-2 text-muted-foreground"
        onClick={() => setExpanded(true)}
      >
        <BookOpen className="h-4 w-4" />
        <span className="text-[10px] leading-none">Tags</span>
      </Button>
    );
  }

  return (
    <div className="flex w-[200px] shrink-0 flex-col border-r">
      <div className="flex items-center justify-between border-b px-2 py-1">
        <span className="text-xs font-medium">Tag Reference</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setExpanded(false)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="border-b px-2 py-1">
        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tags..."
            className="h-6 pl-6 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredRegistry.map((cat) => (
          <CategorySection
            key={cat.key}
            category={cat}
            isOpen={filterLower.length > 0 || openCategories.has(cat.key)}
            onToggle={() => toggleCategory(cat.key)}
            onSelectTag={onSelectTag}
          />
        ))}
        {filteredRegistry.length === 0 && (
          <p className="p-2 text-center text-xs text-muted-foreground">
            No matching tags
          </p>
        )}
      </div>
    </div>
  );
}

function CategorySection({
  category,
  isOpen,
  onToggle,
  onSelectTag,
}: {
  category: AATagCategory;
  isOpen: boolean;
  onToggle: () => void;
  onSelectTag: (tag: string) => void;
}) {
  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex w-full items-center gap-1 px-2 py-1 text-xs font-medium hover:bg-muted/50">
        {isOpen ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span>{category.label}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {category.entries.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {category.entries.map((entry) => (
          <TagEntry key={entry.tag} entry={entry} onSelect={onSelectTag} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function TagEntry({
  entry,
  onSelect,
}: {
  entry: AATagEntry;
  onSelect: (tag: string) => void;
}) {
  const isColor = entry.iconType === "color";
  const displayTag = isColor ? `|c${entry.tag}` : `{${entry.tag}}`;

  return (
    <button
      className="flex w-full items-center gap-1.5 px-3 py-0.5 text-left text-xs hover:bg-muted/50"
      onClick={() => onSelect(displayTag)}
      type="button"
    >
      {isColor ? (
        <div
          className="h-3 w-3 shrink-0 rounded-sm border border-white/20"
          style={{ backgroundColor: entry.iconName }}
        />
      ) : entry.iconType !== "arrow" ? (
        <AAIcon
          name={entry.iconName}
          type={entry.iconType as AAIconType}
          size={14}
          className="inline-block shrink-0 align-text-bottom"
        />
      ) : (
        <span className="inline-block w-[14px] shrink-0 text-center text-yellow-400">
          {entry.iconName === "left"
            ? "\u25C4"
            : entry.iconName === "right"
              ? "\u25BA"
              : entry.iconName === "up"
                ? "\u25B2"
                : "\u25BC"}
        </span>
      )}
      <code className="shrink-0 text-[10px] text-foreground">{displayTag}</code>
      <span className="truncate text-[10px] text-muted-foreground">
        {entry.displayName}
      </span>
    </button>
  );
}
