import React from "react";
import {Separator} from "~/components/ui/separator";
import {CharacterManager} from "~/components/admin/character-manager";

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