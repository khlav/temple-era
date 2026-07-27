"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import { SUPERADMIN_ROLE_ID } from "~/lib/scopes";

export function RoleSelect({
  value,
  onValueChange,
  placeholder = "Select a role",
  className = "w-[220px]",
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { data: roles } = api.user.listRoles.useQuery();

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {/* Superadmin is granted only via SUPERADMIN_DISCORD_IDS, so it is never assignable here. */}
        {roles
          ?.filter((r) => r.id !== SUPERADMIN_ROLE_ID)
          .map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
