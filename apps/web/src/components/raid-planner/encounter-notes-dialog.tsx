"use client";

import { useState, useMemo } from "react";
import { Loader2, Plus, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { AAIcon } from "~/components/ui/aa-icons";
import { ClassIcon } from "~/components/ui/class-icon";
import { useSpellIcon, getSpellIconUrl } from "~/hooks/use-spell-icon";
import {
  AA_TEXTURE_TAGS,
  AA_CLASS_ICONS,
  AA_ABILITY_ICONS,
  RAID_MARKER_ALIASES,
} from "~/lib/aa-formatting";
import { api } from "~/trpc/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EncounterNote {
  id: string;
  iconRef: string;
  text: string | null;
  sortOrder: number;
}

interface EncounterNotesDialogProps {
  encounterId: string;
  encounterName: string;
  notes: EncounterNote[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
}

// ---------------------------------------------------------------------------
// Icon alias option list
// ---------------------------------------------------------------------------

type IconOption = {
  alias: string;
  iconType: "texture" | "class" | "ability" | "marker";
  textureName?: string;
  markerName?: string;
};

const ICON_OPTIONS: IconOption[] = [
  // texture tags (deduplicate by alias)
  ...Object.entries(AA_TEXTURE_TAGS).map(([alias, textureName]) => ({
    alias,
    iconType: "texture" as const,
    textureName,
  })),
  // class icons
  ...AA_CLASS_ICONS.map((cls) => ({
    alias: cls,
    iconType: "class" as const,
  })),
  // ability icons
  ...AA_ABILITY_ICONS.map((ability) => ({
    alias: ability,
    iconType: "ability" as const,
  })),
  // raid marker aliases (rt1-rt8)
  ...Object.entries(RAID_MARKER_ALIASES).map(([alias, markerName]) => ({
    alias,
    iconType: "marker" as const,
    markerName,
  })),
];

// ---------------------------------------------------------------------------
// Resolve an iconRef to its render info
// ---------------------------------------------------------------------------

function resolveIconRef(iconRef: string): {
  type: "texture" | "class" | "ability" | "marker" | "spell";
  textureName?: string;
  className?: string;
  abilityName?: string;
  markerName?: string;
  spellId?: number;
} {
  // Numeric → spell ID
  if (/^\d+$/.test(iconRef)) {
    return { type: "spell", spellId: parseInt(iconRef, 10) };
  }
  // Texture tag
  if (AA_TEXTURE_TAGS[iconRef]) {
    return { type: "texture", textureName: AA_TEXTURE_TAGS[iconRef] };
  }
  // Class icon
  if ((AA_CLASS_ICONS as readonly string[]).includes(iconRef)) {
    return { type: "class", className: iconRef };
  }
  // Ability icon
  if ((AA_ABILITY_ICONS as readonly string[]).includes(iconRef)) {
    return { type: "ability", abilityName: iconRef };
  }
  // Marker alias
  if (RAID_MARKER_ALIASES[iconRef]) {
    return { type: "marker", markerName: RAID_MARKER_ALIASES[iconRef] };
  }
  // Fallback as texture
  return { type: "texture", textureName: iconRef };
}

// ---------------------------------------------------------------------------
// Small icon preview component (handles spell IDs with hooks)
// ---------------------------------------------------------------------------

function SpellIconPreview({ spellId, size }: { spellId: number; size: number }) {
  const spellData = useSpellIcon(spellId);
  if (spellData.loading) {
    return (
      <span className="inline-block rounded-sm bg-muted" style={{ width: size, height: size }} />
    );
  }
  if (spellData.icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={getSpellIconUrl(spellData.icon)}
        alt={`Spell ${spellId}`}
        width={size}
        height={size}
        className="rounded-sm"
        style={{ width: size, height: size }}
      />
    );
  }
  return null;
}

