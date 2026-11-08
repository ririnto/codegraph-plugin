import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { load as yamlParser } from "js-yaml";
import { z } from "zod";

const root = fileURLToPath(new URL("../", import.meta.url));
const marketplaceSchema = z.looseObject({
  name: z.string(),
  plugins: z.array(z.looseObject({ name: z.string(), source: z.unknown() }))
});
/**
 * @template {z.ZodType} S
 * @param {string} filename - JSON file.
 * @param {S} schema - Expected file shape.
 * @returns {Promise<z.infer<S>>} Parsed JSON data.
 */
const readJson = async (filename, schema) => {
  /** @type {unknown} */
  const value = JSON.parse(await readFile(path.join(root, filename), "utf-8"));
  return schema.parse(value);
};

await test("the self-marketplace catalogs publish the plugin from the repository root", async () => {
  const claude = await readJson(
    ".claude-plugin/marketplace.json",
    marketplaceSchema
  );
  const codex = await readJson(
    ".agents/plugins/marketplace.json",
    marketplaceSchema
  );
  assert.equal(claude.name, "codegraph-plugin");
  assert.equal(codex.name, claude.name);
  assert.deepEqual(
    claude.plugins.map(({ name, source }) => [name, source]),
    [["codegraph-plugin", "./"]]
  );
  assert.deepEqual(
    codex.plugins.map(({ name, source }) => [name, source]),
    [["codegraph-plugin", { path: "./", source: "local" }]]
  );
});

await test("the workspace catalog declares the husky dependency the hooks call", async () => {
  const workspace = z
    .looseObject({ catalog: z.looseObject({ husky: z.string() }) })
    .parse(
      yamlParser(
        await readFile(path.join(root, "pnpm-workspace.yaml"), "utf-8")
      )
    );
  const packageJson = await readJson(
    "package.json",
    z.looseObject({
      devDependencies: z.looseObject({ husky: z.string() }),
      scripts: z.looseObject({ prepare: z.string() })
    })
  );
  assert.equal(packageJson.devDependencies.husky, "catalog:");
  assert.equal(packageJson.scripts.prepare, "husky");
  assert.match(workspace.catalog.husky, /^\^\d+\.\d+\.\d+$/u);
});
