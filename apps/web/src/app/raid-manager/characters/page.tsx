import React from "react";
import { type Metadata } from "next";
import { Separator } from "~/components/ui/separator";
import { CharacterManager } from "~/components/raid-manager/character-manager";
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Character Manager",
    description: "Manage main and alt links for Temple raiding characters.",
    path: "/raid-manager/characters",
    noIndex: true,
  }),
};

export default async function CharacterManagerIndex() {
  return (
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">
        Character Manager
        <Separator className="my-2" />
      </div>
      <CharacterManager />
    </main>
  );
}
