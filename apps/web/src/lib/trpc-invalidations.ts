import type { api } from "~/trpc/react";

type Utils = ReturnType<typeof api.useUtils>;

export async function invalidateRaidSummaryQueries(utils: Utils) {
  await Promise.all([
    utils.raid.getRaids.invalidate(),
    utils.dashboard.getTrackedRaidsL6LockoutWk.invalidate(),
    utils.dashboard.getTrackedRaidsCurrentLockout.invalidate(),
    utils.dashboard.getAllRaidsCurrentLockout.invalidate(),
  ]);
}

export async function invalidateCharacterManagementQueries(utils: Utils) {
  await Promise.all([
    utils.character.getCharacters.invalidate(),
    utils.character.getCharactersWithSecondaries.invalidate(),
  ]);
}
