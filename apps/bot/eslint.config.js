import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";

const config = [
  // Ignore patterns
  {
    ignores: ["node_modules/", "dist/", "*.config.js", "eslint.config.js"],
  },
  // Configuration for eslint.config.js itself - no type checking rules
  {
    files: ["eslint.config.js"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": typescriptEslint,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  // Main configuration for all other files
  {
    files: ["**/*.{js,ts}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: true,
      },
    },
    plugins: {
      "@typescript-eslint": typescriptEslint,
    },
    rules: {
      // TypeScript recommended rules (manually configured)
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
    },
  },
];

export default config;
