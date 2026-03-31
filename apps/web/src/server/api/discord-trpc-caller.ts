import type { Session } from "next-auth";

import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";

type DiscordRouteUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  isRaidManager: boolean | null;
  isAdmin: boolean | null;
  characterId: number | null;
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
      characterId: user.characterId ?? 0,
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
