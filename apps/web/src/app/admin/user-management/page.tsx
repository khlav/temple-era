import React from "react";
import { type Metadata } from "next";
import { Separator } from "~/components/ui/separator";
import { UserAccessManager } from "~/components/admin/user-access-manager";
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "User Management",
    description: "Manage Temple user access, permissions, and roles.",
    path: "/admin/user-management",
    noIndex: true,
  }),
};

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
