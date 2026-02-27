"use client";

import React, { useState, useMemo } from "react";
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { RAID_ZONE_CONFIG } from "~/lib/raid-zones";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { FolderOpen } from "lucide-react";
import { AATemplateEditorDialog } from "./aa-template-editor-dialog";
import { ManageEncountersDialog } from "./manage-encounters-dialog";
import { getGroupCount } from "./constants";

interface TemplateEncounter {
  id: string;
  templateId: string;
  encounterKey: string;
  encounterName: string;
  sortOrder: number;
  groupId: string | null;
  aaTemplate: string | null;
}

interface TemplateEncounterGroup {
  id: string;
  templateId: string;
  groupName: string;
  sortOrder: number;
}

interface Template {
  id: string;
  zoneId: string;
  zoneName: string;
  defaultGroupCount: number;
  isActive: boolean;
  sortOrder: number;
  defaultAATemplate: string | null;
  encounters: TemplateEncounter[];
  encounterGroups: TemplateEncounterGroup[];
}

interface ZoneRow {
  name: string;
  instance: string;
  template: Template | null;
}

// ── ZoneAccordionItem ──────────────────────────────────────────────────────────
// Defined at module level (not inside RaidPlannerConfig) so React does NOT
// unmount/remount it on parent re-renders — which would close the
// ManageEncountersDialog after every query invalidation.

