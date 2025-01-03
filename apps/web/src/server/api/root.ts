import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { wclRouter} from "~/server/api/routers/wcl-router";
import { raidRouter } from "~/server/api/routers/raid-router";
import { characterRouter } from "~/server/api/routers/character-router";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  wcl: wclRouter,
  raid: raidRouter,
  character: characterRouter,
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
