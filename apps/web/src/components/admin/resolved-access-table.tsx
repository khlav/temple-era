"use client";

import * as React from "react";
import { ChevronDown, Lock, RefreshCw, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import UserAvatar from "~/components/ui/user-avatar";
import { ClassIcon } from "~/components/ui/class-icon";
import { DiscordMemberPicker } from "~/components/admin/discord-member-picker";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import { useToast } from "~/hooks/use-toast";
import {
  roleColorClasses,
  ROLE_NAME_SORT_PRIORITY,
  ROLE_PILL_BASE_CLASSES,
} from "~/lib/role-colors";

function UserWithCharacter({
  name,
  image,
  character,
}: {
  name: string;
  image: string;
  character?: { name: string; class: string } | null;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <UserAvatar name={name} image={image} showLabel={false} />
      <div className="flex flex-col">
        <span className="text-sm font-medium">{name}</span>
        {character && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ClassIcon characterClass={character.class} px={12} />
            {character.name}
          </span>
        )}
      </div>
    </div>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 127.14 96.36" fill="currentColor" className={className}>
      <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
    </svg>
  );
}

export function ResolvedAccessActions() {
  const { data: syncState } = api.user.getSyncState.useQuery();
  const utils = api.useUtils();
  const sync = api.user.triggerDiscordSync.useMutation({
    onSuccess: () => {
      void utils.user.getResolvedAccess.invalidate();
      void utils.user.getSyncState.invalidate();
    },
  });

  return (
    <div className="flex items-center gap-2">
      {syncState?.lastSyncedAt && (
        <span className="text-sm text-muted-foreground">
          Last synced {new Date(syncState.lastSyncedAt).toLocaleString()}
        </span>
      )}
      <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
        <RefreshCw className={`mr-1 size-4 ${sync.isPending ? "animate-spin" : ""}`} />
        Sync Discord Roles
      </Button>
      <DiscordMemberPicker />
    </div>
  );
}

// A role grant, or a group of discord-sync grants for the same role collapsed into one pill
// (e.g. "Council" and "Raid Leading Team" both granting Raid Manager shows as one pill listing
// both source Discord roles, instead of one duplicate pill per source).
type DisplayGrant =
  | { kind: "manual"; id: string; roleId: string; roleName: string }
  | { kind: "sync"; roleId: string; roleName: string; discordRoleNames: string[] }
  // Env-derived (Superadmin). Rendered without a remove button — it can only be changed by
  // editing SUPERADMIN_DISCORD_IDS and redeploying.
  | { kind: "env"; roleId: string; roleName: string };

function groupRoles(
  roles: {
    id: string;
    roleId: string;
    roleName: string;
    source: string;
    sourceDiscordRoleName: string | null;
  }[],
): DisplayGrant[] {
  const manual: DisplayGrant[] = roles
    .filter((r) => r.source === "manual")
    .map((r) => ({ kind: "manual" as const, id: r.id, roleId: r.roleId, roleName: r.roleName }));

  const envGrants: DisplayGrant[] = roles
    .filter((r) => r.source === "env")
    .map((r) => ({ kind: "env" as const, roleId: r.roleId, roleName: r.roleName }));

  const syncByRole = new Map<string, { roleName: string; discordRoleNames: string[] }>();
  for (const r of roles) {
    if (r.source !== "discord-sync") continue;
    const existing = syncByRole.get(r.roleId) ?? { roleName: r.roleName, discordRoleNames: [] };
    existing.discordRoleNames.push(r.sourceDiscordRoleName ?? "Discord sync");
    syncByRole.set(r.roleId, existing);
  }
  const sync: DisplayGrant[] = [...syncByRole.entries()].map(([roleId, v]) => ({
    kind: "sync" as const,
    roleId,
    roleName: v.roleName,
    discordRoleNames: [...v.discordRoleNames].sort((a, b) => a.localeCompare(b)),
  }));

  return [...envGrants, ...sync, ...manual].sort((a, b) => {
    const priorityDiff =
      (ROLE_NAME_SORT_PRIORITY[a.roleName] ?? Infinity) -
      (ROLE_NAME_SORT_PRIORITY[b.roleName] ?? Infinity);
    if (priorityDiff !== 0) return priorityDiff;
    return Number(a.kind === "manual") - Number(b.kind === "manual");
  });
}

