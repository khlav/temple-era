import React from "react";
import { Separator } from "~/components/ui/separator";
import { UserAccessManager } from "~/components/admin/user-access-manager";

export default async function RoleManagerIndex() {
  return (
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">
        User Roles and Permissions
      </div>
      <Separator className="my-2" />
      <UserAccessManager />
    </main>
  );
}
