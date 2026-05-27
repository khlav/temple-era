"use client";

import { useState, useEffect, useMemo, useCallback, useRef, useId } from "react";
import { ChevronDown, ChevronRight, ChevronLeft, Flag, GripVertical } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  getFirstCollision,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface EncounterGroup {
  id: string;
  groupName: string;
  sortOrder: number;
}

interface EncounterItem {
  id: string;
  encounterName: string;
  sortOrder: number;
  groupId: string | null;
  useDefaultGroups?: boolean;
}

type ItemId = string; // "enc:{uuid}" | "group:{uuid}"
type ContainerId = string; // "root" | group UUID
type Items = Record<ContainerId, ItemId[]>;

interface EncounterSidebarProps {
  planId: string;
  /** When true, disables drag-and-drop reordering and the rename context menu. */
  readOnly?: boolean;
  encounterGroups: EncounterGroup[];
  encounters: EncounterItem[];
  activeTab: string;
  onTabChange: (value: string) => void;
  actions?: React.ReactNode;
  leftActions?: React.ReactNode;
  assignmentLabelsMap?: Map<string, string[]>;
}

// ── Item ID helpers ────────────────────────────────────────────────────────────

const encItemId = (id: string): ItemId => `enc:${id}`;
const groupItemId = (id: string): ItemId => `group:${id}`;

function parseItemId(itemId: string): { type: "enc" | "group"; id: string } | null {
  if (itemId.startsWith("enc:")) return { type: "enc", id: itemId.slice(4) };
  if (itemId.startsWith("group:")) return { type: "group", id: itemId.slice(6) };
  return null;
}

function findContainer(items: Items, id: string): string | undefined {
  if (id in items) return id;
  return Object.keys(items).find((k) => items[k]!.includes(id));
}

// ── DndContext measuring config ─────────────────────────────────────────────────

const MEASURING_CONFIG = {
  droppable: { strategy: MeasuringStrategy.BeforeDragging },
};

// ── Build items state from props ────────────────────────────────────────────────

function buildItems(encounters: EncounterItem[], groups: EncounterGroup[]): Items {
  const sortedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const groupIds = new Set(sortedGroups.map((g) => g.id));

  const items: Items = { root: [] };
  for (const g of sortedGroups) items[g.id] = [];

  const ungrouped: EncounterItem[] = [];
  const byGroup = new Map<string, EncounterItem[]>(sortedGroups.map((g) => [g.id, []]));

  for (const enc of encounters) {
    if (enc.groupId && groupIds.has(enc.groupId)) {
      byGroup.get(enc.groupId)!.push(enc);
    } else {
      ungrouped.push(enc);
    }
  }

  const topItems = [
    ...ungrouped.map((e) => ({ sortOrder: e.sortOrder, itemId: encItemId(e.id) })),
    ...sortedGroups.map((g) => ({ sortOrder: g.sortOrder, itemId: groupItemId(g.id) })),
  ].sort((a, b) => a.sortOrder - b.sortOrder);

  items.root = topItems.map((t) => t.itemId);

  for (const [groupId, groupEncs] of byGroup) {
    items[groupId] = groupEncs
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((e) => encItemId(e.id));
  }

  return items;
}

// ── Derive save payload ────────────────────────────────────────────────────────

