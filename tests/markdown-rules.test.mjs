import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { execa } from "execa";
import { lint } from "markdownlint/sync";

import boxDrawing from "../rules/no-box-drawing.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
/** @param {string} input - Markdown source. */
const violations = (input) =>
  lint({
    config: { default: false, "docs/no-box-drawing": true },
    customRules: [boxDrawing],
    strings: { input }
  }).input.map(({ lineNumber, errorRange, ruleNames }) => ({
    lineNumber,
    range: errorRange,
    ruleNames
  }));

await test("the diagram rule accepts ASCII markers and Unicode outside the box drawing block", () => {
  assert.deepEqual(violations("+-- parent\n| child\n\u24FF\u2580\n"), []);
});

await test("the diagram rule rejects every box drawing code point at its column", () => {
  for (let codePoint = 0x25_00; codePoint <= 0x25_7f; codePoint += 1) {
    assert.deepEqual(violations(`ok ${String.fromCodePoint(codePoint)}\n`), [
      {
        lineNumber: 1,
        range: [4, 1],
        ruleNames: ["docs/no-box-drawing"]
      }
    ]);
  }
});

await test("the diagram rule reports the first violation on each fenced code line", () => {
  assert.deepEqual(
    violations(
      "```text\n\u251C\u2500\u2500 child\n\u2514\u2500\u2500 child\n```\n"
    ),
    [
      {
        lineNumber: 2,
        range: [1, 1],
        ruleNames: ["docs/no-box-drawing"]
      },
      {
        lineNumber: 3,
        range: [1, 1],
        ruleNames: ["docs/no-box-drawing"]
      }
    ]
  );
});

await test("the diagram rule keeps the first UTF-16 column on CRLF lines", () => {
  assert.deepEqual(
    violations("\u{1F600}\t\u251C\u2500\r\nx\t\u2514\u2500\r\n"),
    [
      {
        lineNumber: 1,
        range: [4, 1],
        ruleNames: ["docs/no-box-drawing"]
      },
      {
        lineNumber: 2,
        range: [3, 1],
        ruleNames: ["docs/no-box-drawing"]
      }
    ]
  );
});

await test("the repository CLI configuration loads and enforces the diagram rule", async (t) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "codegraph-plugin-test-")
  );
  t.after(async () => {
    await rm(directory, { force: true, recursive: true });
  });
  const filename = path.join(directory, "diagram.md");
  await writeFile(filename, "# Diagram\n\n```text\n+-- child\n```\n");
  const args = [
    "--config",
    path.join(root, ".markdownlint-cli2.jsonc"),
    filename
  ];
  const validResult = await execa("markdownlint-cli2", args, {
    cwd: root,
    preferLocal: true
  });
  assert.equal(validResult.exitCode, 0);
  await writeFile(
    filename,
    "# Diagram\n\n```text\n\u2514\u2500\u2500 child\n```\n"
  );
  const result = await execa("markdownlint-cli2", args, {
    cwd: root,
    preferLocal: true,
    reject: false
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /docs\/no-box-drawing/u);
});
