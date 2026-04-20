// Flat ESLint config for the frontend.
//
// Scope: keep the rule set small but high-signal — the goal is to catch the
// two failure modes that bite React + TypeScript apps the hardest:
//
//   1. Stale-closure / missing-deps bugs in hooks  (react-hooks)
//   2. Inaccessible markup that breaks screen readers and keyboard users
//      (jsx-a11y)
//
// We deliberately do NOT enable stylistic rules — Prettier-style formatting
// is the bundler/IDE's job, not ESLint's. Anything that's purely cosmetic
// goes in the formatter, not here.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    rules: {
      "no-console": "off",
    },
  },
);
