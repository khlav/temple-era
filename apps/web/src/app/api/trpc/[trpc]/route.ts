import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";
import { logger } from "~/lib/logger";

import { env } from "~/env";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

/**
 * This handler used to gzip the response body itself and set `Content-Encoding: gzip`. Next 16.4.5
 * added `content-encoding` to the FORBIDDEN_HEADERS it strips from a Route Handler's Response
 * (`next/dist/server/send-response.js`) and does not decompress the body, so after the 16.4.6 bump
 * every browser received raw gzip bytes labelled `application/json`:
 * `TRPCClientError: Unexpected token '\x1f'`. Every client-side query on the site failed. Vercel
 * already compresses responses at the edge, so there is nothing to do here but return the response.
 */
const handler = async (req: NextRequest) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            logger.error(`❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`);
          }
        : undefined,
    responseMeta: () => ({
      headers: {
        Vary: "Accept-Encoding",
      },
    }),
  });
};

export { handler as GET, handler as POST };
