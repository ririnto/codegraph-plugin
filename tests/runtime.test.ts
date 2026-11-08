import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, onTestFinished, test } from "vitest";
import { z } from "zod";

const npxCallSchema = z.object({
  argv: z.array(z.string()),
  cache: z.string().nullable(),
  cwd: z.string(),
  systemCa: z.string().nullable()
});
const hookSchema = z.object({
  async: z.boolean().optional(),
  command: z.string(),
  statusMessage: z.string().optional(),
  timeout: z.number().optional(),
  type: z.string()
});
const hookConfigSchema = z.object({
  hooks: z.record(
    z.string(),
    z.array(z.object({ hooks: z.array(hookSchema), matcher: z.string() }))
  )
});
const serverSchema = z.looseObject({
  args: z.array(z.string()),
  command: z.string(),
  type: z.string()
});
const manifestSchema = z.looseObject({
  $schema: z.string(),
  mcpServers: z.object({ codegraph: serverSchema }),
  name: z.string(),
  version: z.string()
});
const marketplaceSchema = z.looseObject({
  plugins: z.array(z.looseObject({ name: z.string(), source: z.unknown() }))
});
type HookDefinition = z.infer<typeof hookSchema>;
type HookHost = "claude" | "codex";

const pluginRoot = path.resolve(import.meta.dirname, "..");
const readJson = <T extends z.ZodType>(
  filename: string,
  schema: T
): z.infer<T> =>
  schema.parse(
    JSON.parse(readFileSync(path.join(pluginRoot, filename), "utf-8"))
  );

const fixtureEnvironment = (): NodeJS.ProcessEnv => {
  const localNames = new Set(
    execFileSync("git", ["rev-parse", "--local-env-vars"], {
      encoding: "utf-8"
    })
      .trim()
      .split("\n")
  );
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !localNames.has(name))
  );
};

const makeHarness = () => {
  const root = mkdtempSync(path.join(tmpdir(), "codegraph-plugin-test-"));
  onTestFinished(() => {
    rmSync(root, { force: true, recursive: true });
  });
  const binaryDirectory = path.join(root, "stub bin");
  mkdirSync(binaryDirectory, { recursive: true });
  const logPath = path.join(root, "npx calls.jsonl");
  const npxPath = path.join(binaryDirectory, "npx");
  const npxSource = [
    "#!/usr/bin/env node",
    'import { appendFileSync } from "node:fs";',
    "const argv = process.argv.slice(2);",
    'appendFileSync(process.env.CODEGRAPH_STUB_LOG, JSON.stringify({ argv, cache: process.env.npm_config_cache ?? null, cwd: process.cwd(), systemCa: process.env.NODE_USE_SYSTEM_CA ?? null }) + "\\n");',
    'process.exit(Number(process.env.CODEGRAPH_STUB_EXIT_INIT ?? "0"));'
  ].join("\n");
  writeFileSync(npxPath, npxSource, { mode: 0o755 });
  const env: NodeJS.ProcessEnv = {
    ...fixtureEnvironment(),
    CODEGRAPH_STUB_EXIT_INIT: "0",
    CODEGRAPH_STUB_LOG: logPath,
    PATH: binaryDirectory + path.delimiter + (process.env.PATH ?? ""),
    npm_config_cache: path.join(root, "caller npm cache")
  };
  return { env, logPath, npxPath, root };
};

const callsFrom = (logPath: string): z.infer<typeof npxCallSchema>[] =>
  existsSync(logPath)
    ? readFileSync(logPath, "utf-8")
        .trimEnd()
        .split("\n")
        .filter(Boolean)
        .map((line) => npxCallSchema.parse(JSON.parse(line)))
    : [];

const runGit = (cwd: string, args: string[]): void => {
  execFileSync("git", args, {
    cwd,
    env: fixtureEnvironment(),
    stdio: "ignore"
  });
};

const makeRepository = (root: string): void => {
  mkdirSync(root, { recursive: true });
  runGit(root, ["init", "--quiet"]);
  writeFileSync(path.join(root, "README.md"), "CodeGraph test fixture\n");
  runGit(root, [
    "-c",
    "user.name=CodeGraph Test",
    "-c",
    "user.email=codegraph-test@example.invalid",
    "add",
    "README.md"
  ]);
  runGit(root, [
    "-c",
    "user.name=CodeGraph Test",
    "-c",
    "user.email=codegraph-test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "initial"
  ]);
};

const expectPreparation = (hook: HookDefinition | undefined): void => {
  expect(hook).toMatchObject({
    async: true,
    statusMessage: "Initializing CodeGraph at Git checkout root",
    timeout: 3600,
    type: "command"
  });
};