function IconPreview({ iconRef, size = 18 }: { iconRef: string; size?: number }) {
  if (!iconRef) return null;

  if (/^\d+$/.test(iconRef)) {
    return <SpellIconPreview spellId={parseInt(iconRef, 10)} size={size} />;
  }

  const resolved = resolveIconRef(iconRef);
  if (resolved.type === "texture" && resolved.textureName) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={getSpellIconUrl(resolved.textureName)}
        alt={iconRef}
        width={size}
        height={size}
        className="rounded-sm"
        style={{ width: size, height: size }}
      />
    );
  }
  if (resolved.type === "class" && resolved.className) {
    const classForIcon = resolved.className === "deathknight" ? "death knight" : resolved.className;
    return (
      <ClassIcon
        characterClass={classForIcon}
        px={size}
        className="inline-block align-text-bottom"
      />
    );
  }
  if (resolved.type === "ability" && resolved.abilityName) {
    return (
      <AAIcon
        name={resolved.abilityName}
        type="ability"
        size={size}
        className="inline-block align-text-bottom"
      />
    );
  }
  if (resolved.type === "marker" && resolved.markerName) {
    return (
      <AAIcon
        name={resolved.markerName}
        type="marker"
        size={size}
        className="inline-block align-text-bottom"
      />
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Option icon (for combobox list items) — must not conditionally call hooks
// ---------------------------------------------------------------------------

function OptionIcon({ option }: { option: IconOption }) {
  if (option.iconType === "texture" && option.textureName) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={getSpellIconUrl(option.textureName)}
        alt={option.alias}
        width={16}
        height={16}
        className="rounded-sm"
        style={{ width: 16, height: 16 }}
      />
    );
  }
  if (option.iconType === "class") {
    const classForIcon = option.alias === "deathknight" ? "death knight" : option.alias;
    return (
      <ClassIcon characterClass={classForIcon} px={16} className="inline-block align-text-bottom" />
    );
  }
  if (option.iconType === "ability") {
    return (
      <AAIcon
        name={option.alias}
        type="ability"
        size={16}
        className="inline-block align-text-bottom"
      />
    );
  }
  if (option.iconType === "marker" && option.markerName) {
    return (
      <AAIcon
        name={option.markerName}
        type="marker"
        size={16}
        className="inline-block align-text-bottom"
      />
    );
  }
  return null;
}

// Spell ID fallback option that uses hooks (rendered as a standalone component)
function SpellIdOption({ spellId, onSelect }: { spellId: number; onSelect: () => void }) {
  const { icon } = useSpellIcon(spellId);
  return (
    <CommandItem value={`spell:${spellId}`} onSelect={onSelect} className="flex items-center gap-2">
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={getSpellIconUrl(icon)}
          alt={`Spell ${spellId}`}
          width={16}
          height={16}
          className="rounded-sm"
          style={{ width: 16, height: 16 }}
        />
      ) : (
        <span className="inline-block h-4 w-4 rounded-sm bg-muted" />
      )}
      <span className="text-xs">Use spell ID: {spellId}</span>
    </CommandItem>
  );
}

// ---------------------------------------------------------------------------
// Icon picker combobox
// ---------------------------------------------------------------------------

interface IconPickerProps {
  value: string;
  onChange: (value: string) => void;
}

