"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Search,
  Home,
  Users,
  BookOpen,
  FilePlus,
  ListRestart,
  ShieldCheck,
} from "lucide-react";
import { useDebounce } from "use-debounce";
import { useSession } from "next-auth/react";

import { useGlobalQuickLauncher } from "~/contexts/global-quick-launcher-context";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { ClassIcon } from "~/components/ui/class-icon";
import { api } from "~/trpc/react";
import { formatRaidDate, formatRaidCompletion } from "~/lib/raid-formatting";

export function GlobalQuickLauncher() {
  const { open, setOpen } = useGlobalQuickLauncher();
  const router = useRouter();
  const { data: session } = useSession();
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebounce(query, 300);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Debug logging
  console.log("GlobalSearch - open state:", open);

  const { data, isLoading } = api.search.global.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length > 0 },
  );

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedIndex]);

  const handleSelect = (url: string) => {
    setOpen(false);
    setQuery("");
    router.push(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!data || (!data.raids && !data.characters)) return;

    // Get all results for navigation
    const staticPages = [
      { name: "Dashboard", path: "/", icon: Home, type: "page" as const },
      { name: "Raids", path: "/raids", icon: Calendar, type: "page" as const },
      {
        name: "Raiding characters",
        path: "/characters",
        icon: Users,
        type: "page" as const,
      },
      {
        name: "Rare recipes & crafters",
        path: "/rare-recipes",
        icon: BookOpen,
        type: "page" as const,
      },
      // Raid Manager pages
      ...(session?.user?.isRaidManager
        ? [
            {
              name: "Create new raid",
              path: "/raids/new",
              icon: FilePlus,
              type: "page" as const,
              role: "Raid Manager",
            },
            {
              name: "Manage mains v. alts",
              path: "/raid-manager/characters",
              icon: Users,
              type: "page" as const,
              role: "Raid Manager",
            },
            {
              name: "Refresh WCL log",
              path: "/raid-manager/log-refresh",
              icon: ListRestart,
              type: "page" as const,
              role: "Raid Manager",
            },
          ]
        : []),
      // Admin pages
      ...(session?.user?.isAdmin
        ? [
            {
              name: "User permissions",
              path: "/admin/user-management",
              icon: ShieldCheck,
              type: "page" as const,
              role: "Admin",
            },
          ]
        : []),
    ];

    const matchedStaticPages = staticPages.filter(
      (page) =>
        page.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        page.path.toLowerCase().includes(debouncedQuery.toLowerCase()),
    );

    const allResults = [
      ...matchedStaticPages.map((page) => ({ ...page, priority: 0 })),
      ...(data.raids || []).map((raid) => ({
        ...raid,
        type: "raid" as const,
        priority: 1,
      })),
      ...(data.characters || []).map((character) => ({
        ...character,
        type: "character" as const,
        priority: 2,
      })),
    ].slice(0, 50);

    if (allResults.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % allResults.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(
          (prev) => (prev - 1 + allResults.length) % allResults.length,
        );
        break;
      case "Enter":
        e.preventDefault();
        const selectedResult = allResults[selectedIndex];
        if (selectedResult) {
          const url =
            selectedResult.type === "page"
              ? selectedResult.path
              : selectedResult.type === "raid"
                ? `/raids/${selectedResult.raidId}`
                : `/characters/${selectedResult.characterId}`;
          handleSelect(url);
        }
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="left-[50%] top-[15vh] flex max-h-[70vh] w-full max-w-2xl translate-x-[-50%] translate-y-0 flex-col border p-0 shadow-lg">
        <DialogTitle className="sr-only">Quick Launcher</DialogTitle>
        <div className="flex flex-shrink-0 items-center border-b bg-background px-4 py-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Jump to raids, characters, or pages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background">
          {isLoading && debouncedQuery.length > 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Searching...
            </div>
          )}

          {!isLoading && debouncedQuery.length > 0 && data && (
            <>
              {/* Combine and sort all results by date (most recent first), limit to 10 total */}
              {(() => {
                // Static page results - only show if they match the search
                const staticPages = [
                  {
                    name: "Dashboard",
                    path: "/",
                    icon: Home,
                    type: "page" as const,
                    sortDate: Number.MAX_SAFE_INTEGER, // Always appear first when matched
                  },
                  {
                    name: "Raids",
                    path: "/raids",
                    icon: Calendar,
                    type: "page" as const,
                    sortDate: Number.MAX_SAFE_INTEGER - 1,
                  },
                  {
                    name: "Raiding characters",
                    path: "/characters",
                    icon: Users,
                    type: "page" as const,
                    sortDate: Number.MAX_SAFE_INTEGER - 2,
                  },
                  {
                    name: "Rare recipes & crafters",
                    path: "/rare-recipes",
                    icon: BookOpen,
                    type: "page" as const,
                    sortDate: Number.MAX_SAFE_INTEGER - 3,
                  },
                  // Raid Manager pages
                  ...(session?.user?.isRaidManager
                    ? [
                        {
                          name: "Create new raid",
                          path: "/raids/new",
                          icon: FilePlus,
                          type: "page" as const,
                          sortDate: Number.MAX_SAFE_INTEGER - 4,
                          role: "Raid Manager",
                        },
                        {
                          name: "Manage mains v. alts",
                          path: "/raid-manager/characters",
                          icon: Users,
                          type: "page" as const,
                          sortDate: Number.MAX_SAFE_INTEGER - 5,
                          role: "Raid Manager",
                        },
                        {
                          name: "Refresh WCL log",
                          path: "/raid-manager/log-refresh",
                          icon: ListRestart,
                          type: "page" as const,
                          sortDate: Number.MAX_SAFE_INTEGER - 6,
                          role: "Raid Manager",
                        },
                      ]
                    : []),
                  // Admin pages
                  ...(session?.user?.isAdmin
                    ? [
                        {
                          name: "User permissions",
                          path: "/admin/user-management",
                          icon: ShieldCheck,
                          type: "page" as const,
                          sortDate: Number.MAX_SAFE_INTEGER - 7,
                          role: "Admin",
                        },
                      ]
                    : []),
                ];

                // Filter static pages based on search query
                const matchedStaticPages = staticPages.filter(
                  (page) =>
                    page.name
                      .toLowerCase()
                      .includes(debouncedQuery.toLowerCase()) ||
                    page.path
                      .toLowerCase()
                      .includes(debouncedQuery.toLowerCase()),
                );

                // Combine results while preserving database ordering
                // Add priority to maintain proper ordering
                const allResults = [
                  ...matchedStaticPages.map((page) => ({
                    ...page,
                    priority: 0,
                  })),
                  ...(data.raids || []).map((raid) => ({
                    ...raid,
                    type: "raid" as const,
                    sortDate: new Date(raid.date).getTime(),
                    priority: 1,
                  })),
                  ...(data.characters || []).map((character, _index) => ({
                    ...character,
                    type: "character" as const,
                    sortDate: character.lastRaidDate
                      ? new Date(character.lastRaidDate).getTime()
                      : 0,
                    priority: 2,
                    dbOrder: _index, // Preserve database ordering within characters
                  })),
                ]
                  .sort((a, b) => {
                    // First by priority (static pages, raids, characters)
                    if (a.priority !== b.priority) {
                      return a.priority - b.priority;
                    }
                    // Within characters, preserve database order
                    if (a.type === "character" && b.type === "character") {
                      return (a.dbOrder || 0) - (b.dbOrder || 0);
                    }
                    // Within raids, sort by date
                    if (a.type === "raid" && b.type === "raid") {
                      return b.sortDate - a.sortDate;
                    }
                    return 0;
                  })
                  .slice(0, 50);

                if (allResults.length === 0) {
                  return (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      No results found.
                    </div>
                  );
                }

                return (
                  <div className="px-4 py-2">
                    {allResults.map((result, index) => (
                      <div
                        key={`${result.type}-${result.type === "page" ? result.path : result.type === "raid" ? result.raidId : result.characterId}`}
                        ref={index === selectedIndex ? selectedRef : null}
                        onClick={() =>
                          handleSelect(
                            result.type === "page"
                              ? result.path
                              : result.type === "raid"
                                ? `/raids/${result.raidId}`
                                : `/characters/${result.characterId}`,
                          )
                        }
                        className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors ${
                          index === selectedIndex
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent"
                        }`}
                      >
                        {result.type === "page" ? (
                          <result.icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        ) : result.type === "raid" ? (
                          <Calendar className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        ) : (
                          <ClassIcon
                            characterClass={result.class}
                            px={16}
                            className="flex-shrink-0"
                          />
                        )}
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {result.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {result.type === "page"
                              ? result.role || ""
                              : result.type === "raid"
                                ? `${result.zone} • ${formatRaidDate(result.date)} • ${formatRaidCompletion(result.zone, result.killCount || 0)}`
                                : `${result.class} • ${result.server}${result.primaryCharacterName ? ` (${result.primaryCharacterName})` : ""}`}
                          </span>
                        </div>
                        <div className="flex-shrink-0 text-xs text-muted-foreground">
                          {result.type === "page"
                            ? "Page"
                            : result.type === "raid"
                              ? "Raid"
                              : "Character"}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
