import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { wcl} from "~/server/api/routers/wcl";
import { raid } from "~/server/api/routers/raid";
import { character } from "~/server/api/routers/character";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  wcl: wcl,
  raid: raid,
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
