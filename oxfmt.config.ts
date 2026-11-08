import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

/**
 * Extends the shared ultracite Oxfmt configuration with Markdown exclusion
 * and a trailing-comma ban.
 */
export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), "**/*.md"],
  trailingComma: "none"
});
