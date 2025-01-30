"use client";

import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import { api } from "~/trpc/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import React, { useState } from "react";
import { Switch } from "~/components/ui/switch";
import UserAvatar from "~/components/ui/user-avatar";
import { Loader } from "lucide-react";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import { TooltipContent } from "@radix-ui/react-tooltip";

const UserAccessManagerRow = ({
  user,
}: {
  user: {
    id: string;
    name?: string | null;
    image?: string | null;
    isRaidManager?: boolean | null;
    isAdmin?: boolean | null;
  };
}) => {
  const [isRaidManager, setIsRaidManager] = useState<boolean>(
    user.isRaidManager ?? false,
  );
  const [isAdmin, setIsAdmin] = useState<boolean>(user.isAdmin ?? false);
  const [isSending, setIsSending] = useState<boolean>(false);

  const utils = api.useUtils();

  const updateUserRole = api.user.updateUserRole.useMutation({
    onError: (error) => {
      alert(error.message);
      setIsSending(false);
    },
    onSuccess: async (result) => {
      await utils.invalidate(undefined, { refetchType: "all" });
      // toastCharacterSaved(toast, character, localSecondaryCharacters);
      setIsSending(false);
      setIsRaidManager(result[0]?.isRaidManager ?? false);
      setIsAdmin(result[0]?.isAdmin ?? false);
    },
  });

  const handleRaidManagerToggle = (newRaidManagerValue: boolean) => {
    setIsSending(true);
    updateUserRole.mutate({
      id: user.id,
      isRaidManager: newRaidManagerValue,
      isAdmin: isAdmin,
    });
  };

  const handleAdminToggle = (newAdminValue: boolean) => {
    setIsSending(true);
    updateUserRole.mutate({
      id: user.id,
      isRaidManager: isRaidManager,
      isAdmin: newAdminValue,
    });
  };

  return (
    <TableRow key={user.id} className="group">
      <TableCell>
        <div className="flex flex-row gap-1">
          <UserAvatar name={user.name ?? ""} image={user.image ?? ""} />
          <Loader
            className={
              "grow-0 animate-spin text-muted-foreground transition-all " +
              (isSending ? "opacity-100" : "opacity-0")
            }
          />
        </div>
      </TableCell>
      <TableCell>
        <Switch
          id={`user__raid_manager__${user.id}`}
          checked={isRaidManager ?? false}
          onCheckedChange={handleRaidManagerToggle}
          disabled={isSending}
          className="grow-0"
        />
      </TableCell>
      <TableCell className="flex flex-row gap-1">
        <Switch
          id={`user__admin__${user.id}`}
          checked={isAdmin ?? false}
          onCheckedChange={handleAdminToggle}
          disabled={isSending}
          className="grow-0"
        />
      </TableCell>
    </TableRow>
  );
};

export const UserAccessManager = () => {
  const { data: users, isLoading, isSuccess } = api.user.getUsers.useQuery();

  return (
    <>
      {isLoading && "Loading..."}
      {isSuccess && (
        <>
          <Table className="max-h-[400px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/4">
                  Users {users && `(${users.length})`}
                </TableHead>
                <TableHead className="w-1/4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>Raid Manager</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={3}>
                      <ul className="mb-0.5 ml-2 rounded-lg bg-muted px-3 py-1 text-sm text-muted-foreground shadow transition-all">
                        <li>- Create, edit, and delete raids</li>
                        <li>- Modify mains + alts</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="w-1/2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>Admin</span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <ul className="mb-0.5 ml-2 rounded-lg bg-muted px-3 py-1 text-sm text-muted-foreground shadow transition-all">
                        <li>- Change user permissions</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users
                ? users?.map((u) => (
                    <UserAccessManagerRow user={u} key={u.id} />
                  ))
                : null}
            </TableBody>
          </Table>
        </>
      )}
    </>
  );
};
