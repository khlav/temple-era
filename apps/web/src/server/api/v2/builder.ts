// src/server/api/v2/builder.ts
import SchemaBuilder from "@pothos/core";
import type { Context } from "./context";

export const builder = new SchemaBuilder<{
  Context: Context;
}>({});
