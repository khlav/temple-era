"use client";

import React, { useState } from "react";
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { RAID_ZONE_CONFIG } from "~/lib/raid-zones";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
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
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Pencil,
  Check,
  X,
} from "lucide-react";

const TWENTY_MAN_INSTANCES = ["aq20", "zg", "onyxia"];

interface TemplateEncounter {
  id: string;
  templateId: string;
  encounterKey: string;
  encounterName: string;
  sortOrder: number;
}

interface Template {
  id: string;
  zoneId: string;
  zoneName: string;
  defaultGroupCount: number;
  isActive: boolean;
  sortOrder: number;
  encounters: TemplateEncounter[];
}

interface ZoneRow {
  name: string;
  instance: string;
  template: Template | null;
}

export function RaidPlannerConfig() {
  const { toast } = useToast();
  const utils = api.useUtils();

  const { data: templates, isLoading } = api.raidPlanTemplate.getAll.useQuery();

  // Merge RAID_ZONE_CONFIG with fetched templates
  const zones: ZoneRow[] = RAID_ZONE_CONFIG.map((zone) => {
    const template = templates?.find((t) => t.zoneId === zone.instance) ?? null;
    return {
      name: zone.name,
      instance: zone.instance,
      template,
    };
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Accordion type="multiple" className="w-full">
      {zones.map((zone) => (
        <ZoneAccordionItem key={zone.instance} zone={zone} />
      ))}
    </Accordion>
  );

  function ZoneAccordionItem({ zone }: { zone: ZoneRow }) {
    const [newEncounterName, setNewEncounterName] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [deleteEncounterId, setDeleteEncounterId] = useState<string | null>(
      null,
    );

    const is20Man = TWENTY_MAN_INSTANCES.includes(zone.instance);
    const defaultGroupCount = is20Man ? 4 : 8;
    const encounterCount = zone.template?.encounters.length ?? 0;

    const upsertTemplate = api.raidPlanTemplate.upsertTemplate.useMutation({
      onSuccess: () => {
        void utils.raidPlanTemplate.getAll.invalidate();
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });

    const updateTemplate = api.raidPlanTemplate.updateTemplate.useMutation({
      onMutate: async (variables) => {
        await utils.raidPlanTemplate.getAll.cancel();
        const previous = utils.raidPlanTemplate.getAll.getData();
        utils.raidPlanTemplate.getAll.setData(undefined, (old) => {
          if (!old) return old;
          return old.map((t) =>
            t.id === variables.templateId
              ? {
                  ...t,
                  ...(variables.isActive !== undefined && {
                    isActive: variables.isActive,
                  }),
                  ...(variables.sortOrder !== undefined && {
                    sortOrder: variables.sortOrder,
                  }),
                  ...(variables.defaultGroupCount !== undefined && {
                    defaultGroupCount: variables.defaultGroupCount,
                  }),
                }
              : t,
          );
        });
        return { previous };
      },
      onError: (error, _variables, context) => {
        if (context?.previous) {
          utils.raidPlanTemplate.getAll.setData(undefined, context.previous);
        }
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
      onSettled: () => {
        void utils.raidPlanTemplate.getAll.invalidate();
      },
    });

    const addEncounter = api.raidPlanTemplate.addEncounter.useMutation({
      onMutate: async (variables) => {
        await utils.raidPlanTemplate.getAll.cancel();
        const previous = utils.raidPlanTemplate.getAll.getData();
        const tempId = crypto.randomUUID();
        const encounterKey = variables.encounterName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        utils.raidPlanTemplate.getAll.setData(undefined, (old) => {
          if (!old) return old;
          return old.map((t) => {
            if (t.id !== variables.templateId) return t;
            const maxSort = t.encounters.reduce(
              (m, e) => Math.max(m, e.sortOrder),
              -1,
            );
            return {
              ...t,
              encounters: [
                ...t.encounters,
                {
                  id: tempId,
                  templateId: variables.templateId,
                  encounterKey,
                  encounterName: variables.encounterName,
                  sortOrder: maxSort + 1,
                },
              ],
            };
          });
        });
        setNewEncounterName("");
        return { previous };
      },
      onError: (error, _variables, context) => {
        if (context?.previous) {
          utils.raidPlanTemplate.getAll.setData(undefined, context.previous);
        }
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
      onSettled: () => {
        void utils.raidPlanTemplate.getAll.invalidate();
      },
    });

    const updateEncounter = api.raidPlanTemplate.updateEncounter.useMutation({
      onMutate: async (variables) => {
        await utils.raidPlanTemplate.getAll.cancel();
        const previous = utils.raidPlanTemplate.getAll.getData();
        utils.raidPlanTemplate.getAll.setData(undefined, (old) => {
          if (!old) return old;
          return old.map((t) => ({
            ...t,
            encounters: t.encounters.map((e) => {
              if (e.id !== variables.encounterId) return e;
              return {
                ...e,
                ...(variables.encounterName !== undefined && {
                  encounterName: variables.encounterName,
                  encounterKey: variables.encounterName
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, ""),
                }),
                ...(variables.sortOrder !== undefined && {
                  sortOrder: variables.sortOrder,
                }),
              };
            }),
          }));
        });
        setEditingId(null);
        return { previous };
      },
      onError: (error, _variables, context) => {
        if (context?.previous) {
          utils.raidPlanTemplate.getAll.setData(undefined, context.previous);
        }
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
      onSettled: () => {
        void utils.raidPlanTemplate.getAll.invalidate();
      },
    });

    const deleteEncounter = api.raidPlanTemplate.deleteEncounter.useMutation({
      onMutate: async (variables) => {
        await utils.raidPlanTemplate.getAll.cancel();
        const previous = utils.raidPlanTemplate.getAll.getData();
        utils.raidPlanTemplate.getAll.setData(undefined, (old) => {
          if (!old) return old;
          return old.map((t) => ({
            ...t,
            encounters: t.encounters.filter(
              (e) => e.id !== variables.encounterId,
            ),
          }));
        });
        return { previous };
      },
      onError: (error, _variables, context) => {
        if (context?.previous) {
          utils.raidPlanTemplate.getAll.setData(undefined, context.previous);
        }
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
      onSettled: () => {
        void utils.raidPlanTemplate.getAll.invalidate();
      },
    });

    const reorderEncounters =
      api.raidPlanTemplate.reorderEncounters.useMutation({
        onMutate: async (variables) => {
          await utils.raidPlanTemplate.getAll.cancel();
          const previous = utils.raidPlanTemplate.getAll.getData();
          const orderMap = new Map(
            variables.encounters.map((e) => [e.id, e.sortOrder]),
          );
          utils.raidPlanTemplate.getAll.setData(undefined, (old) => {
            if (!old) return old;
            return old.map((t) => ({
              ...t,
              encounters: t.encounters.map((e) => {
                const newOrder = orderMap.get(e.id);
                return newOrder !== undefined
                  ? { ...e, sortOrder: newOrder }
                  : e;
              }),
            }));
          });
          return { previous };
        },
        onError: (error, _variables, context) => {
          if (context?.previous) {
            utils.raidPlanTemplate.getAll.setData(undefined, context.previous);
          }
          toast({
            title: "Error",
            description: error.message,
            variant: "destructive",
          });
        },
        onSettled: () => {
          void utils.raidPlanTemplate.getAll.invalidate();
        },
      });

    const handleAddEncounter = async (e: React.FormEvent) => {
      e.preventDefault();
      const name = newEncounterName.trim();
      if (!name) return;

      if (zone.template) {
        // Template already exists, just add the encounter
        addEncounter.mutate({
          templateId: zone.template.id,
          encounterName: name,
        });
      } else {
        // Create the template first, then add the encounter
        upsertTemplate.mutate(
          {
            zoneId: zone.instance,
            zoneName: zone.name,
            defaultGroupCount,
            isActive: true,
            sortOrder: RAID_ZONE_CONFIG.findIndex(
              (z) => z.instance === zone.instance,
            ),
          },
          {
            onSuccess: (data) => {
              addEncounter.mutate({
                templateId: data.id,
                encounterName: name,
              });
            },
          },
        );
      }
    };

    const handleToggleActive = (checked: boolean) => {
      if (!zone.template) return;
      updateTemplate.mutate({
        templateId: zone.template.id,
        isActive: checked,
      });
    };

    const handleMoveEncounter = (
      encounter: TemplateEncounter,
      direction: "up" | "down",
    ) => {
      if (!zone.template) return;
      const encounters = [...zone.template.encounters].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      const idx = encounters.findIndex((e) => e.id === encounter.id);
      if (
        (direction === "up" && idx === 0) ||
        (direction === "down" && idx === encounters.length - 1)
      ) {
        return;
      }

      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      const updated = encounters.map((e, i) => {
        if (i === idx)
          return { id: e.id, sortOrder: encounters[swapIdx]!.sortOrder };
        if (i === swapIdx)
          return { id: e.id, sortOrder: encounters[idx]!.sortOrder };
        return { id: e.id, sortOrder: e.sortOrder };
      });

      reorderEncounters.mutate({ encounters: updated });
    };

    const handleRenameSubmit = (encounterId: string) => {
      const name = editingName.trim();
      if (!name) return;
      updateEncounter.mutate({ encounterId, encounterName: name });
    };

    const handleDeleteConfirm = () => {
      if (!deleteEncounterId) return;
      deleteEncounter.mutate({ encounterId: deleteEncounterId });
      setDeleteEncounterId(null);
    };

    const sortedEncounters = zone.template
      ? [...zone.template.encounters].sort((a, b) => a.sortOrder - b.sortOrder)
      : [];

    return (
      <>
        <AccordionItem value={zone.instance}>
          <AccordionTrigger className="hover:no-underline">
            <div className="flex flex-1 items-center gap-3">
              <span className="text-base font-semibold">{zone.name}</span>
              <span className="text-xs text-muted-foreground">
                {defaultGroupCount} groups, {is20Man ? "20" : "40"}-man
              </span>
              {zone.template ? (
                <Badge variant="secondary">
                  {encounterCount} encounter{encounterCount !== 1 ? "s" : ""}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Not configured
                </Badge>
              )}
              <div className="ml-auto mr-2 flex items-center gap-2">
                {zone.template && (
                  <div
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Label
                      htmlFor={`active-${zone.instance}`}
                      className="text-xs text-muted-foreground"
                    >
                      Active
                    </Label>
                    <Switch
                      id={`active-${zone.instance}`}
                      checked={zone.template.isActive}
                      onCheckedChange={handleToggleActive}
                      disabled={updateTemplate.isPending}
                    />
                  </div>
                )}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-2 gap-6">
              {/* Left column: encounters */}
              <div className="space-y-4">
                {/* Default/Trash — always present */}
                <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-muted-foreground">
                  <span className="flex-1 text-sm italic">Default/Trash</span>
                  <span className="text-xs">Included by default</span>
                </div>

                {/* Encounter list */}
                {sortedEncounters.length > 0 && (
                  <div className="space-y-1">
                    {sortedEncounters.map((encounter, idx) => (
                      <div
                        key={encounter.id}
                        className="flex items-center gap-2 rounded-md border px-3 py-2"
                      >
                        {editingId === encounter.id ? (
                          <>
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleRenameSubmit(encounter.id);
                                } else if (e.key === "Escape") {
                                  setEditingId(null);
                                }
                              }}
                              className="h-7 flex-1"
                              autoFocus
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleRenameSubmit(encounter.id)}
                              disabled={updateEncounter.isPending}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm">
                              {encounter.encounterName}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingId(encounter.id);
                                setEditingName(encounter.encounterName);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={
                                idx === 0 || reorderEncounters.isPending
                              }
                              onClick={() =>
                                handleMoveEncounter(encounter, "up")
                              }
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={
                                idx === sortedEncounters.length - 1 ||
                                reorderEncounters.isPending
                              }
                              onClick={() =>
                                handleMoveEncounter(encounter, "down")
                              }
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteEncounterId(encounter.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add encounter form */}
                <form
                  onSubmit={handleAddEncounter}
                  className="flex items-center gap-2"
                >
                  <Input
                    placeholder="Encounter name"
                    value={newEncounterName}
                    onChange={(e) => setNewEncounterName(e.target.value)}
                    className="h-8 flex-1"
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={
                      !newEncounterName.trim() ||
                      addEncounter.isPending ||
                      upsertTemplate.isPending
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add
                  </Button>
                </form>
              </div>

              {/* Right column: reserved for future use */}
              <div />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Delete confirmation dialog */}
        <AlertDialog
          open={!!deleteEncounterId}
          onOpenChange={(open) => {
            if (!open) setDeleteEncounterId(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete encounter</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this encounter from the
                template? This will not affect existing raid plans.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }
}
