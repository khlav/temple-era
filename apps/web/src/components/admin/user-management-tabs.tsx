"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  ResolvedAccessTable,
  ResolvedAccessActions,
} from "~/components/admin/resolved-access-table";
import { RoleEditor, RoleEditorActions } from "~/components/admin/role-editor";
import { DiscordRoleBindings } from "~/components/admin/discord-role-bindings";
import { DiscordIcon } from "~/components/ui/discord-icon";

const TABS = ["access", "roles", "discord"] as const;
type Tab = (typeof TABS)[number];

export function UserManagementTabs() {
  const [tab, setTab] = React.useState<Tab>("access");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="access">User Permissions</TabsTrigger>
          <TabsTrigger value="roles">Roles & Scopes</TabsTrigger>
          <TabsTrigger value="discord" className="flex items-center gap-1.5">
            <DiscordIcon className="size-3.5" />
            Discord Sync
          </TabsTrigger>
        </TabsList>
        {tab === "access" && <ResolvedAccessActions />}
        {tab === "roles" && <RoleEditorActions />}
      </div>
      <TabsContent value="access" className="mt-4">
        <ResolvedAccessTable />
      </TabsContent>
      <TabsContent value="roles" className="mt-4">
        <RoleEditor />
      </TabsContent>
      <TabsContent value="discord" className="mt-4">
        <DiscordRoleBindings />
      </TabsContent>
    </Tabs>
  );
}
