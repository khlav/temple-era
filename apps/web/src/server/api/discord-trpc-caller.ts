import type { Session } from "next-auth";

import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import type { Scope } from "~/server/db/models/access-schema";

type DiscordRouteUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  isRaidManager: boolean | null;
  isAdmin: boolean | null;
  isSuperadmin?: boolean | null;
  characterId: number | null;
  // Required, not optional: the inner tRPC procedures are scopedProcedure-gated, so a session
  // built without scopes silently fails every mutation at runtime. Keeping this required makes
  // "forgot to spread resolveUserAccess()" a compile error instead of a broken Discord command.
  scopes: Scope[];
};

function buildSession(user: DiscordRouteUser): Session {
  return {
    user: {
      id: user.id,
      name: user.name ?? "",
      email: user.email ?? "",
      image: user.image ?? "",
      isRaidManager: user.isRaidManager ?? false,
      isAdmin: user.isAdmin ?? false,
      isSuperadmin: user.isSuperadmin ?? false,
      characterId: user.characterId ?? 0,
      scopes: user.scopes,
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function createDiscordRouteCaller(user: DiscordRouteUser) {
  const session = buildSession(user);

  return createCaller({
    db,
    headers: new Headers(),
    session,
    getSession: async () => session,
  });
}