function deriveSavePayload(
  items: Items,
  encounters: EncounterItem[],
  groups: EncounterGroup[],
): {
  groups: Array<{ id: string; sortOrder: number; groupName?: string }>;
  encounters: Array<{
    id: string;
    sortOrder: number;
    groupId: string | null;
    encounterName?: string;
  }>;
} {
  const encById = new Map(encounters.map((e) => [e.id, e]));
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const resultGroups: Array<{ id: string; sortOrder: number }> = [];
  const resultEncounters: Array<{ id: string; sortOrder: number; groupId: string | null }> = [];

  let globalSortOrder = 0;

  for (const itemId of items.root ?? []) {
    const parsed = parseItemId(itemId);
    if (!parsed) continue;
    if (parsed.type === "group") {
      if (groupById.has(parsed.id)) {
        resultGroups.push({ id: parsed.id, sortOrder: globalSortOrder++ });
      }
    } else {
      if (encById.has(parsed.id)) {
        resultEncounters.push({ id: parsed.id, sortOrder: globalSortOrder++, groupId: null });
      }
    }
  }

  for (const [containerId, itemIds] of Object.entries(items)) {
    if (containerId === "root") continue;
    let withinGroupOrder = 0;
    for (const itemId of itemIds) {
      const parsed = parseItemId(itemId);
      if (!parsed || parsed.type !== "enc") continue;
      if (encById.has(parsed.id)) {
        resultEncounters.push({
          id: parsed.id,
          sortOrder: withinGroupOrder++,
          groupId: containerId,
        });
      }
    }
  }

  return { groups: resultGroups, encounters: resultEncounters };
}

// ── EncounterSidebar ─────────────────────────────────────────────────────────