export function ResolvedAccessTable() {
  const { data: access, isLoading, isSuccess } = api.user.getResolvedAccess.useQuery();

  // Server returns users alphabetically. Within each user's roles: system roles (Admin, then
  // Raid Manager) first, then synced before manual.
  const sortedAccess = access?.map((u) => ({ ...u, grants: groupRoles(u.roles) }));

  const withRoles = sortedAccess?.filter((u) => u.grants.length > 0);
  const withoutRoles = sortedAccess?.filter((u) => u.grants.length === 0);

  const utils = api.useUtils();
  const { toast } = useToast();
  const revoke = api.user.revokeRoleFromUser.useMutation({
    onMutate: async (variables) => {
      await utils.user.getResolvedAccess.cancel();
      const previous = utils.user.getResolvedAccess.getData();
      utils.user.getResolvedAccess.setData(undefined, (old) =>
        old?.map((u) => ({ ...u, roles: u.roles.filter((r) => r.id !== variables.id) })),
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) utils.user.getResolvedAccess.setData(undefined, context.previous);
      toast({
        title: "Failed to remove role",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => void utils.user.getResolvedAccess.invalidate(),
  });

  return (
    <div className="flex flex-col gap-3">
      {isLoading && "Loading..."}
      {isSuccess && (
        <>
          <Table className="max-h-[600px] table-auto text-nowrap">
            <TableHeader>
              <TableRow>
                <TableHead className="w-1">User</TableHead>
                <TableHead>Roles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withRoles?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <UserWithCharacter
                      name={u.name ?? ""}
                      image={u.image ?? ""}
                      character={u.character}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.grants.map((g) =>
                        g.kind === "sync" ? (
                          <div
                            key={`sync-${g.roleId}`}
                            className={cn(
                              "flex items-center gap-1 border-solid",
                              ROLE_PILL_BASE_CLASSES,
                              roleColorClasses(g.roleName),
                            )}
                          >
                            {g.roleName}
                            <span className="flex items-center gap-1 normal-case tracking-normal opacity-60">
                              <DiscordIcon className="size-2.5" />
                              {g.discordRoleNames.join(", ")}
                            </span>
                          </div>
                        ) : g.kind === "env" ? (
                          <div
                            key={`env-${g.roleId}`}
                            className={cn(
                              "flex items-center gap-1 border-solid",
                              ROLE_PILL_BASE_CLASSES,
                              roleColorClasses(g.roleName),
                            )}
                            title="Granted via SUPERADMIN_DISCORD_IDS — not manageable here"
                          >
                            <Lock className="size-2.5" />
                            {g.roleName}
                          </div>
                        ) : (
                          <div
                            key={g.id}
                            className={cn(
                              "group flex items-center gap-1 border-dashed",
                              ROLE_PILL_BASE_CLASSES,
                              roleColorClasses(g.roleName),
                            )}
                          >
                            {g.roleName}
                            <span className="normal-case tracking-normal opacity-60">manual</span>
                            <button
                              onClick={() => revoke.mutate({ id: g.id })}
                              className="ml-1 opacity-60 hover:opacity-100"
                              aria-label={`Remove ${g.roleName}`}
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {withoutRoles && withoutRoles.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                Everyone else ({withoutRoles.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
                {withoutRoles.map((u) => (
                  <UserWithCharacter
                    key={u.id}
                    name={u.name ?? ""}
                    image={u.image ?? ""}
                    character={u.character}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}
    </div>
  );
}
