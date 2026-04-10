import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const sharedRules = {
  "no-unused-vars": "off",
  "@typescript-eslint/no-unused-vars": "off",
};

export default defineConfig([
  {
    ignores: ["dist/**", "src-tauri/gen/**", "src-tauri/target/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    rules: sharedRules,
  },
  {
    files: ["vite.config.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: sharedRules,
  },
]);
