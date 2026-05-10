// src/app/api/v2/graphql/route.ts
import { createYoga } from "graphql-yoga";
import { schema } from "~/server/api/v2/schema";
import { buildContext } from "~/server/api/v2/context";

const yoga = createYoga({
  schema,
  context: buildContext,
  graphqlEndpoint: "/api/v2/graphql",
  graphiql: process.env.NODE_ENV === "development",
  fetchAPI: { Response },
});

// Wrap yoga instance for Next.js 15 App Router
async function handler(request: Request): Promise<Response> {
  return yoga(request);
}

export { handler as GET, handler as POST };
