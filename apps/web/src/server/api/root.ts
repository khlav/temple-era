import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { raid } from "~/server/api/routers/raid";
import { raidLog } from "~/server/api/routers/raidlog";
import { character } from "~/server/api/routers/character";
import { recipe } from "~/server/api/routers/recipe";
import { dashboard } from "~/server/api/routers/dashboard";
import { profile } from "~/server/api/routers/profile";
import { user } from "~/server/api/routers/user";
import { searchRouter } from "~/server/api/routers/search";
import { discordRouter } from "~/server/api/routers/discord";
import { reports } from "~/server/api/routers/reports";
import { softres } from "~/server/api/routers/softres";
import { raidHelperRouter } from "~/server/api/routers/raid-helper";
import { raidPlanRouter } from "~/server/api/routers/raid-plan";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  raid: raid,
  raidLog: raidLog,
  character: character,
  recipe: recipe,
  dashboard: dashboard,
  profile: profile,
  user: user,
  search: searchRouter,
  discord: discordRouter,
  reports: reports,
  softres: softres,
  raidHelper: raidHelperRouter,
  raidPlan: raidPlanRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
