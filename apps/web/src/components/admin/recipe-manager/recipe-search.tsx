"use client";

import React, { useState } from "react";
import { api } from "~/trpc/react";
import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Loader } from "lucide-react";

export const RecipeSearch = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [query, setQuery] = useState("");
  const { data, isFetching } = api.recipe.getRecipeSearchResults.useQuery(
    query,
    {
      enabled: !!query, // Prevents fetching on mount
    },
  );

  const handleSearch = () => {
    setQuery(searchTerm);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Input and Button */}
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Enter search term..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isFetching}
          className="grow rounded border p-2"
        />
        <Button onClick={handleSearch} disabled={isFetching} className="w-[100px]">
          {isFetching ? <Loader className="animate-spin" /> : "Search"}
        </Button>
      </div>

      {data && !isFetching && (
        <>
          {/* Search Results */}
          {data?.results?.length ? (
            <div className="space-y-2">
              {data.results.map((craftable) => (
                <div key={craftable.data.id}>{craftable.data.name.en_US}</div>
              ))}
            </div>
          ) : (
            query && !isFetching && <p>No results found.</p>
          )}

          {/* JSON Output */}
          <LabeledArrayCodeBlock
            label="CraftableSearch"
            value={JSON.stringify(data, null, 2)}
            className="max-h-[400px] max-w-xl overflow-auto"
          />
        </>
      )}
    </div>
  );
};