const expectHookPair = (hooks: HookDefinition[]): void => {
  expect(hooks).toHaveLength(2);
  const exclude = hooks.find((hook) => hook.command.includes("git rev-parse"));
  const prepare = hooks.find((hook) => hook.command.includes("npx --yes"));
  expect(exclude).toMatchObject({
    async: true,
    statusMessage: "Configuring CodeGraph exclusion for Git checkout root",
    timeout: 3600,
    type: "command"
  });
  expectPreparation(prepare);
};

const excludePath = (cwd: string): string =>
  execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"],
    { cwd, encoding: "utf-8", env: fixtureEnvironment() }
  ).trim();

const readClaudeHooks = () => readJson("hooks/hooks.json", hookConfigSchema);

const readCodexHooks = () =>
  readJson("hooks/codex-hooks.json", hookConfigSchema);

const hookCommand = (
  host: HookHost,
  event: string,
  matcher: string,
  action: "exclude" | "prepare"
): string => {
  const config = host === "claude" ? readClaudeHooks() : readCodexHooks();
  const entry = config.hooks[event]?.find((hook) => hook.matcher === matcher);
  const command = entry?.hooks.find((hook) =>
    action === "exclude"
      ? hook.command.includes("git rev-parse")
      : hook.command.includes("npx --yes")
  )?.command;
  if (command === undefined || command === "") {
    throw new Error(`Missing ${host} ${action} hook for ${event} ${matcher}`);
  }
  return command;
};

const runHook = (
  host: HookHost,
  event: string,
  matcher: string,
  cwd: string,
  harness: ReturnType<typeof makeHarness>,
  action: "exclude" | "prepare" = "prepare",
  env = harness.env
) =>
  spawnSync("sh", ["-c", hookCommand(host, event, matcher, action)], {
    cwd,
    encoding: "utf-8",
    env
  });

test("Claude and Codex configs register startup preparation and direct MCP commands", () => {
  const claudeHooks = readClaudeHooks();
  expect(claudeHooks.hooks.SessionStart.map((entry) => entry.matcher)).toEqual([
    "startup"
  ]);
  expect(claudeHooks.hooks.PostToolUse.map((entry) => entry.matcher)).toEqual([
    "EnterWorktree"
  ]);
  for (const entry of claudeHooks.hooks.SessionStart) {
    expectHookPair(entry.hooks);
  }
  expect(claudeHooks.hooks.PostToolUse[0]?.hooks).toHaveLength(1);
  expectPreparation(claudeHooks.hooks.PostToolUse[0]?.hooks[0]);
  const claudeCatalog = readJson(
    ".claude-plugin/marketplace.json",
    marketplaceSchema
  );
  const catalogEntry = claudeCatalog.plugins.find(
    (entry) => entry.name === "codegraph-plugin"
  );
  const claudeManifest = readJson(".claude-plugin/plugin.json", manifestSchema);
  expect(catalogEntry).toBeDefined();
  expect(catalogEntry?.source).toBe("./");
  expect(claudeManifest.$schema).toBe(
    "https://json.schemastore.org/claude-code-plugin-manifest.json"
  );
  expect(claudeManifest.name).toBe(catalogEntry?.name);
  expect(claudeManifest.mcpServers.codegraph).toEqual({
    alwaysLoad: true,
    args: ["--yes", "@colbymchenry/codegraph", "serve", "--mcp"],
    command: "npx",
    env: { NODE_USE_SYSTEM_CA: "1" },
    type: "stdio"
  });
  const plugin = readJson(
    ".codex-plugin/plugin.json",
    z.looseObject({
      hooks: z.string(),
      mcpServers: z.string()
    })
  );
  expect(plugin.hooks).toBe("./hooks/codex-hooks.json");
  expect(plugin.mcpServers).toBe("./.codex-plugin/mcp.json");
  const codexHooks = readCodexHooks();
  expect(codexHooks.hooks.SessionStart.map((entry) => entry.matcher)).toEqual([
    "^startup$"
  ]);
  expectHookPair(codexHooks.hooks.SessionStart[0]?.hooks ?? []);
  const codexMcp = readJson(
    ".codex-plugin/mcp.json",
    z.looseObject({
      $schema: z.string(),
      mcpServers: z.object({ codegraph: serverSchema })
    })
  );
  expect(codexMcp.$schema).toBe(
    "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"
  );
  expect(codexMcp.mcpServers.codegraph).toEqual({
    args: ["--yes", "@colbymchenry/codegraph", "serve", "--mcp"],
    command: "npx",
    env: { NODE_USE_SYSTEM_CA: "1" },
    type: "stdio"
  });
});

