"use client";

import * as React from "react";
import { PlusIcon, UserPlus } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { RoleSelect } from "~/components/admin/role-select";
import { ClassIcon } from "~/components/ui/class-icon";
import UserAvatar from "~/components/ui/user-avatar";
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";

export function DiscordMemberPicker() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const [selectedRoleId, setSelectedRoleId] = React.useState<string>("");

  // Already shared with ResolvedAccessTable's query cache — no extra request.
  const { data: access } = api.user.getResolvedAccess.useQuery();

  const utils = api.useUtils();
  const { toast } = useToast();
  const grant = api.user.grantRoleToUser.useMutation({
    onMutate: async (variables) => {
      await utils.user.getResolvedAccess.cancel();
      const previous = utils.user.getResolvedAccess.getData();
      const role = utils.user.listRoles.getData()?.find((r) => r.id === variables.roleId);
      const tempId = crypto.randomUUID();

      utils.user.getResolvedAccess.setData(undefined, (old) =>
        old?.map((u) => {
          if (u.id !== variables.userId || !role) return u;
          // Duplicates are allowed by design — the same role can be granted to a user more than
          // once (e.g. alongside an existing synced grant), so this always adds a new pill
          // rather than checking for an existing one.
          return {
            ...u,
            roles: [
              ...u.roles,
              {
                id: tempId,
                userId: u.id,
                roleId: role.id,
                roleName: role.name,
                source: "manual",
                sourceDiscordRoleName: null,
              },
            ],
          };
        }),
      );

      setPopoverOpen(false);
      setDialogOpen(false);
      setSelectedRoleId("");
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) utils.user.getResolvedAccess.setData(undefined, context.previous);
      toast({
        title: "Failed to grant role",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => void utils.user.getResolvedAccess.invalidate(),
  });

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="mr-1 size-4" /> Grant
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant access to a user</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Only accounts that have logged into the site can be granted a role here.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Role</label>
            <RoleSelect value={selectedRoleId} onValueChange={setSelectedRoleId} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">User</label>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen} modal={true}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedRoleId}
                  className="w-[220px]"
                >
                  <PlusIcon className="mr-1 size-4" /> Find user
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search by Discord or character name..."
                    className="h-9"
                    autoFocus
                  />
                  <CommandList>
                    <CommandEmpty>No matches.</CommandEmpty>
                    <CommandGroup>
                      {access?.map((u) => (
                        <CommandItem
                          key={u.id}
                          value={`${u.name ?? u.id} ${u.character?.name ?? ""}`}
                          onSelect={() => {
                            if (!selectedRoleId) return;
                            grant.mutate({ userId: u.id, roleId: selectedRoleId });
                          }}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <UserAvatar
                              name={u.name ?? ""}
                              image={u.image ?? ""}
                              showLabel={false}
                            />
                            {u.name}
                          </div>
                          {u.character && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {u.character.name}
                              <ClassIcon characterClass={u.character.class} px={14} />
                            </div>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