function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const isNumericSearch = /^\d+$/.test(search) && search.length > 0;

  const filteredOptions = useMemo(() => {
    if (!search) return ICON_OPTIONS.slice(0, 50);
    const q = search.toLowerCase();
    return ICON_OPTIONS.filter((opt) => opt.alias.toLowerCase().includes(q)).slice(0, 50);
  }, [search]);

  const hasAliasMatch = filteredOptions.length > 0;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
      modal={true}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="flex h-8 w-40 items-center justify-between gap-1 px-2 text-xs"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {value ? (
              <>
                <IconPreview iconRef={value} size={16} />
                <span className="truncate font-mono">{value}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Pick icon…</span>
            )}
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search alias or spell ID…"
            value={search}
            onValueChange={setSearch}
            className="h-8 text-xs"
          />
          <CommandList>
            {isNumericSearch && !hasAliasMatch && (
              <CommandGroup>
                <SpellIdOption
                  spellId={parseInt(search, 10)}
                  onSelect={() => {
                    onChange(search);
                    setSearch("");
                    setOpen(false);
                  }}
                />
              </CommandGroup>
            )}
            {filteredOptions.length === 0 && !isNumericSearch && (
              <CommandEmpty>No icons found.</CommandEmpty>
            )}
            {filteredOptions.length > 0 && (
              <CommandGroup>
                {filteredOptions.map((opt) => (
                  <CommandItem
                    key={`${opt.iconType}-${opt.alias}`}
                    value={opt.alias}
                    onSelect={() => {
                      onChange(opt.alias);
                      setSearch("");
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 text-xs"
                  >
                    <OptionIcon option={opt} />
                    <span className="font-mono">{opt.alias}</span>
                    {value === opt.alias && (
                      <Check className="ml-auto h-3 w-3 shrink-0 opacity-70" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Note row (one per slot 0, 1, 2)
// ---------------------------------------------------------------------------

interface NoteRowState {
  id: string | null; // null = new
  iconRef: string;
  text: string;
  dirty: boolean;
}

function initRowState(note: EncounterNote | undefined): NoteRowState {
  if (!note) {
    return { id: null, iconRef: "", text: "", dirty: false };
  }
  return { id: note.id, iconRef: note.iconRef, text: note.text ?? "", dirty: false };
}

interface NoteRowProps {
  sortOrder: number;
  state: NoteRowState;
  isAdding: boolean;
  onStartAdd: () => void;
  onChange: (updates: Partial<NoteRowState>) => void;
  onSave: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}

function NoteRow({
  sortOrder,
  state,
  isAdding,
  onStartAdd,
  onChange,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: NoteRowProps) {
  const isExisting = state.id !== null;
  const isActive = isExisting || isAdding;

  if (!isActive) {
    // Empty slot — show Add button
    return (
      <div className="flex h-10 items-center gap-2">
        <span className="w-4 text-center text-xs text-muted-foreground">{sortOrder + 1}.</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-muted-foreground"
          onClick={onStartAdd}
        >
          <Plus className="h-3 w-3" />
          Add note
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-4 shrink-0 text-center text-xs text-muted-foreground">
        {sortOrder + 1}.
      </span>

      {/* Icon picker */}
      <IconPicker value={state.iconRef} onChange={(v) => onChange({ iconRef: v, dirty: true })} />

      {/* Text input */}
      <Input
        className="h-8 min-w-0 flex-1 text-xs"
        placeholder="Note text…"
        value={state.text}
        onChange={(e) => onChange({ text: e.target.value, dirty: true })}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") onSave();
        }}
        onBlur={onSave}
        maxLength={128}
      />

      {/* Save button */}
      <Button
        variant="outline"
        size="sm"
        className="h-8 shrink-0 px-2 text-xs"
        onClick={onSave}
        aria-label="Save note"
        disabled={!state.iconRef || isSaving || (!!state.id && !state.dirty)}
      >
        {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </Button>

      {/* Delete button — only for existing notes */}
      {isExisting && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2 text-xs text-destructive hover:text-destructive"
          onClick={onDelete}
          aria-label="Delete note"
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export function EncounterNotesDialog({
  encounterId,
  encounterName,
  notes,
  open,
  onOpenChange,
  planId,
}: EncounterNotesDialogProps) {
  // Row states indexed by sortOrder (0, 1, 2)
  const [rows, setRows] = useState<NoteRowState[]>(() => [
    initRowState(notes.find((n) => n.sortOrder === 0)),
    initRowState(notes.find((n) => n.sortOrder === 1)),
    initRowState(notes.find((n) => n.sortOrder === 2)),
  ]);

  // Track which empty slots are being actively edited
  const [addingSlots, setAddingSlots] = useState<Set<number>>(new Set());

  // Track which row is saving / deleting
  const [savingRow, setSavingRow] = useState<number | null>(null);
  const [deletingRow, setDeletingRow] = useState<number | null>(null);

  const utils = api.useUtils();

  const upsertMutation = api.raidPlan.upsertEncounterNote.useMutation({
    onSuccess: (result, variables) => {
      // Patch cache immediately so sidebar updates without waiting for refetch
      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;
        return {
          ...old,
          encounters: old.encounters.map((enc) => {
            if (enc.id !== encounterId) return enc;
            const existing = enc.notes ?? [];
            const without = existing.filter((n) => n.sortOrder !== variables.sortOrder);
            const updated = [
              ...without,
              {
                id: result.id,
                iconRef: variables.iconRef,
                text: variables.text ?? null,
                sortOrder: variables.sortOrder,
              },
            ].sort((a, b) => a.sortOrder - b.sortOrder);
            return { ...enc, notes: updated };
          }),
        };
      });
      void utils.raidPlan.getById.invalidate({ planId });

      // Update local row state with saved id
      setRows((prev) => {
        const next = [...prev];
        const row = next[variables.sortOrder];
        if (row) {
          next[variables.sortOrder] = { ...row, id: result.id, dirty: false };
        }
        return next;
      });
      setAddingSlots((prev) => {
        const next = new Set(prev);
        next.delete(variables.sortOrder);
        return next;
      });
      setSavingRow(null);
    },
    onError: () => {
      setSavingRow(null);
    },
  });

  const deleteMutation = api.raidPlan.deleteEncounterNote.useMutation({
    onSuccess: (_, variables) => {
      // Patch cache immediately
      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;
        return {
          ...old,
          encounters: old.encounters.map((enc) =>
            enc.id !== encounterId
              ? enc
              : { ...enc, notes: (enc.notes ?? []).filter((n) => n.id !== variables.noteId) },
          ),
        };
      });
      void utils.raidPlan.getById.invalidate({ planId });

      // Update local row state
      const rowIndex = rows.findIndex((r) => r.id === variables.noteId);
      if (rowIndex !== -1) {
        setRows((prev) => {
          const next = [...prev];
          next[rowIndex] = initRowState(undefined);
          return next;
        });
        setAddingSlots((prev) => {
          const next = new Set(prev);
          next.delete(rowIndex);
          return next;
        });
      }
      setDeletingRow(null);
    },
    onError: () => {
      setDeletingRow(null);
    },
  });

  // Reset state when dialog opens with fresh notes
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setRows([
        initRowState(notes.find((n) => n.sortOrder === 0)),
        initRowState(notes.find((n) => n.sortOrder === 1)),
        initRowState(notes.find((n) => n.sortOrder === 2)),
      ]);
      setAddingSlots(new Set());
    }
    onOpenChange(nextOpen);
  };

  const handleChange = (sortOrder: number, updates: Partial<NoteRowState>) => {
    setRows((prev) => {
      const next = [...prev];
      const row = next[sortOrder];
      if (row) next[sortOrder] = { ...row, ...updates };
      return next;
    });
  };

  const handleSave = (sortOrder: number) => {
    const row = rows[sortOrder];
    if (!row?.iconRef) return;
    setSavingRow(sortOrder);
    upsertMutation.mutate({
      encounterId,
      sortOrder,
      iconRef: row.iconRef,
      text: row.text || undefined,
    });
  };

  const handleDelete = (sortOrder: number) => {
    const row = rows[sortOrder];
    if (!row?.id) return;
    setDeletingRow(sortOrder);
    deleteMutation.mutate({ noteId: row.id });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" onKeyDown={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            Encounter Notes —{" "}
            <span className="font-normal text-muted-foreground">{encounterName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {([0, 1, 2] as const).map((sortOrder) => {
            const row = rows[sortOrder]!;
            return (
              <NoteRow
                key={sortOrder}
                sortOrder={sortOrder}
                state={row}
                isAdding={addingSlots.has(sortOrder)}
                onStartAdd={() => {
                  setAddingSlots((prev) => new Set([...prev, sortOrder]));
                }}
                onChange={(updates) => handleChange(sortOrder, updates)}
                onSave={() => handleSave(sortOrder)}
                onDelete={() => handleDelete(sortOrder)}
                isSaving={savingRow === sortOrder}
                isDeleting={deletingRow === sortOrder}
              />
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Each note requires an icon — search by alias (e.g. "mc", "tranq") or enter a spell ID
          number. Text is optional.
        </p>
      </DialogContent>
    </Dialog>
  );
}
