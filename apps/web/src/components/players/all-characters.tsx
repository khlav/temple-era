"use client";
import { api } from "~/trpc/react";
import { CharactersTable } from "~/components/players/characters-table";

export function AllCharacters() {
  const {
    data: players,
    isLoading,
  } = api.character.getCharacters.useQuery();

  return (
    <>
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div >
          <CharactersTable characters={players} />
        </div>
      )}
    </>
  );
}
