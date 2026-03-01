"use client";

import {
  useState,
  useId,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  ChevronDown,
  FolderMinus,
  FolderOpen,
  GripVertical,
  ListTree,
  Loader2,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  getFirstCollision,
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
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "~/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Encounter {
  id: string;
  encounterName: string;
  sortOrder: number;
  groupId: string | null;
}

interface EncounterGroup {
  id: string;
  groupName: string;
  sortOrder: number;
}

type ItemId = string; // "enc:{uuid}" | "group:{uuid}"
type ContainerId = string; // "root" | group UUID
type Items = Record<ContainerId, ItemId[]>;
// Local name edits: itemId → edited name
type LocalNames = Map<ItemId, string>;

interface SavePayload {
  groups: Array<{ id: string; sortOrder: number; groupName?: string }>;
  encounters: Array<{
    id: string;
    sortOrder: number;
    groupId: string | null;
    encounterName?: string;
  }>;
}

interface ManageEncountersDialogProps {
  encounters: Encounter[];
  encounterGroups: EncounterGroup[];
  onSave: (payload: SavePayload) => void;
  onDelete: (encounterId: string) => void;
  onAdd: (encounterName: string) => void;
  onCreateGroup: (groupName: string) => void;
  onDeleteGroup: (groupId: string, mode: "promote" | "deleteChildren") => void;
  isPending: boolean;
  isDeletePending: boolean;
  isAddPending: boolean;
  isGroupPending?: boolean;
  /** When true (default), renders a compact icon-only ghost button. When false, renders a labeled outline button. */
  compact?: boolean;
}

// ── Item ID helpers ────────────────────────────────────────────────────────────

const encItemId = (id: string): ItemId => `enc:${id}`;
const groupItemId = (id: string): ItemId => `group:${id}`;

function parseItemId(
  itemId: string,
): { type: "enc" | "group"; id: string } | null {
  if (itemId.startsWith("enc:")) return { type: "enc", id: itemId.slice(4) };
  if (itemId.startsWith("group:"))
    return { type: "group", id: itemId.slice(6) };
  return null;
}

function findContainer(items: Items, id: string): string | undefined {
  if (id in items) return id;
  return Object.keys(items).find((k) => items[k]!.includes(id));
}

// ── DndContext measuring config ─────────────────────────────────────────────────
// Prevents re-measuring droppable rects during active drags, breaking the
// feedback loop: handleDragOver → setItems → re-render → re-measure → onDragOver
const MEASURING_CONFIG = {
  droppable: { strategy: MeasuringStrategy.BeforeDragging },
};

// ── Build initial items state ──────────────────────────────────────────────────

function buildItems(encounters: Encounter[], groups: EncounterGroup[]): Items {
  const sortedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const groupIds = new Set(sortedGroups.map((g) => g.id));

  const items: Items = { root: [] };
  for (const g of sortedGroups) items[g.id] = [];

  const ungrouped: Encounter[] = [];
  const byGroup = new Map<string, Encounter[]>(
    sortedGroups.map((g) => [g.id, []]),
  );

  for (const enc of encounters) {
    if (enc.groupId && groupIds.has(enc.groupId)) {
      byGroup.get(enc.groupId)!.push(enc);
    } else {
      ungrouped.push(enc);
    }
  }

  // Interleave groups and ungrouped encounters by sortOrder
  const topItems = [
    ...ungrouped.map((e) => ({
      sortOrder: e.sortOrder,
      itemId: encItemId(e.id),
    })),
    ...sortedGroups.map((g) => ({
      sortOrder: g.sortOrder,
      itemId: groupItemId(g.id),
    })),
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
  encounters: Encounter[],
  groups: EncounterGroup[],
  localNames: LocalNames,
): SavePayload {
  const encById = new Map(encounters.map((e) => [e.id, e]));
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const resultGroups: SavePayload["groups"] = [];
  const resultEncounters: SavePayload["encounters"] = [];

  let globalSortOrder = 0;

  for (const itemId of items.root ?? []) {
    const parsed = parseItemId(itemId);
    if (!parsed) continue;

    if (parsed.type === "group") {
      const orig = groupById.get(parsed.id);
      const currentName = localNames.get(itemId) ?? orig?.groupName ?? "";
      resultGroups.push({
        id: parsed.id,
        sortOrder: globalSortOrder++,
        ...(currentName !== orig?.groupName ? { groupName: currentName } : {}),
      });
    } else {
      const orig = encById.get(parsed.id);
      const currentName = localNames.get(itemId) ?? orig?.encounterName ?? "";
      resultEncounters.push({
        id: parsed.id,
        sortOrder: globalSortOrder++,
        groupId: null,
        ...(currentName !== orig?.encounterName
          ? { encounterName: currentName }
          : {}),
      });
    }
  }

  // Process encounters within each group
  for (const [containerId, itemIds] of Object.entries(items)) {
    if (containerId === "root") continue;
    let withinGroupOrder = 0;
    for (const itemId of itemIds) {
      const parsed = parseItemId(itemId);
      if (!parsed || parsed.type !== "enc") continue;
      const orig = encById.get(parsed.id);
      const currentName = localNames.get(itemId) ?? orig?.encounterName ?? "";
      resultEncounters.push({
        id: parsed.id,
        sortOrder: withinGroupOrder++,
        groupId: containerId,
        ...(currentName !== orig?.encounterName
          ? { encounterName: currentName }
          : {}),
      });
    }
  }

  return { groups: resultGroups, encounters: resultEncounters };
}

// ── Droppable group content area ───────────────────────────────────────────────

function DroppableGroupArea({
  groupId,
  isEmpty,
}: {
  groupId: string;
  isEmpty: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "ml-4 min-h-[1.5rem] rounded border border-dashed text-center text-xs leading-6 text-muted-foreground/30 transition-colors",
        isOver && "border-primary/40 bg-accent/20 text-muted-foreground/50",
      )}
    >
      {isOver ? "Drop here" : isEmpty ? "Empty group" : ""}
    </div>
  );
}