test("configured handlers prepare at Git checkout root and preserve npm cache settings", () => {
  const harness = makeHarness();
  const repository = path.join(harness.root, "consumer repository with spaces");
  makeRepository(repository);
  const nestedCwd = path.join(repository, "nested workspace", "service");
  mkdirSync(nestedCwd, { recursive: true });
  const configuredEvents: [
    HookHost,
    string,
    string,
    ("exclude" | "prepare")[]
  ][] = [
    ["claude", "SessionStart", "startup", ["exclude", "prepare"]],
    ["claude", "PostToolUse", "EnterWorktree", ["prepare"]],
    ["codex", "SessionStart", "^startup$", ["exclude", "prepare"]]
  ];
  for (const [host, event, matcher, actions] of configuredEvents) {
    for (const action of actions) {
      expect(
        runHook(host, event, matcher, nestedCwd, harness, action).status
      ).toBe(0);
    }
  }
  const calls = callsFrom(harness.logPath);
  expect(calls).toHaveLength(3);
  expect(calls.map((call) => call.systemCa)).toEqual(["1", "1", "1"]);
  expect(calls.map((call) => call.cwd)).toEqual(
    Array.from({ length: 3 }, () => realpathSync(repository))
  );
  expect(calls.map((call) => call.argv)).toEqual([
    ["--yes", "@colbymchenry/codegraph", "init", "--yes"],
    ["--yes", "@colbymchenry/codegraph", "init", "--yes"],
    ["--yes", "@colbymchenry/codegraph", "init", "--yes"]
  ]);
  expect(readFileSync(excludePath(nestedCwd), "utf-8")).toContain(
    ".codegraph\n"
  );
});

test("primary checkout exclusion is literal, idempotent, and preserves missing final newline", () => {
  const harness = makeHarness();
  const repository = path.join(harness.root, "primary checkout");
  makeRepository(repository);
  const nestedCwd = path.join(repository, "packages", "service");
  mkdirSync(nestedCwd, { recursive: true });
  const exclude = excludePath(nestedCwd);
  mkdirSync(path.dirname(exclude), { recursive: true });
  const existing = "# local exclusions\n*.cache";
  writeFileSync(exclude, existing);
  expect(
    runHook("claude", "SessionStart", "startup", nestedCwd, harness, "exclude")
      .status
  ).toBe(0);
  expect(readFileSync(exclude, "utf-8")).toBe(`${existing}\n.codegraph\n`);
  expect(
    runHook("claude", "SessionStart", "startup", nestedCwd, harness, "exclude")
      .status
  ).toBe(0);
  expect(readFileSync(exclude, "utf-8")).toBe(`${existing}\n.codegraph\n`);
  expect(callsFrom(harness.logPath)).toEqual([]);
  const crlf = "# local exclusions\r\n.codegraph\r\n";
  writeFileSync(exclude, crlf);
  expect(
    runHook("claude", "SessionStart", "startup", nestedCwd, harness, "exclude")
      .status
  ).toBe(0);
  expect(readFileSync(exclude, "utf-8")).toBe(crlf);
});

test("primary checkout creates a missing Git exclude file", () => {
  const harness = makeHarness();
  const repository = path.join(harness.root, "primary checkout");
  makeRepository(repository);
  const nestedCwd = path.join(repository, "nested");
  mkdirSync(nestedCwd);
  const exclude = excludePath(nestedCwd);
  rmSync(exclude, { force: true });
  expect(
    runHook("claude", "SessionStart", "startup", nestedCwd, harness, "exclude")
      .status
  ).toBe(0);
  expect(readFileSync(exclude, "utf-8")).toBe("\n.codegraph\n");
});

test("linked worktree updates its shared exclude idempotently and prepares on enter", () => {
  const harness = makeHarness();
  const primary = path.join(harness.root, "primary");
  makeRepository(primary);
  const primaryExclude = excludePath(primary);
  const original = "# keep local rules\n";
  writeFileSync(primaryExclude, original);
  const linked = path.join(harness.root, "linked worktree");
  runGit(primary, ["worktree", "add", "--quiet", "--detach", linked, "HEAD"]);
  expect(
    runHook("claude", "SessionStart", "startup", linked, harness, "exclude")
      .status
  ).toBe(0);
  expect(readFileSync(primaryExclude, "utf-8")).toBe(
    `${original}\n.codegraph\n`
  );
  expect(
    runHook("claude", "SessionStart", "startup", linked, harness, "exclude")
      .status
  ).toBe(0);
  expect(readFileSync(primaryExclude, "utf-8")).toBe(
    `${original}\n.codegraph\n`
  );
  expect(
    runHook(
      "claude",
      "PostToolUse",
      "EnterWorktree",
      linked,
      harness,
      "prepare"
    ).status
  ).toBe(0);
  expect(callsFrom(harness.logPath).map((call) => call.argv)).toEqual([
    ["--yes", "@colbymchenry/codegraph", "init", "--yes"]
  ]);
  expect(callsFrom(harness.logPath).map((call) => call.cwd)).toEqual([
    realpathSync(linked)
  ]);
});

