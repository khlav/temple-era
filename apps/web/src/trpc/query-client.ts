import { defaultShouldDehydrateQuery, QueryClient } from "@tanstack/react-query";
import SuperJSON from "superjson";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Data counts as fresh for 5 minutes, and coming back to the tab doesn't refetch it.
        // With the old defaults (5s, refetch on focus) every query on the open page re-ran on each
        // alt-tab, which raiders do constantly — a steady share of DB egress (TEMPLE-151).
        // Mutations still invalidate what they change, and navigating to a page whose data is
        // older than 5 minutes still refetches it. A query that must stay live opts back in with
        // its own refetchOnWindowFocus / refetchInterval (e.g. raidPlan.getVersion).
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