function ZoneAccordionItem({ zone }: { zone: ZoneRow }) {
  const { toast } = useToast();
  const utils = api.useUtils();

  const [aaDialogContext, setAADialogContext] = useState<{
    type: "default" | "encounter";
    encounterId?: string;
    label: string;
    currentTemplate: string;
  } | null>(null);

  const defaultGroupCount = getGroupCount(zone.instance);
  const is20Man = defaultGroupCount === 4;
  const encounterCount = zone.template?.encounters.length ?? 0;
  const groupCount = zone.template?.encounterGroups.length ?? 0;

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
                ...(variables.defaultAATemplate !== undefined && {
                  defaultAATemplate: variables.defaultAATemplate,
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
                groupId: variables.groupId ?? null,
                aaTemplate: null,
              },
            ],
          };
        });
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
              ...(variables.aaTemplate !== undefined && {
                aaTemplate: variables.aaTemplate,
              }),
            };
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

  const createGroup =
    api.raidPlanTemplate.createTemplateEncounterGroup.useMutation({
      onSuccess: () => void utils.raidPlanTemplate.getAll.invalidate(),
      onError: (error) =>
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        }),
    });

  const updateGroup =
    api.raidPlanTemplate.updateTemplateEncounterGroup.useMutation({
      onSuccess: () => void utils.raidPlanTemplate.getAll.invalidate(),
      onError: (error) =>
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        }),
    });

  const deleteGroup =
    api.raidPlanTemplate.deleteTemplateEncounterGroup.useMutation({
      onSuccess: () => void utils.raidPlanTemplate.getAll.invalidate(),
      onError: (error) =>
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        }),
    });

  const reorderEncounterGroups =
    api.raidPlanTemplate.reorderEncounterGroups.useMutation({
      onMutate: async (variables) => {
        await utils.raidPlanTemplate.getAll.cancel();
        const previous = utils.raidPlanTemplate.getAll.getData();
        const groupOrderMap = new Map(
          variables.groups.map((g) => [g.id, g.sortOrder]),
        );
        const encUpdateMap = new Map(
          variables.encounters.map((e) => [
            e.id,
            { sortOrder: e.sortOrder, groupId: e.groupId },
          ]),
        );
        utils.raidPlanTemplate.getAll.setData(undefined, (old) => {
          if (!old) return old;
          return old.map((t) => ({
            ...t,
            encounterGroups: t.encounterGroups.map((g) => ({
              ...g,
              sortOrder: groupOrderMap.get(g.id) ?? g.sortOrder,
            })),
            encounters: t.encounters.map((e) => {
              const update = encUpdateMap.get(e.id);
              return update
                ? { ...e, sortOrder: update.sortOrder, groupId: update.groupId }
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

  const handleToggleActive = (checked: boolean) => {
    if (!zone.template) return;
    updateTemplate.mutate({
      templateId: zone.template.id,
      isActive: checked,
    });
  };

  const handleDialogAdd = (encounterName: string) => {
    if (zone.template) {
      addEncounter.mutate({ templateId: zone.template.id, encounterName });
    } else {
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
            addEncounter.mutate({ templateId: data.id, encounterName });
          },
        },
      );
    }
  };

  const handleDialogCreateGroup = (groupName: string) => {
    if (zone.template) {
      createGroup.mutate({ templateId: zone.template.id, groupName });
    } else {
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
            createGroup.mutate({ templateId: data.id, groupName });
          },
        },
      );
    }
  };

  const handleSave = (payload: {
    groups: Array<{ id: string; sortOrder: number; groupName?: string }>;
    encounters: Array<{
      id: string;
      sortOrder: number;
      groupId: string | null;
      encounterName?: string;
    }>;
  }) => {
    reorderEncounterGroups.mutate({
      groups: payload.groups.map((g) => ({ id: g.id, sortOrder: g.sortOrder })),
      encounters: payload.encounters.map((e) => ({
        id: e.id,
        sortOrder: e.sortOrder,
        groupId: e.groupId,
      })),
    });
    for (const g of payload.groups) {
      if (g.groupName !== undefined) {
        updateGroup.mutate({ groupId: g.id, groupName: g.groupName });
      }
    }
    for (const e of payload.encounters) {
      if (e.encounterName !== undefined) {
        updateEncounter.mutate({
          encounterId: e.id,
          encounterName: e.encounterName,
        });
      }
    }
  };

  const handleAADialogSave = (template: string) => {
    if (!zone.template || !aaDialogContext) return;

    if (aaDialogContext.type === "default") {
      updateTemplate.mutate(
        {
          templateId: zone.template.id,
          defaultAATemplate: template || null,
        },
        {
          onSuccess: () => setAADialogContext(null),
        },
      );
    } else if (aaDialogContext.encounterId) {
      updateEncounter.mutate(
        {
          encounterId: aaDialogContext.encounterId,
          aaTemplate: template || null,
        },
        {
          onSuccess: () => setAADialogContext(null),
        },
      );
    }
  };

  const handleAADialogClear = () => {
    if (!zone.template || !aaDialogContext) return;

    if (aaDialogContext.type === "default") {
      updateTemplate.mutate(
        {
          templateId: zone.template.id,
          defaultAATemplate: null,
        },
        {
          onSuccess: () => setAADialogContext(null),
        },
      );
    } else if (aaDialogContext.encounterId) {
      updateEncounter.mutate(
        {
          encounterId: aaDialogContext.encounterId,
          aaTemplate: null,
        },
        {
          onSuccess: () => setAADialogContext(null),
        },
      );
    }
  };

  const sortedGroups = useMemo(() => {
    return zone.template
      ? [...zone.template.encounterGroups].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        )
      : [];
  }, [zone.template]);

  const sortedEncounters = useMemo(() => {
    return zone.template
      ? [...zone.template.encounters].sort((a, b) => a.sortOrder - b.sortOrder)
      : [];
  }, [zone.template]);

  // Build display: interleave groups and ungrouped encounters by sortOrder
  type DisplayGroup = {
    kind: "group";
    group: TemplateEncounterGroup;
    encounters: TemplateEncounter[];
  };
  type DisplayEnc = { kind: "encounter"; encounter: TemplateEncounter };
  type DisplayItem = DisplayGroup | DisplayEnc;

  const groupIds = new Set(
    sortedGroups.map((g: TemplateEncounterGroup) => g.id),
  );
  const ungroupedEncs = sortedEncounters.filter(
    (e: TemplateEncounter) => !e.groupId || !groupIds.has(e.groupId),
  );
  const byGroup = new Map<string, TemplateEncounter[]>(
    sortedGroups.map((g: TemplateEncounterGroup) => [g.id, []]),
  );
  for (const enc of sortedEncounters) {
    if (enc.groupId && byGroup.has(enc.groupId)) {
      byGroup.get(enc.groupId)!.push(enc);
    }
  }
  const displayItems: DisplayItem[] = [
    ...ungroupedEncs.map((e: TemplateEncounter) => ({
      kind: "encounter" as const,
      encounter: e,
      sortOrder: e.sortOrder,
    })),
    ...sortedGroups.map((g: TemplateEncounterGroup) => ({
      kind: "group" as const,
      group: g,
      encounters: byGroup.get(g.id) ?? [],
      sortOrder: g.sortOrder,
    })),
  ]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder: _so, ...rest }) => rest as DisplayItem);

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
                {groupCount > 0 &&
                  `, ${groupCount} subgroup${groupCount !== 1 ? "s" : ""}`}
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
          <div className="space-y-4">
            {/* Encounters section */}
            <div className="max-w-xl space-y-2">
              {/* Section header with manage button */}
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Encounters
                </h4>
                <ManageEncountersDialog
                  compact={false}
                  encounters={sortedEncounters}
                  encounterGroups={sortedGroups}
                  onSave={handleSave}
                  onDelete={(encId) =>
                    deleteEncounter.mutate({ encounterId: encId })
                  }
                  onAdd={handleDialogAdd}
                  onCreateGroup={handleDialogCreateGroup}
                  onDeleteGroup={(groupId, mode) =>
                    deleteGroup.mutate({ groupId, mode })
                  }
                  isPending={reorderEncounterGroups.isPending}
                  isDeletePending={deleteEncounter.isPending}
                  isAddPending={
                    addEncounter.isPending || upsertTemplate.isPending
                  }
                  isGroupPending={
                    createGroup.isPending || deleteGroup.isPending
                  }
                />
              </div>

              {/* Default/Trash row */}
              <div className="rounded-md border">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 text-sm text-muted-foreground">
                    Default/Trash
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setAADialogContext({
                        type: "default",
                        label: "Default/Trash",
                        currentTemplate: zone.template?.defaultAATemplate ?? "",
                      })
                    }
                  >
                    {zone.template?.defaultAATemplate ? "Edit AA" : "Add AA"}
                  </Button>
                </div>
              </div>

              {/* Read-only encounter list */}
              {displayItems.length > 0 ? (
                <div className="space-y-1">
                  {displayItems.map((item) =>
                    item.kind === "group" ? (
                      <div
                        key={item.group.id}
                        className="overflow-hidden rounded-md border"
                      >
                        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="flex-1 text-sm font-medium">
                            {item.group.groupName}
                          </span>
                        </div>
                        {item.encounters.length === 0 ? (
                          <p className="px-3 py-2 text-xs italic text-muted-foreground">
                            No encounters in this group
                          </p>
                        ) : (
                          <div className="divide-y">
                            {item.encounters.map((encounter) => (
                              <div
                                key={encounter.id}
                                className="ml-6 flex items-center gap-2 border-l-2 border-muted/50 px-3 py-2"
                              >
                                <span className="min-w-0 flex-1 truncate text-sm">
                                  {encounter.encounterName}
                                </span>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() =>
                                    setAADialogContext({
                                      type: "encounter",
                                      encounterId: encounter.id,
                                      label: encounter.encounterName,
                                      currentTemplate:
                                        encounter.aaTemplate ?? "",
                                    })
                                  }
                                >
                                  {encounter.aaTemplate ? "Edit AA" : "Add AA"}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        key={item.encounter.id}
                        className="flex items-center gap-2 rounded-md border px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {item.encounter.encounterName}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            setAADialogContext({
                              type: "encounter",
                              encounterId: item.encounter.id,
                              label: item.encounter.encounterName,
                              currentTemplate: item.encounter.aaTemplate ?? "",
                            })
                          }
                        >
                          {item.encounter.aaTemplate ? "Edit AA" : "Add AA"}
                        </Button>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No encounters configured. Click the settings icon above to add
                  encounters.
                </p>
              )}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* AA template config dialog */}
      <AATemplateEditorDialog
        open={!!aaDialogContext}
        onOpenChange={(open) => {
          if (!open) setAADialogContext(null);
        }}
        contextLabel={aaDialogContext?.label ?? ""}
        zoneName={zone.name}
        initialTemplate={aaDialogContext?.currentTemplate ?? ""}
        hasExistingTemplate={!!aaDialogContext?.currentTemplate}
        onSave={handleAADialogSave}
        onClear={handleAADialogClear}
        isSaving={updateTemplate.isPending || updateEncounter.isPending}
      />
    </>
  );
}

// ── RaidPlannerConfig ──────────────────────────────────────────────────────────

export function RaidPlannerConfig() {
  const { data: templates, isLoading } = api.raidPlanTemplate.getAll.useQuery();

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
    <div className="ml-0 w-[62.5%]">
      <Accordion type="multiple" className="w-full">
        {zones.map((zone) => (
          <ZoneAccordionItem key={zone.instance} zone={zone} />
        ))}
      </Accordion>
    </div>
  );
}
