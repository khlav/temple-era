"use client";

import * as React from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { RoleSelect } from "~/components/admin/role-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Trash2 } from "lucide-react";

// Matches guild roles auto-named after a month/year (e.g. Discord subscription/booster roles
// like "January 2024" or "Jan 2024") so they don't clutter the app-role binding dropdown.
const MONTH_YEAR_PATTERN =
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b.*\b(19|20)\d{2}\b/i;

export function DiscordRoleBindings() {
  const { data: guildRolesRaw, isLoading: guildRolesLoading } = api.user.listGuildRoles.useQuery();
  const { data: bindings, isLoading: bindingsLoading } = api.user.listBindings.useQuery();

  const guildRoles = guildRolesRaw
    ?.filter((r) => !MONTH_YEAR_PATTERN.test(r.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  // slice() first: `bindings` is the react-query cache object, so sorting in place would mutate it.
  const sortedBindings = bindings
    ?.slice()
    .sort(
      (a, b) =>
        a.discordRoleName.localeCompare(b.discordRoleName) ||
        a.appRoleName.localeCompare(b.appRoleName),
    );

  const [selectedGuildRoleId, setSelectedGuildRoleId] = React.useState<string>("");
  const [selectedAppRoleId, setSelectedAppRoleId] = React.useState<string>("");

  const utils = api.useUtils();
  const sync = api.user.triggerDiscordSync.useMutation({
    onSuccess: () => {
      void utils.user.getResolvedAccess.invalidate();
      void utils.user.getSyncState.invalidate();
    },
  });
  const upsertBinding = api.user.upsertBinding.useMutation({
    onSuccess: () => {
      void utils.user.listBindings.invalidate();
      setSelectedGuildRoleId("");
      setSelectedAppRoleId("");
      // A newly-mapped binding should apply immediately, not wait for the next manual/scheduled sync.
      sync.mutate();
    },
  });
  const deleteBinding = api.user.deleteBinding.useMutation({
    onSuccess: () => void utils.user.listBindings.invalidate(),
  });

  const handleAdd = () => {
    const guildRole = guildRoles?.find((r) => r.id === selectedGuildRoleId);
    if (!guildRole || !selectedAppRoleId) return;
    upsertBinding.mutate({
      discordRoleId: guildRole.id,
      discordRoleName: guildRole.name,
      appRoleId: selectedAppRoleId,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Map a Discord guild role to an app role. Members holding that Discord role are automatically
        granted the mapped app role whenever a sync runs.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Discord role</label>
          <Select value={selectedGuildRoleId} onValueChange={setSelectedGuildRoleId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue
                placeholder={guildRolesLoading ? "Loading..." : "Select a Discord role"}
              />
            </SelectTrigger>
            <SelectContent>
              {guildRoles?.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">App role</label>
          <RoleSelect
            value={selectedAppRoleId}
            onValueChange={setSelectedAppRoleId}
            placeholder="Select an app role"
          />
        </div>
        <Button
          onClick={handleAdd}
          disabled={!selectedGuildRoleId || !selectedAppRoleId || upsertBinding.isPending}
        >
          Add binding
        </Button>
      </div>

      {bindingsLoading && "Loading bindings..."}
      {sortedBindings && sortedBindings.length > 0 && (
        <Table className="w-full md:w-1/2">
          <TableHeader>
            <TableRow>
              <TableHead>Discord role</TableHead>
              <TableHead>App role</TableHead>
              <TableHead className="w-1" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedBindings.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{b.discordRoleName}</TableCell>
                <TableCell>{b.appRoleName}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteBinding.mutate({ id: b.id })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
