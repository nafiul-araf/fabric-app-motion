import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
    { ignores: ["dist", "node_modules"] },
    {
        extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
        files: ["**/*.{ts,tsx}"],
        languageOptions: { globals: globals.browser },
        plugins: { "react-hooks": reactHooks },
        rules: reactHooks.configs.recommended.rules,
    },
);
