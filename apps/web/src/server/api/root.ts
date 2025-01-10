import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { raid } from "~/server/api/routers/raid";
import { character } from "~/server/api/routers/character";
import { raidLog } from "~/server/api/routers/raidlog";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  raid: raid,
  raidLog: raidLog,
  character: character,
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