// ── SortableEncounterRow ───────────────────────────────────────────────────────

function SortableEncounterRow({
  id,
  name,
  indented,
  onDelete,
  onRename,
  onMoveToRoot,
  isPending,
  editingId,
  setEditingId,
}: {
  id: ItemId;
  name: string;
  indented: boolean;
  onDelete: () => void;
  onRename: (newName: string) => void;
  onMoveToRoot?: () => void;
  isPending: boolean;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}) {
  const [editValue, setEditValue] = useState(name);
  const isEditing = editingId === id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  const startEditing = () => {
    setEditValue(name);
    setEditingId(id);
  };
  const confirmRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    setEditingId(null);
  };
  const cancelEditing = () => {
    setEditValue(name);
    setEditingId(null);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-1.5 rounded-md border bg-card px-2 py-1",
        isDragging && "opacity-50",
        indented && "ml-4",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        onPointerDown={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {isEditing ? (
        <div className="flex flex-1 items-center gap-1">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-7 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmRename();
              if (e.key === "Escape") cancelEditing();
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={confirmRename}
            disabled={!editValue.trim()}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={cancelEditing}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <span className="flex-1 text-sm">{name}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={startEditing}
            disabled={isPending}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </>
      )}

      {onMoveToRoot && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={onMoveToRoot}
          title="Remove from group"
          disabled={isPending}
        >
          <FolderMinus className="h-3.5 w-3.5" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive"
        onClick={onDelete}
        disabled={isPending}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── SortableGroupHeader ────────────────────────────────────────────────────────

function SortableGroupHeader({
  id,
  name,
  collapsed,
  onToggleCollapse,
  onDelete,
  onRename,
  isPending,
  editingId,
  setEditingId,
  isOver,
  dragHandleProps,
}: {
  id: ItemId;
  name: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
  isPending: boolean;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  isOver: boolean;
  dragHandleProps?: any;
}) {
  const [editValue, setEditValue] = useState(name);
  const isEditing = editingId === id;

  const startEditing = () => {
    setEditValue(name);
    setEditingId(id);
  };
  const confirmRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    setEditingId(null);
  };
  const cancelEditing = () => {
    setEditValue(name);
    setEditingId(null);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1",
        isOver && "ring-1 ring-primary/50",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        onPointerDown={(e) => e.stopPropagation()}
        {...dragHandleProps}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

      {isEditing ? (
        <div className="flex flex-1 items-center gap-1">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-7 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmRename();
              if (e.key === "Escape") cancelEditing();
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={confirmRename}
            disabled={!editValue.trim()}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={cancelEditing}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <span className="flex-1 text-sm font-medium">{name}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={startEditing}
            disabled={isPending}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </>
      )}

      <button
        type="button"
        className="p-1 text-muted-foreground hover:text-foreground"
        onClick={onToggleCollapse}
        title={collapsed ? "Expand group" : "Collapse group"}
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            collapsed && "-rotate-90",
          )}
        />
      </button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive"
        onClick={onDelete}
        disabled={isPending}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── SortableGroupSection ───────────────────────────────────────────────────────

function SortableGroupSection({
  groupId,
  items,
  localNames,
  onDeleteEncounter,
  onDeleteGroup,
  onRename,
  onMoveToRoot,
  onToggleCollapse,
  collapsed,
  isPending,
  isDeletePending,
  isGroupPending,
  editingId,
  setEditingId,
  findContainer,
  activeId,
  encounterGroups,
  encounters,
}: {
  groupId: string;
  items: Items;
  localNames: LocalNames;
  onDeleteEncounter: (id: string) => void;
  onDeleteGroup: (id: string) => void;
  onRename: (itemId: string, n: string) => void;
  onMoveToRoot: (itemId: string) => void;
  onToggleCollapse: (groupId: string) => void;
  collapsed: boolean;
  isPending: boolean;
  isDeletePending: boolean;
  isGroupPending?: boolean;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  findContainer: (id: string) => string | undefined;
  activeId: string | null;
  encounterGroups: EncounterGroup[];
  encounters: Encounter[];
}) {
  const itemId = groupItemId(groupId);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const groupEncs = items[groupId] ?? [];
  const currentName =
    localNames.get(itemId) ??
    encounterGroups.find((g) => g.id === groupId)?.groupName ??
    "";

  const isBeingDraggedOver =
    activeId !== null &&
    !activeId.startsWith("group:") &&
    findContainer(activeId) === groupId;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("flex flex-col gap-0.5", isDragging && "opacity-50")}
    >
      <SortableGroupHeader
        id={itemId}
        name={currentName}
        collapsed={collapsed}
        onToggleCollapse={() => onToggleCollapse(groupId)}
        onDelete={() => onDeleteGroup(groupId)}
        onRename={(n) => onRename(itemId, n)}
        isPending={isPending || (isGroupPending ?? false)}
        editingId={editingId}
        setEditingId={setEditingId}
        isOver={isBeingDraggedOver}
        dragHandleProps={{ ...attributes, ...listeners }}
      />

      {!collapsed && (
        <div className="flex flex-col gap-0.5">
          <SortableContext
            items={groupEncs}
            strategy={verticalListSortingStrategy}
          >
            {groupEncs.map((encItemId) => {
              const encParsed = parseItemId(encItemId);
              if (!encParsed || encParsed.type !== "enc") return null;
              const encId = encParsed.id;
              const encName =
                localNames.get(encItemId) ??
                encounters.find((e) => e.id === encId)?.encounterName ??
                "";
              return (
                <SortableEncounterRow
                  key={encItemId}
                  id={encItemId}
                  name={encName}
                  indented
                  onDelete={() => onDeleteEncounter(encId)}
                  onRename={(n) => onRename(encItemId, n)}
                  onMoveToRoot={() => onMoveToRoot(encItemId)}
                  isPending={isPending || isDeletePending}
                  editingId={editingId}
                  setEditingId={setEditingId}
                />
              );
            })}
          </SortableContext>
          <DroppableGroupArea
            groupId={groupId}
            isEmpty={groupEncs.length === 0}
          />
        </div>
      )}
    </div>
  );
}

