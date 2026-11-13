import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2025, sourceType: "module" },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    files: ["src/**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
  },
  {
    files: ["test/**/*.js", "e2e/**/*.js", "scripts/**/*.mjs", "*.js"],
    // End-to-end tests and the screenshot script also run code inside the extension's pages.
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.webextensions } },
  },
];
