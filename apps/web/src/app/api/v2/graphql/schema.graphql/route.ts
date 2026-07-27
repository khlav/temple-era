import { printSchema } from "graphql";
import { schema } from "~/server/api/v2/schema";

export function GET() {
  return new Response(printSchema(schema), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
