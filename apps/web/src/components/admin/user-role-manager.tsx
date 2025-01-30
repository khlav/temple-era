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
import {Loader} from "lucide-react";

export const UserRoleManagerRow = ({
  user,
}: {
  user: {
    id: string;
    name?: string | null;
    image?: string | null;
    isAdmin?: boolean | null;
  }
}) => {
  const [isAdmin, setIsAdmin] = useState(user.isAdmin ?? false);
  const [isSending, setIsSending] = useState(false);

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
      setIsAdmin(result[0]?.isAdmin ?? false)

    },
  });

  const handleToggle = () => {
    setIsSending(true);
    updateUserRole.mutate({ id: user.id, isAdmin: !user.isAdmin })
  }

  return (
    <TableRow key={user.id} className="group">
      <TableCell>
        <UserAvatar name={user.name ?? ""} image={user.image ?? ""} />
      </TableCell>
      <TableCell className="text-muted-foreground flex flex-row gap-1">
        <Switch
          id={`user_${user.id}`}
          checked={isAdmin ?? false}
          onCheckedChange={handleToggle}
          disabled={isSending}
          className="grow-0"
        />
        <Loader className={"grow-0 transition-all  animate-spin " + (isSending ? "opacity-100" : "opacity-0" )} />
      </TableCell>
    </TableRow>
  );
};

export const UserRoleManager = () => {
  const { data: users, isLoading, isSuccess } = api.user.getUsers.useQuery();

  return (
    <>
      {isLoading && "Loading..."}
      {isSuccess && (
          <>
            <Table className="max-h-[400px] grow-0">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/4">
                    Users {users && `(${users.length})`}
                  </TableHead>
                  <TableHead className="w-3/4">Is Admin?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users
                  ? users?.map((u) => (
                    <UserRoleManagerRow user={u} key={u.id}/>
                    ))
                  : null}
              </TableBody>
            </Table>
          </>
      )}
    </>
  );
};
