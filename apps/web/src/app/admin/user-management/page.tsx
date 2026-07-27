import React from "react";
import { type Metadata } from "next";
import { UserManagementTabs } from "~/components/admin/user-management-tabs";
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
      <UserManagementTabs />
    </main>
  );
}
