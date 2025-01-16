import React from "react";
import {auth} from "~/server/auth";
import {Separator} from "~/components/ui/separator";

export default async function CharacterManagerIndex() {
  return (
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">
        Character Manager
        <Separator className="my-2" />
      </div>
      In progress... (UI for mapping mains and alts).
    </main>
  );
}