test("bare repository uses Git's exclude path and non-Git handlers fail independently", () => {
  const harness = makeHarness();
  const bare = path.join(harness.root, "bare repository");
  mkdirSync(bare);
  runGit(bare, ["init", "--bare", "--quiet"]);
  const bareExclude = excludePath(bare);
  expect(
    runHook("claude", "SessionStart", "startup", bare, harness, "exclude")
      .status
  ).toBe(0);
  const bareExclusions = readFileSync(bareExclude, "utf-8")
    .split(/\r?\n/u)
    .filter((line) => line === ".codegraph");
  expect(bareExclusions).toHaveLength(1);
  expect(
    runHook("claude", "SessionStart", "startup", bare, harness, "prepare")
      .status
  ).toBe(0);
  const nonGit = path.join(harness.root, "not a repository");
  mkdirSync(nonGit);
  expect(
    runHook("claude", "SessionStart", "startup", nonGit, harness, "exclude")
      .status
  ).not.toBe(0);
  expect(
    runHook("claude", "SessionStart", "startup", nonGit, harness, "prepare")
      .status
  ).toBe(0);
  expect(callsFrom(harness.logPath).map((call) => call.cwd)).toEqual([
    realpathSync(bare),
    realpathSync(nonGit)
  ]);
  expect(callsFrom(harness.logPath).map((call) => call.argv)).toEqual([
    ["--yes", "@colbymchenry/codegraph", "init", "--yes"],
    ["--yes", "@colbymchenry/codegraph", "init", "--yes"]
  ]);
});

test("missing Git exclusion fails independently from preparation", () => {
  const harness = makeHarness();
  const repository = path.join(harness.root, "repository");
  makeRepository(repository);
  const exclude = excludePath(repository);
  const original = "# keep local rules\n";
  writeFileSync(exclude, original);
  const minimalPath = path.join(harness.root, "path without git");
  mkdirSync(minimalPath);
  symlinkSync(
    existsSync("/bin/sh") ? "/bin/sh" : "/usr/bin/sh",
    path.join(minimalPath, "sh")
  );
  symlinkSync(process.execPath, path.join(minimalPath, "node"));
  symlinkSync(harness.npxPath, path.join(minimalPath, "npx"));
  const result = runHook(
    "claude",
    "SessionStart",
    "startup",
    repository,
    harness,
    "exclude",
    { ...harness.env, PATH: minimalPath }
  );
  expect(result.status).not.toBe(0);
  expect(
    runHook(
      "claude",
      "SessionStart",
      "startup",
      repository,
      harness,
      "prepare",
      { ...harness.env, PATH: minimalPath }
    ).status
  ).toBe(0);
  expect(readFileSync(exclude, "utf-8")).toBe(original);
  expect(callsFrom(harness.logPath).map((call) => call.argv)).toEqual([
    ["--yes", "@colbymchenry/codegraph", "init", "--yes"]
  ]);
});

test("preparation preserves the caller-supplied npm cache setting", () => {
  const harness = makeHarness();
  const repository = path.join(harness.root, "repository");
  makeRepository(repository);
  const cwd = path.join(repository, "nested");
  mkdirSync(cwd);
  expect(
    runHook("claude", "SessionStart", "startup", cwd, harness).status
  ).toBe(0);
  expect(callsFrom(harness.logPath).map((call) => call.cache)).toEqual([
    harness.env.npm_config_cache
  ]);
  expect(callsFrom(harness.logPath).map((call) => call.cwd)).toEqual([
    realpathSync(repository)
  ]);
});

test("init-only preparation preserves the init failure exit status", () => {
  const harness = makeHarness();
  const cwd = path.join(harness.root, "repository");
  makeRepository(cwd);
  const nestedCwd = path.join(cwd, "nested");
  mkdirSync(nestedCwd);
  harness.env.CODEGRAPH_STUB_EXIT_INIT = "19";
  expect(
    runHook("claude", "SessionStart", "startup", nestedCwd, harness).status
  ).toBe(19);
  expect(callsFrom(harness.logPath).map((call) => call.argv)).toEqual([
    ["--yes", "@colbymchenry/codegraph", "init", "--yes"]
  ]);
});