export function EncounterSidebar({
  planId,
  readOnly = true,
  encounterGroups,
  encounters,
  activeTab,
  onTabChange,
  actions,
  leftActions,
  assignmentLabelsMap = new Map(),
}: EncounterSidebarProps) {
  const utils = api.useUtils();
  const dndId = useId();

  // ── Items state (drives desktop DnD rendering) ──────────────────────────────
  const [items, setItems] = useState<Items>(() => buildItems(encounters, encounterGroups));
  const itemsRef = useRef<Items>(items);

  const [activeId, setActiveId] = useState<string | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);
  // Snapshot of items at drag start. handleDragEnd computes final positions from this
  // baseline so that handleDragOver's cross-container appends don't corrupt the result.
  const dragStartItemsRef = useRef<Items>({});

  // ── Rename state ────────────────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null); // prefixed ItemId
  const [renameValue, setRenameValue] = useState("");
  // Optimistic name overrides keyed by entity UUID (not prefixed). Cleared on server confirm.
  const [localNames, setLocalNames] = useState<Record<string, string>>({});

  // ── Group expand/collapse ───────────────────────────────────────────────────
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(encounterGroups.map((g) => g.id)),
  );

  // Sync items from server data when encounters/groups change.
  // activeId intentionally excluded from deps — we don't want this to fire
  // when drag ends (setActiveId(null)) because props haven't updated yet at
  // that point and it would overwrite the optimistic local reorder.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeId) return; // still skip if somehow a drag is in flight
    const next = buildItems(encounters, encounterGroups);
    setItems(next);
    itemsRef.current = next;
  }, [encounters, encounterGroups]);

  // Sync expanded groups when new groups are added
  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      for (const g of encounterGroups) next.add(g.id);
      return next;
    });
  }, [encounterGroups]);

  // Clear recentlyMovedToNewContainer after each paint
  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  });

  // ── tRPC mutations ──────────────────────────────────────────────────────────

  const saveStructureMutation = api.raidPlan.saveEncounterStructure.useMutation({
    onError: () => {
      void utils.raidPlan.getById.invalidate({ planId });
    },
    onSuccess: () => {
      void utils.raidPlan.getById.invalidate({ planId });
    },
  });

  const updateEncounterMutation = api.raidPlan.updateEncounter.useMutation({
    onSuccess: () => {
      void utils.raidPlan.getById.invalidate({ planId });
    },
  });

  const updateGroupMutation = api.raidPlan.updateEncounterGroup.useMutation({
    onSuccess: () => {
      void utils.raidPlan.getById.invalidate({ planId });
    },
  });

  // ── Rename handlers ─────────────────────────────────────────────────────────

  const startRename = (itemId: ItemId, currentName: string) => {
    if (readOnly) return;
    setRenamingId(itemId);
    setRenameValue(currentName);
  };

  const confirmRename = () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      cancelRename();
      return;
    }
    const parsed = parseItemId(renamingId);
    if (!parsed) {
      cancelRename();
      return;
    }
    const prevName = localNames[parsed.id];
    // Apply optimistic update immediately
    setLocalNames((prev) => ({ ...prev, [parsed.id]: trimmed }));
    setRenamingId(null);
    const revertName = () =>
      setLocalNames((prev) => {
        const next = { ...prev };
        if (prevName !== undefined) next[parsed.id] = prevName;
        else delete next[parsed.id];
        return next;
      });
    const clearName = () =>
      setLocalNames((prev) => {
        const next = { ...prev };
        delete next[parsed.id];
        return next;
      });
    if (parsed.type === "enc") {
      updateEncounterMutation.mutate(
        { encounterId: parsed.id, encounterName: trimmed },
        { onError: revertName, onSuccess: clearName },
      );
    } else {
      updateGroupMutation.mutate(
        { groupId: parsed.id, groupName: trimmed },
        { onError: revertName, onSuccess: clearName },
      );
    }
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  // ── DnD sensors and collision detection ─────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { setNodeRef: setRootDropRef } = useDroppable({ id: "root" });

  const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
    if (recentlyMovedToNewContainer.current && lastOverId.current != null) {
      return [{ id: lastOverId.current }];
    }

    const currentItems = itemsRef.current;
    const pointerCollisions = pointerWithin(args);
    let overId = getFirstCollision(pointerCollisions, "id");

    if (overId == null) {
      const closestCollisions = closestCenter(args);
      overId = getFirstCollision(closestCollisions, "id");
    }

    if (overId == null) {
      lastOverId.current = null;
      return [];
    }

    const containerId =
      overId in currentItems ? String(overId) : findContainer(currentItems, String(overId));

    if (containerId) {
      const containerCollisions = closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => c.id === containerId || (currentItems[containerId] ?? []).includes(String(c.id)),
        ),
      });
      const resolvedId = getFirstCollision(containerCollisions, "id");
      lastOverId.current = resolvedId ?? overId;
      return [{ id: lastOverId.current }];
    }

    lastOverId.current = overId;
    return [{ id: overId }];
  }, []);

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    dragStartItemsRef.current = itemsRef.current;
    lastOverId.current = null;
    recentlyMovedToNewContainer.current = false;
  };

  const handleDragOver = useCallback(({ active, over }: DragOverEvent) => {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    setItems((prev) => {
      const activeContainer = findContainer(prev, activeId);
      if (!activeContainer) return prev;

      let targetContainer: string;
      if (overId in prev) {
        targetContainer = overId;
      } else {
        targetContainer = findContainer(prev, overId) ?? "root";
      }

      if (activeContainer === targetContainer) return prev;
      if (activeId.startsWith("group:")) return prev;

      const srcItems = [...(prev[activeContainer] ?? [])];
      const dstItems = [...(prev[targetContainer] ?? [])];
      const activeIdx = srcItems.indexOf(activeId);
      if (activeIdx === -1) return prev;

      const next = {
        ...prev,
        [activeContainer]: srcItems.filter((id) => id !== activeId),
        [targetContainer]: [...dstItems, activeId],
      };

      if (JSON.stringify(next) === JSON.stringify(prev)) return prev;

      itemsRef.current = next;
      recentlyMovedToNewContainer.current = true;
      return next;
    });
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveId(null);
      lastOverId.current = null;
      recentlyMovedToNewContainer.current = false;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      const original = dragStartItemsRef.current;
      const current = itemsRef.current;

      const originalActiveContainer = findContainer(original, activeId);
      if (!originalActiveContainer) return;

      // Where did handleDragOver actually land the item?
      const currentActiveContainer = findContainer(current, activeId) ?? originalActiveContainer;

      let next: Items | null = null;

      if (currentActiveContainer !== originalActiveContainer) {
        // handleDragOver moved the item to currentActiveContainer. Use over.id to
        // determine the insert position within that container, but look it up against
        // the pre-drag items (original) so the appended-at-end state doesn't corrupt
        // the index. If over.id isn't one of the original destination items (e.g. it's
        // the group droppable, group sortable, or whitespace) insert at the end.
        const srcItems = original[originalActiveContainer] ?? [];
        const dstItems = original[currentActiveContainer] ?? [];
        const overInDst = dstItems.indexOf(overId);
        const insertIdx = overInDst !== -1 ? overInDst : dstItems.length;
        next = {
          ...current,
          [originalActiveContainer]: srcItems.filter((id) => id !== activeId),
          [currentActiveContainer]: [
            ...dstItems.slice(0, insertIdx),
            activeId,
            ...dstItems.slice(insertIdx),
          ],
        };
      } else {
        // No cross-container move by handleDragOver (same container or fast drag).
        // Resolve target from over.id using the original snapshot.
        let overContainer: string;
        if (overId in original) {
          overContainer = overId;
        } else if (overId.startsWith("group:")) {
          overContainer = overId.slice(6); // "group:{uuid}" → raw UUID = container key
        } else {
          overContainer = findContainer(original, overId) ?? "root";
        }

        if (originalActiveContainer !== overContainer && !activeId.startsWith("group:")) {
          // Cross-container without handleDragOver firing (fast drag)
          const srcItems = original[originalActiveContainer] ?? [];
          const dstItems = original[overContainer] ?? [];
          const activeIdx = srcItems.indexOf(activeId);
          if (activeIdx === -1) return;

          let insertIdx: number;
          if (overId === overContainer || overId.startsWith("group:")) {
            insertIdx = dstItems.length;
          } else {
            insertIdx = dstItems.indexOf(overId);
            if (insertIdx === -1) insertIdx = dstItems.length;
          }

          next = {
            ...current,
            [originalActiveContainer]: srcItems.filter((id) => id !== activeId),
            [overContainer]: [
              ...dstItems.slice(0, insertIdx),
              activeId,
              ...dstItems.slice(insertIdx),
            ],
          };
        } else {
          // Same-container reorder — use original positions for arrayMove
          const srcItems = original[originalActiveContainer] ?? [];
          const activeIdx = srcItems.indexOf(activeId);
          if (activeIdx === -1) return;

          if (overId === overContainer) {
            // Dropped on the container itself → move to end
            const without = srcItems.filter((id) => id !== activeId);
            next = { ...current, [originalActiveContainer]: [...without, activeId] };
          } else {
            const overIdx = srcItems.indexOf(overId);
            if (overIdx !== -1 && activeIdx !== overIdx) {
              next = {
                ...current,
                [originalActiveContainer]: arrayMove(srcItems, activeIdx, overIdx),
              };
            }
          }
        }
      }

      if (!next) return;

      setItems(next);
      itemsRef.current = next;

      if (!readOnly) {
        const payload = deriveSavePayload(next, encounters, encounterGroups);
        saveStructureMutation.mutate({ planId, ...payload });
      }
    },
    [readOnly, encounters, encounterGroups, planId, saveStructureMutation],
  );

  // ── Mobile-only derived data (unchanged) ────────────────────────────────────

  const { sortedTreeItems, flatEncounterIds, activeLabelMap } = useMemo(() => {
    const groupBuckets = new Map<string, EncounterItem[]>(encounterGroups.map((g) => [g.id, []]));
    const ungrouped: EncounterItem[] = [];

    for (const enc of encounters) {
      if (enc.groupId && groupBuckets.has(enc.groupId)) {
        groupBuckets.get(enc.groupId)!.push(enc);
      } else {
        ungrouped.push(enc);
      }
    }
    for (const children of groupBuckets.values()) {
      children.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    type TreeItem =
      | { type: "encounter"; sortOrder: number; enc: EncounterItem }
      | { type: "group"; sortOrder: number; group: EncounterGroup; children: EncounterItem[] };

    const treeItems: TreeItem[] = [
      ...ungrouped.map((enc) => ({ type: "encounter" as const, sortOrder: enc.sortOrder, enc })),
      ...encounterGroups.map((g) => ({
        type: "group" as const,
        sortOrder: g.sortOrder,
        group: g,
        children: groupBuckets.get(g.id) ?? [],
      })),
    ].sort((a, b) => a.sortOrder - b.sortOrder);

    const flatEncounterIds = [
      "default",
      ...treeItems.flatMap((item) =>
        item.type === "group" ? item.children.map((c) => c.id) : [item.enc.id],
      ),
    ];

    const activeLabelMap = new Map<string, string>();
    activeLabelMap.set("default", "Default/Trash");
    for (const item of treeItems) {
      if (item.type === "encounter") {
        activeLabelMap.set(item.enc.id, item.enc.encounterName);
      } else {
        for (const child of item.children) {
          activeLabelMap.set(child.id, `${item.group.groupName} · ${child.encounterName}`);
        }
      }
    }

    return { sortedTreeItems: treeItems, flatEncounterIds, activeLabelMap };
  }, [encounterGroups, encounters]);

  // ── DragOverlay label ───────────────────────────────────────────────────────

  const activeName = useMemo(() => {
    if (!activeId) return "";
    const parsed = parseItemId(activeId);
    if (!parsed) return "";
    if (parsed.type === "group") {
      return (
        localNames[parsed.id] ?? encounterGroups.find((g) => g.id === parsed.id)?.groupName ?? ""
      );
    }
    return localNames[parsed.id] ?? encounters.find((e) => e.id === parsed.id)?.encounterName ?? "";
  }, [activeId, encounters, encounterGroups, localNames]);

  // ── Encounter map for quick lookups ─────────────────────────────────────────

  const encounterMap = useMemo(() => new Map(encounters.map((e) => [e.id, e])), [encounters]);
  const groupMap = useMemo(() => new Map(encounterGroups.map((g) => [g.id, g])), [encounterGroups]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Desktop sidebar tree (≥ lg) */}
      <div className="hidden lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-0.5 lg:self-start lg:rounded-lg lg:border lg:border-border/50 lg:bg-muted/30 lg:p-2">
        <div className="flex items-center pb-1.5">
          <p className="flex-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Encounters
          </p>
          {leftActions}
          {actions}
        </div>

        {/* Default/Trash — always first, not draggable */}
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onTabChange("default")}
                className={cn(
                  "group/item relative flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs font-medium outline-none transition-all",
                  activeTab === "default"
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
              >
                <span
                  className={cn(
                    "min-w-0 truncate whitespace-nowrap transition-colors duration-200",
                    assignmentLabelsMap.has("default") && "font-semibold text-yellow-500",
                  )}
                >
                  Default/Trash
                </span>
                {assignmentLabelsMap.has("default") && (
                  <Flag className="h-3 w-3 shrink-0 text-yellow-500 transition-transform duration-300 group-hover/item:rotate-12 group-hover/item:scale-110" />
                )}
              </button>
            </TooltipTrigger>
            {assignmentLabelsMap.has("default") && (
              <TooltipContent
                side="right"
                className="dark border-none bg-secondary text-muted-foreground"
              >
                <AssignmentTooltipBody labels={assignmentLabelsMap.get("default") ?? []} />
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* DnD tree */}
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          measuring={MEASURING_CONFIG}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items.root ?? []} strategy={verticalListSortingStrategy}>
            <div ref={setRootDropRef} className="flex flex-col gap-0.5">
              {(items.root ?? []).map((itemId) => {
                const parsed = parseItemId(itemId);
                if (!parsed) return null;

                if (parsed.type === "group") {
                  const group = groupMap.get(parsed.id);
                  if (!group) return null;
                  const groupEncs = items[parsed.id] ?? [];
                  const isExpanded = expandedGroups.has(parsed.id);

                  return (
                    <SortableGroupRow
                      key={itemId}
                      itemId={itemId}
                      group={group}
                      groupEncs={groupEncs}
                      isExpanded={isExpanded}
                      onToggle={() =>
                        setExpandedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.id)) next.delete(group.id);
                          else next.add(group.id);
                          return next;
                        })
                      }
                      activeTab={activeTab}
                      onTabChange={onTabChange}
                      renamingId={renamingId}
                      renameValue={renameValue}
                      setRenameValue={setRenameValue}
                      onStartRename={startRename}
                      onConfirmRename={confirmRename}
                      onCancelRename={cancelRename}
                      assignmentLabelsMap={assignmentLabelsMap}
                      encounterMap={encounterMap}
                      localNames={localNames}
                      readOnly={readOnly}
                    />
                  );
                }

                // Ungrouped encounter
                const enc = encounterMap.get(parsed.id);
                if (!enc) return null;
                return (
                  <SortableEncounterRow
                    key={itemId}
                    itemId={itemId}
                    enc={enc}
                    activeTab={activeTab}
                    onTabChange={onTabChange}
                    renamingId={renamingId}
                    renameValue={renameValue}
                    setRenameValue={setRenameValue}
                    onStartRename={startRename}
                    onConfirmRename={confirmRename}
                    onCancelRename={cancelRename}
                    assignmentLabelsMap={assignmentLabelsMap}
                    localNames={localNames}
                    readOnly={readOnly}
                  />
                );
              })}
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeId && (
              <div className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 shadow-lg ring-1 ring-primary/40 text-xs">
                <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{activeName}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Mobile nav (< lg) — unchanged */}
      <div className="flex w-full items-center gap-2 rounded-xl bg-muted/40 p-1.5 ring-1 ring-border/50 lg:hidden">
        <span className="shrink-0 text-sm text-muted-foreground">Encounter:</span>

        <Select value={activeTab} onValueChange={onTabChange}>
          <SelectTrigger className="flex-1">
            <span className="truncate text-sm">{activeLabelMap.get(activeTab) ?? activeTab}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    assignmentLabelsMap.has("default") && "font-semibold text-yellow-500",
                  )}
                >
                  Default/Trash
                </span>
                {assignmentLabelsMap.has("default") && (
                  <Flag className="h-3 w-3 shrink-0 text-yellow-500" />
                )}
              </div>
            </SelectItem>
            {sortedTreeItems.map((item) =>
              item.type === "group" ? (
                <SelectGroup key={item.group.id}>
                  <SelectLabel>{item.group.groupName}</SelectLabel>
                  {item.children.map((enc) => (
                    <SelectItem key={enc.id} value={enc.id} className="pl-6">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            assignmentLabelsMap.has(enc.id) && "font-semibold text-yellow-500",
                          )}
                        >
                          {enc.encounterName}
                        </span>
                        {assignmentLabelsMap.has(enc.id) && (
                          <Flag className="h-3 w-3 shrink-0 text-yellow-500" />
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : (
                <SelectItem key={item.enc.id} value={item.enc.id}>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        assignmentLabelsMap.has(item.enc.id) && "font-semibold text-yellow-500",
                      )}
                    >
                      {item.enc.encounterName}
                    </span>
                    {assignmentLabelsMap.has(item.enc.id) && (
                      <Flag className="h-3 w-3 shrink-0 text-yellow-500" />
                    )}
                  </div>
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <button
          onClick={() => {
            const i = flatEncounterIds.indexOf(activeTab);
            if (i > 0) onTabChange(flatEncounterIds[i - 1]!);
          }}
          disabled={flatEncounterIds.indexOf(activeTab) <= 0}
          className="rounded p-1 hover:bg-accent/50 disabled:opacity-40"
          aria-label="Previous encounter"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <button
          onClick={() => {
            const i = flatEncounterIds.indexOf(activeTab);
            if (i < flatEncounterIds.length - 1) onTabChange(flatEncounterIds[i + 1]!);
          }}
          disabled={flatEncounterIds.indexOf(activeTab) >= flatEncounterIds.length - 1}
          className="rounded p-1 hover:bg-accent/50 disabled:opacity-40"
          aria-label="Next encounter"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {actions}
      </div>
    </>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function AssignmentTooltipBody({ labels }: { labels: string[] }) {
  return (
    <div className="text-xs">
      <p className="mb-1 font-semibold">Assignments:</p>
      <ul className="list-disc pl-3">
        {labels.map((label, i) => (
          <li key={i}>{label}</li>
        ))}
      </ul>
    </div>
  );
}

function RenameEditor({
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onConfirm();
        if (e.key === "Escape") onCancel();
      }}
      onBlur={onConfirm}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="min-w-0 w-full rounded border border-border bg-background px-1 py-0.5 text-xs outline-none focus:border-primary"
    />
  );
}

// ── SortableEncounterRow ───────────────────────────────────────────────────────

function SortableEncounterRow({
  itemId,
  enc,
  activeTab,
  onTabChange,
  renamingId,
  renameValue,
  setRenameValue,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  assignmentLabelsMap,
  localNames = {},
  indented = false,
  readOnly,
}: {
  itemId: ItemId;
  enc: EncounterItem;
  activeTab: string;
  onTabChange: (v: string) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onStartRename: (itemId: ItemId, name: string) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  assignmentLabelsMap: Map<string, string[]>;
  localNames?: Record<string, string>;
  indented?: boolean;
  readOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isRenaming = renamingId === itemId;

  const encounterContent = (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative flex min-w-0 flex-1 items-center justify-between gap-1 rounded-md px-1.5 py-1 text-xs outline-none transition-all",
              enc.useDefaultGroups && "italic text-muted-foreground",
              enc.id === activeTab ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              !isRenaming && (readOnly ? "cursor-pointer" : "cursor-grab"),
            )}
            onClick={() => {
              if (!isRenaming) onTabChange(enc.id);
            }}
          >
            {isRenaming ? (
              <RenameEditor
                value={renameValue}
                onChange={setRenameValue}
                onConfirm={onConfirmRename}
                onCancel={onCancelRename}
              />
            ) : (
              <>
                <span
                  className={cn(
                    "min-w-0 truncate whitespace-nowrap transition-colors duration-200",
                    assignmentLabelsMap.has(enc.id) && "font-semibold text-yellow-500",
                  )}
                >
                  {localNames[enc.id] ?? enc.encounterName}
                </span>
                {assignmentLabelsMap.has(enc.id) && (
                  <Flag className="h-3 w-3 shrink-0 text-yellow-500 transition-transform duration-300 group-hover/item:rotate-12 group-hover/item:scale-110" />
                )}
              </>
            )}
          </div>
        </TooltipTrigger>
        {assignmentLabelsMap.has(enc.id) && (
          <TooltipContent
            side="right"
            className="dark border-none bg-secondary text-muted-foreground"
          >
            <AssignmentTooltipBody labels={assignmentLabelsMap.get(enc.id) ?? []} />
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(!readOnly && !isRenaming ? { ...attributes, ...listeners } : {})}
      className={cn("flex min-w-0", isDragging && "opacity-50", indented && "pl-3")}
    >
      {readOnly ? (
        <div className="flex min-w-0 flex-1">{encounterContent}</div>
      ) : (
        <ContextMenu>
          <ContextMenuTrigger className="flex min-w-0 flex-1">
            {encounterContent}
          </ContextMenuTrigger>
          <ContextMenuContent className="min-w-[6rem] p-0.5">
            <ContextMenuItem
              className="px-2 py-1 text-xs"
              onSelect={() => onStartRename(itemId, localNames[enc.id] ?? enc.encounterName)}
            >
              Rename
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
    </div>
  );
}

// ── SortableGroupRow ────────────────────────────────────────────────────────────

function SortableGroupRow({
  itemId,
  group,
  groupEncs,
  isExpanded,
  onToggle,
  activeTab,
  onTabChange,
  renamingId,
  renameValue,
  setRenameValue,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  assignmentLabelsMap,
  encounterMap,
  localNames = {},
  readOnly,
}: {
  itemId: ItemId;
  group: EncounterGroup;
  groupEncs: ItemId[];
  isExpanded: boolean;
  onToggle: () => void;
  activeTab: string;
  onTabChange: (v: string) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onStartRename: (itemId: ItemId, name: string) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  assignmentLabelsMap: Map<string, string[]>;
  encounterMap: Map<string, EncounterItem>;
  localNames?: Record<string, string>;
  readOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isRenaming = renamingId === itemId;

  // Droppable area for when group is collapsed (or empty)
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: group.id });

  const hasActiveChild = groupEncs.some((id) => {
    const parsed = parseItemId(id);
    return parsed?.type === "enc" && parsed.id === activeTab;
  });

  return (
    <div ref={setNodeRef} style={style} className={cn("flex flex-col", isDragging && "opacity-50")}>
      {/* Group header */}
      {(() => {
        const header = (
          <div
            {...(!readOnly && !isRenaming ? { ...attributes, ...listeners } : {})}
            className={cn(
              "group/item flex w-full items-center gap-0.5 rounded-md px-1 py-1 text-xs font-medium transition-all hover:bg-accent/50",
              !readOnly && !isRenaming && "cursor-grab",
              hasActiveChild && "bg-accent/40",
              isOver && "ring-1 ring-primary/40",
            )}
          >
            {isRenaming ? (
              <RenameEditor
                value={renameValue}
                onChange={setRenameValue}
                onConfirm={onConfirmRename}
                onCancel={onCancelRename}
              />
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">
                  {localNames[group.id] ?? group.groupName}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                  }}
                  className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={isExpanded ? "Collapse group" : "Expand group"}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              </>
            )}
          </div>
        );

        return readOnly ? (
          header
        ) : (
          <ContextMenu>
            <ContextMenuTrigger className="flex w-full">{header}</ContextMenuTrigger>
            <ContextMenuContent className="min-w-[6rem] p-0.5">
              <ContextMenuItem
                className="px-2 py-1 text-xs"
                onSelect={() => onStartRename(itemId, localNames[group.id] ?? group.groupName)}
              >
                Rename
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })()}

      {/* Collapsible content */}
      <Collapsible open={isExpanded}>
        <CollapsibleContent className="flex flex-col gap-0.5 pt-0.5">
          <SortableContext items={groupEncs} strategy={verticalListSortingStrategy}>
            {groupEncs.map((encItemId) => {
              const parsed = parseItemId(encItemId);
              if (!parsed || parsed.type !== "enc") return null;
              const enc = encounterMap.get(parsed.id);
              if (!enc) return null;
              return (
                <SortableEncounterRow
                  key={encItemId}
                  itemId={encItemId}
                  enc={enc}
                  activeTab={activeTab}
                  onTabChange={onTabChange}
                  renamingId={renamingId}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  onStartRename={onStartRename}
                  onConfirmRename={onConfirmRename}
                  onCancelRename={onCancelRename}
                  assignmentLabelsMap={assignmentLabelsMap}
                  localNames={localNames}
                  indented
                  readOnly={readOnly}
                />
              );
            })}
          </SortableContext>
          {/* Drop target for empty/collapsed state */}
          <div
            ref={setDropRef}
            className={cn(
              "min-h-[0.625rem] rounded border border-dashed pl-3 text-[10px] leading-[0.625rem] text-muted-foreground/30 transition-colors",
              isOver && "border-primary/40 bg-accent/20 text-muted-foreground/50",
              groupEncs.length > 0 && !isOver && "border-transparent",
            )}
          >
            {""}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
