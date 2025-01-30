import React from "react";
import {Separator} from "~/components/ui/separator";
import {UserRoleManager} from "~/components/admin/user-role-manager";

export default async function RoleManagerIndex() {
  return (
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">
        User Roles and Permissions
        <Separator className="my-2" />
      </div>
      <UserRoleManager />
    </main>
  );
}