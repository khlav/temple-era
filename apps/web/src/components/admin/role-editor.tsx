"use client";

import * as React from "react";
import { api } from "~/trpc/react";
import { SCOPE, SCOPES, SUPERADMIN_ROLE_ID, type Scope } from "~/lib/scopes";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Lock, Plus, Trash2 } from "lucide-react";
import UserAvatar from "~/components/ui/user-avatar";
import { cn } from "~/lib/utils";
import { roleColorClasses, ROLE_PILL_BASE_CLASSES } from "~/lib/role-colors";

type RoleFormState = { id?: string; name: string; scopes: string[] };

// Record<Scope, string> forces this to stay exhaustive: adding, removing, or renaming a scope in
// ~/lib/scopes without updating this map is a compile error, not a silently missing description.
const SCOPE_DESCRIPTIONS: Record<Scope, string> = {
  [SCOPE.RAIDLOG_MANAGE]:
    "create/edit raids, import and refresh WCL raid logs, manage the raid bench.",
  [SCOPE.RAIDPLAN_MANAGE]:
    "manage raid plans, templates, roster and character assignments, Raid Helper signup matching.",
  [SCOPE.CHARACTER_MANAGE]:
    "link character families (primary/secondary) and update character records.",
  [SCOPE.USERPERMISSIONS_MANAGE]:
    "manage user permissions, roles, scopes, and Discord role sync bindings.",
  [SCOPE.SOFTRES_ACCESS]: "view and manage SoftRes scans.",
  [SCOPE.TEMPLAR_ACCESS]: "opt into the Templar Discord bot proxy.",
  [SCOPE.API_TOKEN_ACCESS]: "generate a personal API token.",
  [SCOPE.WORLDBUFF_MANAGE]:
    "mark world-buff turn-ins as dropped, and create/cancel scheduled assignments.",
};

function RoleFormDialog({
  role,
  onSaved,
  trigger,
}: {
  role?: RoleFormState;
  onSaved: () => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(role?.name ?? "");
  const [scopes, setScopes] = React.useState<Set<string>>(new Set(role?.scopes ?? []));

  const utils = api.useUtils();
  const createRole = api.user.createRole.useMutation({
    onSuccess: () => {
      void utils.user.listRoles.invalidate();
      onSaved();
      setOpen(false);
    },
  });
  const updateRole = api.user.updateRole.useMutation({
    onSuccess: () => {
      void utils.user.listRoles.invalidate();
      onSaved();
      setOpen(false);
    },
  });

  const toggleScope = (scope: string) => {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  const handleSave = () => {
    const scopeList = Array.from(scopes) as (typeof SCOPES)[number][];
    if (role?.id) {
      updateRole.mutate({ id: role.id, name, scopes: scopeList });
    } else {
      createRole.mutate({ name, scopes: scopeList });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{role?.id ? "Edit role" : "New role"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Loot Council"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Scopes</label>
            <div className="flex flex-col gap-2 rounded-md border p-3">
              {SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={scopes.has(scope)}
                    onCheckedChange={() => toggleScope(scope)}
                  />
                  <span className="font-mono">{scope}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={!name || createRole.isPending || updateRole.isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RoleEditorActions() {
  const utils = api.useUtils();
  return (
    <RoleFormDialog
      onSaved={() => void utils.user.listRoles.invalidate()}
      trigger={
        <Button size="sm" variant="outline">
          <Plus className="mr-1 size-4" /> New role
        </Button>
      }
    />
  );
}

export function RoleEditor() {
  const { data: rolesList, isLoading } = api.user.listRoles.useQuery();
  const { data: access } = api.user.getResolvedAccess.useQuery();
  const utils = api.useUtils();
  const deleteRole = api.user.deleteRole.useMutation({
    onSuccess: () => void utils.user.listRoles.invalidate(),
  });

  // One entry per person per role, even if they hold it via multiple grants (e.g. two Discord
  // bindings + a manual grant) — just a headcount here, manage/remove individual grants from
  // the Permissions tab instead.
  const holdersByRole = new Map<
    string,
    { id: string; name: string | null; image: string | null }[]
  >();
  for (const u of access ?? []) {
    const roleIds = new Set(u.roles.map((r) => r.roleId));
    for (const roleId of roleIds) {
      const existing = holdersByRole.get(roleId) ?? [];
      existing.push({ id: u.id, name: u.name, image: u.image });
      holdersByRole.set(roleId, existing);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {isLoading && "Loading..."}
      {rolesList && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1 text-nowrap">Name</TableHead>
              <TableHead className="w-48">Scopes</TableHead>
              <TableHead>Users</TableHead>
              <TableHead className="w-1" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rolesList.map((role) => (
              <TableRow key={role.id}>
                <TableCell className="text-nowrap font-medium">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 border-solid",
                      ROLE_PILL_BASE_CLASSES,
                      roleColorClasses(role.name),
                    )}
                  >
                    {role.isSystem && <Lock className="size-2.5" />}
                    {role.name}
                  </span>
                </TableCell>
                <TableCell className="w-48">
                  {/* Superadmin always holds every scope, so enumerating them is just noise. */}
                  {role.id === SUPERADMIN_ROLE_ID ? (
                    <span className="text-[10px] font-semibold text-muted-foreground italic">
                      All scopes
                    </span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {role.scopes.map((scope) => (
                        <span key={scope} className="font-mono text-[10px] text-muted-foreground">
                          {scope}
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-start gap-2">
                    <span className="w-4 shrink-0 text-sm font-medium text-muted-foreground">
                      {holdersByRole.get(role.id)?.length ?? 0}:
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {holdersByRole.get(role.id)?.map((holder) => (
                        <UserAvatar
                          key={holder.id}
                          name={holder.name ?? ""}
                          image={holder.image ?? ""}
                        />
                      ))}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="flex gap-1">
                  {!role.isSystem && (
                    <>
                      <RoleFormDialog
                        role={{ id: role.id, name: role.name, scopes: role.scopes }}
                        onSaved={() => void utils.user.listRoles.invalidate()}
                        trigger={
                          <Button size="sm" variant="ghost">
                            Edit
                          </Button>
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteRole.mutate({ id: role.id })}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Scope reference</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">Scope</TableHead>
              <TableHead>Grants</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SCOPES.map((scope) => (
              <TableRow key={scope}>
                <TableCell className="w-48">
                  <span className="font-mono text-[10px] text-muted-foreground">{scope}</span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {SCOPE_DESCRIPTIONS[scope]}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
