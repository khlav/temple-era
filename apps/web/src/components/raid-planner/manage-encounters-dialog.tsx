"use client";

import { useState, useId, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  Pencil,
  Settings2,
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
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
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
import * as DialogPrimitive from "@radix-ui/react-dialog";

interface Encounter {
  id: string;
  encounterName: string;
  sortOrder: number;
}

interface ManageEncountersDialogProps {
  encounters: Encounter[];
  onSave: (
    encounters: Array<{
      id: string;
      sortOrder: number;
      encounterName?: string;
    }>,
  ) => void;
  onDelete: (encounterId: string) => void;
  onAdd: (encounterName: string) => void;
  isPending: boolean;
  isDeletePending: boolean;
  isAddPending: boolean;
}

function SortableRow({
  encounter,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onDelete,
  onRename,
  isPending,
  editingId,
  setEditingId,
}: {
  encounter: Encounter;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
  isPending: boolean;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}) {
  const [editValue, setEditValue] = useState(encounter.encounterName);
  const isEditing = editingId === encounter.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: encounter.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setEditValue(encounter.encounterName);
    setEditingId(encounter.id);
  };

  const confirmRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== encounter.encounterName) {
      onRename(trimmed);
    }
    setEditingId(null);
  };

  const cancelEditing = () => {
    setEditValue(encounter.encounterName);
    setEditingId(null);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border bg-card px-3 py-2 ${isDragging ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
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
            className="h-7 w-7 shrink-0"
            onClick={confirmRename}
            disabled={!editValue.trim()}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={cancelEditing}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <span className="flex-1 text-sm">{encounter.encounterName}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={startEditing}
            disabled={isPending}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </>
      )}

      <div className="flex">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={index === 0 || isPending}
          onClick={onMoveUp}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={index === total - 1 || isPending}
          onClick={onMoveDown}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </div>

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

export function ManageEncountersDialog({
  encounters,
  onSave,
  onDelete,
  onAdd,
  isPending,
  isDeletePending,
  isAddPending,
}: ManageEncountersDialogProps) {
  const [open, setOpen] = useState(false);
  const [localEncounters, setLocalEncounters] = useState<Encounter[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newEncounterName, setNewEncounterName] = useState("");
  const dndId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Sync local state when encounters prop changes (e.g. optimistic delete/add)
  useEffect(() => {
    if (!open) return;
    setLocalEncounters((prev) => {
      // Preserve local renames/reordering, but remove deleted items and add new ones
      const prevIds = new Set(prev.map((e) => e.id));
      const propIds = new Set(encounters.map((e) => e.id));

      // Keep local items that still exist in props (preserves local edits)
      const kept = prev.filter((e) => propIds.has(e.id));
      // Add any new items from props that weren't in local state
      const added = encounters.filter((e) => !prevIds.has(e.id));

      return [...kept, ...added];
    });
  }, [open, encounters]);

  // Detect any changes (order or names)
  const hasChanges =
    localEncounters.length === encounters.length &&
    !localEncounters.every(
      (e, i) =>
        e.id === encounters[i]?.id &&
        e.encounterName === encounters[i]?.encounterName,
    );

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setLocalEncounters([...encounters]);
      setEditingId(null);
      setNewEncounterName("");
    }
    setOpen(isOpen);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalEncounters((prev) => {
      const oldIndex = prev.findIndex((e) => e.id === active.id);
      const newIndex = prev.findIndex((e) => e.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setLocalEncounters((prev) => arrayMove(prev, index, index - 1));
  };

  const handleMoveDown = (index: number) => {
    if (index === localEncounters.length - 1) return;
    setLocalEncounters((prev) => arrayMove(prev, index, index + 1));
  };

  const handleRename = (encounterId: string, newName: string) => {
    setLocalEncounters((prev) =>
      prev.map((e) =>
        e.id === encounterId ? { ...e, encounterName: newName } : e,
      ),
    );
  };

  const handleSave = () => {
    onSave(
      localEncounters.map((e, i) => ({
        id: e.id,
        sortOrder: i,
        encounterName:
          e.encounterName !==
          encounters.find((orig) => orig.id === e.id)?.encounterName
            ? e.encounterName
            : undefined,
      })),
    );
    setOpen(false);
  };

  const handleAddEncounter = () => {
    const trimmed = newEncounterName.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewEncounterName("");
  };

  const activeDragEncounter = localEncounters.find((e) => e.id === activeId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 px-2">
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      {/*
       * Custom DialogContent without translate-based centering.
       * dnd-kit calculates pointer coordinates in viewport space, but
       * the standard Dialog uses translate(-50%,-50%) which shifts the
       * coordinate system and causes a ~300px drag offset.
       * Using flexbox centering on the overlay avoids this entirely.
       */}
      <DialogPortal>
        <DialogOverlay className="flex items-center justify-center">
          <DialogPrimitive.Content className="relative z-50 flex max-h-[85vh] w-full max-w-md flex-col gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg">
            <DialogHeader>
              <DialogTitle>Manage Encounters</DialogTitle>
              <DialogDescription>
                Add, rename, reorder, or remove encounters.
              </DialogDescription>
            </DialogHeader>
            <div className="grid min-h-0 gap-2 overflow-y-auto">
              <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 opacity-50">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-sm">Default/Trash</span>
              </div>
              <DndContext
                id={dndId}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={localEncounters.map((e) => e.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {localEncounters.map((encounter, idx) => (
                    <SortableRow
                      key={encounter.id}
                      encounter={encounter}
                      index={idx}
                      total={localEncounters.length}
                      onMoveUp={() => handleMoveUp(idx)}
                      onMoveDown={() => handleMoveDown(idx)}
                      onDelete={() => onDelete(encounter.id)}
                      onRename={(newName) =>
                        handleRename(encounter.id, newName)
                      }
                      isPending={isPending || isDeletePending}
                      editingId={editingId}
                      setEditingId={setEditingId}
                    />
                  ))}
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activeDragEncounter && (
                    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 shadow-lg ring-2 ring-primary/50">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-sm">
                        {activeDragEncounter.encounterName}
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
                  Add
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
                disabled={!hasChanges || isPending}
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
  );
}