// ── ManageEncountersDialog ─────────────────────────────────────────────────────

export function ManageEncountersDialog({
  encounters,
  encounterGroups,
  onSave,
  onDelete,
  onAdd,
  onCreateGroup,
  onDeleteGroup,
  isPending,
  isDeletePending,
  isAddPending,
  isGroupPending,
  compact = true,
}: ManageEncountersDialogProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Items>({});
  const itemsRef = useRef<Items>(items);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [localNames, setLocalNames] = useState<LocalNames>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [newEncounterName, setNewEncounterName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const dndId = useId();
  const { setNodeRef: setRootNodeRef } = useDroppable({ id: "root" });

  // Stabilization refs for multi-container dnd-kit pattern
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      const built = buildItems(encounters, encounterGroups);
      setItems(built);
      itemsRef.current = built;
      setInitialSnapshot(JSON.stringify(built));
      setLocalNames(new Map());
      setEditingId(null);
      setCollapsedGroups(new Set());
      setNewEncounterName("");
      setNewGroupName("");
    }
    setOpen(isOpen);
  };

  const freshItems = useMemo(
    () => buildItems(encounters, encounterGroups),
    [encounters, encounterGroups],
  );

  // Sync when encounters/groups change while dialog is open (after add/delete)
  useEffect(() => {
    if (!open || activeId) return; // Skip sync during active drag to avoid depth errors

    const prev = itemsRef.current;
    const allFreshIds = new Set(Object.values(freshItems).flat());
    const allPrevIds = new Set(Object.values(prev).flat());

    // Only update state if the set of IDs actually changed (add/delete)
    const sameIds =
      allFreshIds.size === allPrevIds.size &&
      [...allFreshIds].every((id) => allPrevIds.has(id));

    if (!sameIds) {
      const next: Items = {};
      const fresh = freshItems;
      const allFreshIdsSet = new Set(Object.values(fresh).flat());
      const currentPrevIdsSet = new Set(Object.values(prev).flat());

      for (const [cId, freshIds] of Object.entries(fresh)) {
        const prevIds = prev[cId] ?? [];
        const kept = prevIds.filter((id) => allFreshIdsSet.has(id));
        const added = freshIds.filter((id) => !currentPrevIdsSet.has(id));
        next[cId] = [...kept, ...added];
      }
      for (const cId of Object.keys(prev)) {
        if (!(cId in fresh)) delete next[cId];
      }

      // Final check: is next actually different from prev?
      const isActuallyDifferent = JSON.stringify(next) !== JSON.stringify(prev);
      if (isActuallyDifferent) {
        setItems(next);
        itemsRef.current = next;
      }
    }
  }, [open, freshItems, activeId]);

  // Clear the "recently moved" flag after paint so collision detection
  // stops short-circuiting once layout has settled.
  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  });

  const isDirty = useMemo(() => {
    return JSON.stringify(items) !== initialSnapshot || localNames.size > 0;
  }, [items, initialSnapshot, localNames]);

  // ── DnD helpers ─────────────────────────────────────────────────────────────

  const findContainerStable = useCallback((id: string) => {
    return findContainer(itemsRef.current, id);
  }, []);

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
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

      // Determine target container
      let targetContainer: string;
      if (overId in prev) {
        targetContainer = overId;
      } else {
        targetContainer = findContainer(prev, overId) ?? "root";
      }

      if (activeContainer === targetContainer) {
        // No-op: within-container reordering is deferred to handleDragEnd
        // to prevent confusing visual shuffling while dragging.
        return prev;
      }

      // Group headers (sections) can only live in root.
      // Dragging a group into another group is not allowed.
      if (activeId.startsWith("group:")) return prev;

      const srcItems = [...(prev[activeContainer] ?? [])];
      const dstItems = [...(prev[targetContainer] ?? [])];
      const activeIdx = srcItems.indexOf(activeId);
      if (activeIdx === -1) return prev;

      // Append to end of target container during drag.
      // handleDragEnd will place it at the correct index.
      const next = {
        ...prev,
        [activeContainer]: srcItems.filter((id) => id !== activeId),
        [targetContainer]: [...dstItems, activeId],
      };

      // Guard: Don't update if state hasn't actually changed
      if (JSON.stringify(next) === JSON.stringify(prev)) return prev;

      itemsRef.current = next;
      recentlyMovedToNewContainer.current = true;
      return next;
    });
  }, []);

  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => {
      // When an item was recently moved to a new container, short-circuit
      // to the last known over-id. This prevents oscillation while the
      // layout settles after a cross-container move.
      if (recentlyMovedToNewContainer.current && lastOverId.current != null) {
        return [{ id: lastOverId.current }];
      }

      const currentItems = itemsRef.current;
      // 1. Try pointer collisions first
      const pointerCollisions = pointerWithin(args);
      let overId = getFirstCollision(pointerCollisions, "id");

      if (overId == null) {
        // 2. Fallback to closestCenter if no pointer intersection
        const closestCollisions = closestCenter(args);
        overId = getFirstCollision(closestCollisions, "id");
      }

      if (overId == null) {
        lastOverId.current = null;
        return [];
      }

      // If we are over a container (either root or a group),
      // prioritize items within that container.
      const containerId =
        overId in currentItems
          ? String(overId)
          : findContainer(currentItems, String(overId));

      if (containerId) {
        const containerCollisions = closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) => {
            return (
              container.id === containerId ||
              (currentItems[containerId] ?? []).includes(String(container.id))
            );
          }),
        });
        const resolvedId = getFirstCollision(containerCollisions, "id");
        lastOverId.current = resolvedId ?? overId;
        return [{ id: lastOverId.current }];
      }

      lastOverId.current = overId;
      return [{ id: overId }];
    },
    [], // Stable detection
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveId(null);
      lastOverId.current = null;
      recentlyMovedToNewContainer.current = false;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      setItems((prev) => {
        const activeContainer = findContainer(prev, activeId);
        if (!activeContainer) return prev;

        let overContainer: string;
        if (overId in prev) {
          overContainer = overId;
        } else {
          overContainer = findContainer(prev, overId) ?? "root";
        }

        const srcItems = prev[activeContainer] ?? [];

        if (activeContainer === overContainer) {
          // Reorder within same container
          const activeIdx = srcItems.indexOf(activeId);
          const overIdx = (prev[overContainer] ?? []).indexOf(overId);

          if (activeIdx !== -1 && overIdx !== -1 && activeIdx !== overIdx) {
            const next = {
              ...prev,
              [activeContainer]: arrayMove(srcItems, activeIdx, overIdx),
            };
            itemsRef.current = next;
            return next;
          }
          return prev;
        }

        // Cross-container move: only for encounters
        if (activeId.startsWith("group:")) return prev;

        const dstItems = prev[overContainer] ?? [];
        const activeIdx = srcItems.indexOf(activeId);
        if (activeIdx === -1) return prev;

        let insertIdx: number;
        if (overId === overContainer) {
          // Dropped on the container itself
          insertIdx = dstItems.length;
        } else {
          insertIdx = dstItems.indexOf(overId);
          if (insertIdx === -1) insertIdx = dstItems.length;
        }

        const next = {
          ...prev,
          [activeContainer]: srcItems.filter((id) => id !== activeId),
          [overContainer]: [
            ...dstItems.slice(0, insertIdx),
            activeId,
            ...dstItems.slice(insertIdx),
          ],
        };
        itemsRef.current = next;
        return next;
      });
    },
    [], // Stable
  );

  // ── Local mutations ──────────────────────────────────────────────────────────

  const renameItem = (itemId: ItemId, newName: string) => {
    setLocalNames((prev) => new Map(prev).set(itemId, newName));
  };

  const moveEncToRoot = (itemId: ItemId) => {
    setItems((prev) => {
      const container = Object.keys(prev).find(
        (k) => k !== "root" && prev[k]!.includes(itemId),
      );
      if (!container) return prev;
      return {
        ...prev,
        [container]: prev[container]!.filter((id) => id !== itemId),
        root: [...(prev.root ?? []), itemId],
      };
    });
  };

  const toggleCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = () => {
    onSave(deriveSavePayload(items, encounters, encounterGroups, localNames));
    setOpen(false);
  };

  // ── Add encounter / group ────────────────────────────────────────────────────

  const handleAddEncounter = () => {
    const trimmed = newEncounterName.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewEncounterName("");
  };

  const handleAddGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    onCreateGroup(trimmed);
    setNewGroupName("");
  };

  // ── Drag overlay label ───────────────────────────────────────────────────────
  const activeParsed = activeId ? parseItemId(activeId) : null;
  const activeName = activeId
    ? activeParsed?.type === "group"
      ? (localNames.get(activeId) ??
        encounterGroups.find((g) => g.id === activeParsed.id)?.groupName ??
        "")
      : (localNames.get(activeId) ??
        encounters.find((e) => e.id === activeParsed?.id)?.encounterName ??
        "")
    : "";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {compact ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
            >
              <ListTree className="h-3 w-3" />
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5">
              <ListTree className="h-3.5 w-3.5" />
              Edit Groups & Pages
            </Button>
          )}
        </DialogTrigger>
        {/*
         * Custom DialogContent without translate-based centering.
         * dnd-kit calculates pointer coordinates in viewport space, but
         * the standard Dialog uses translate(-50%,-50%) which shifts the
         * coordinate system and causes a ~300px drag offset.
         * Using flexbox centering on the overlay avoids this entirely.
         */}
        <DialogPortal>
          <DialogOverlay className="flex items-start justify-center pt-16">
            <DialogPrimitive.Content
              onOpenAutoFocus={(e) => e.preventDefault()}
              className="relative z-50 flex max-h-[85vh] w-full max-w-md flex-col gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg"
            >
              <DialogHeader>
                <DialogTitle>Manage Encounters</DialogTitle>
                <DialogDescription>
                  Add, rename, reorder, or remove encounters and groups.
                </DialogDescription>
              </DialogHeader>

              <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                {/* Default/Trash — fixed, always first */}
                <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 opacity-50">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-sm">Default/Trash</span>
                </div>

                <DndContext
                  id={dndId}
                  sensors={sensors}
                  collisionDetection={collisionDetectionStrategy}
                  measuring={MEASURING_CONFIG}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  {/* Root SortableContext — groups + ungrouped encounters */}
                  <SortableContext
                    items={items.root ?? []}
                    strategy={verticalListSortingStrategy}
                  >
                    <div ref={setRootNodeRef} className="flex flex-col gap-1.5">
                      {(items.root ?? []).map((itemId) => {
                        const parsed = parseItemId(itemId);
                        if (!parsed) return null;

                        if (parsed.type === "group") {
                          const groupId = parsed.id;
                          return (
                            <SortableGroupSection
                              key={itemId}
                              groupId={groupId}
                              items={items}
                              localNames={localNames}
                              onDeleteEncounter={onDelete}
                              onDeleteGroup={setDeleteGroupId}
                              onRename={renameItem}
                              onMoveToRoot={moveEncToRoot}
                              onToggleCollapse={toggleCollapse}
                              collapsed={collapsedGroups.has(groupId)}
                              isPending={isPending}
                              isDeletePending={isDeletePending}
                              isGroupPending={isGroupPending}
                              editingId={editingId}
                              setEditingId={setEditingId}
                              findContainer={findContainerStable}
                              activeId={activeId}
                              encounterGroups={encounterGroups}
                              encounters={encounters}
                            />
                          );
                        }

                        // Ungrouped encounter
                        const encId = parsed.id;
                        const encName =
                          localNames.get(itemId) ??
                          encounters.find((e) => e.id === encId)
                            ?.encounterName ??
                          "";
                        return (
                          <SortableEncounterRow
                            key={itemId}
                            id={itemId}
                            name={encName}
                            indented={false}
                            onDelete={() => onDelete(encId)}
                            onRename={(n) => renameItem(itemId, n)}
                            isPending={isPending || isDeletePending}
                            editingId={editingId}
                            setEditingId={setEditingId}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>

                  <DragOverlay dropAnimation={null}>
                    {activeId && (
                      <div
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-2 shadow-lg ring-2 ring-primary/50",
                          activeParsed?.type === "group"
                            ? "bg-muted/50"
                            : "bg-card",
                        )}
                      >
                        {activeParsed?.type === "group" && (
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 text-sm font-medium">
                          {activeName}
                        </span>
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>

                {/* Add encounter row */}
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    placeholder="New encounter name..."
                    value={newEncounterName}
                    onChange={(e) => setNewEncounterName(e.target.value)}
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddEncounter();
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1"
                    onClick={handleAddEncounter}
                    disabled={!newEncounterName.trim() || isAddPending}
                  >
                    {isAddPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Add Encounter
                  </Button>
                </div>

                {/* Add group row */}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="New group name..."
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddGroup();
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1"
                    onClick={handleAddGroup}
                    disabled={!newGroupName.trim() || (isGroupPending ?? false)}
                  >
                    {isGroupPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Add Group
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!isDirty || isPending}
                  onClick={handleSave}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </DialogFooter>

              <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </DialogPrimitive.Content>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>

      {/* Group delete confirmation */}
      <AlertDialog
        open={!!deleteGroupId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteGroupId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group</AlertDialogTitle>
            <AlertDialogDescription>
              What should happen to the encounters inside this group?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteGroupId) {
                  onDeleteGroup(deleteGroupId, "promote");
                  setDeleteGroupId(null);
                }
              }}
            >
              Move encounters to top-level
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteGroupId) {
                  onDeleteGroup(deleteGroupId, "deleteChildren");
                  setDeleteGroupId(null);
                }
              }}
            >
              Delete encounters too
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
