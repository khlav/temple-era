"use client";

import { useState, useId } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
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
import { X } from "lucide-react";

interface Encounter {
  id: string;
  encounterName: string;
  sortOrder: number;
}

interface ReorderEncountersDialogProps {
  encounters: Encounter[];
  onSave: (encounters: Array<{ id: string; sortOrder: number }>) => void;
  isPending: boolean;
}

function SortableRow({
  encounter,
  index,
  total,
  onMoveUp,
  onMoveDown,
  isPending,
}: {
  encounter: Encounter;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isPending: boolean;
}) {
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
      <span className="flex-1 text-sm">{encounter.encounterName}</span>
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
    </div>
  );
}

export function ReorderEncountersDialog({
  encounters,
  onSave,
  isPending,
}: ReorderEncountersDialogProps) {
  const [open, setOpen] = useState(false);
  const [localEncounters, setLocalEncounters] = useState<Encounter[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dndId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (encounters.length < 2) return null;

  const orderUnchanged =
    localEncounters.length === encounters.length &&
    localEncounters.every((e, i) => e.id === encounters[i]?.id);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setLocalEncounters([...encounters]);
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

  const handleSave = () => {
    onSave(localEncounters.map((e, i) => ({ id: e.id, sortOrder: i })));
    setOpen(false);
  };

  const activeDragEncounter = localEncounters.find((e) => e.id === activeId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 px-2">
          <ArrowUpDown className="h-4 w-4" />
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
              <DialogTitle>Reorder Encounters</DialogTitle>
              <DialogDescription>
                Drag or use arrows to reorder encounter tabs.
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
                      isPending={isPending}
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
                disabled={orderUnchanged || isPending}
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
