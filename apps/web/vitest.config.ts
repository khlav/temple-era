import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    server: {
      deps: {
        // Pothos is externalized by default and `require`s graphql's CJS build, while our own
        // source gets the ESM build — two copies of graphql, so `instanceof`-based guards
        // (isObjectType, isEnumType, …) throw "from another module or realm" on a real schema.
        // Inlining it puts both on the same copy. Production bundles a single graphql, so this
        // is a test-runner concern only.
        inline: ["@pothos/core"],
      },
    },
  },
});
