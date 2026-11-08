# CodeGraph MCP repository instructions

These instructions govern contributors and are not injected into consumer sessions.
Keep the plugin a thin exposure of the upstream CodeGraph MCP server.
Use [README.md](README.md) for installation and runtime contracts.
Use [CONTRIBUTING.md](CONTRIBUTING.md) for contribution procedures and verification evidence.

## Organize repository resources

Keep the host manifests in `.claude-plugin/` and `.codex-plugin/`.
Keep the self-marketplace catalogs in `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`.
Keep release gates in `release/`, disposable fixtures in `tests/`, lint rules in `rules/`, and GitHub automation in `.github/`.
Do not introduce generic top-level `scripts/`, `tools/`, or `bin/` directories.
Update consumers and remove superseded paths together.
Add abstractions only for a requirement or another real caller.

## Keep the plugin thin

Do not vendor, fork, or reimplement the upstream CodeGraph implementation.
Do not add a server, proxy, wrapper, cache, or execution engine around the upstream MCP server.
Change the server invocation only for a concrete upstream or host requirement.
Keep the Claude Code and Codex server entries equivalent.
Keep both host plugin versions identical and in `yyyy.mm.dd.seq` format.

## Manage dependencies and tools

Use pnpm catalogs with `^x.y.z` ranges for package dependencies.
Do not use version-plus-hash dependency pins.
Keep `.markdownlint-cli2.jsonc` on `gitignore: true`, compact table columns, and sorted object keys.
Use Ultracite as the only direct caller of Oxlint and Oxfmt.
Scripts, hooks, workflows, documentation, and validation commands invoke Ultracite rather than calling `oxlint` or `oxfmt` directly.
Do not suppress, disable, or reconfigure lint rules.

## Verify changes

Run `pnpm run check` before opening a pull request.
State the executed checks and their results in the pull request.
Report host installation and live CodeGraph behavior that was not executed as unrun.

## Task loading

Load only guidance relevant to the current role and action.
Reuse instructions already read completely in the same unit.

| Action | Read before acting |
| --- | --- |
| Change the server invocation or host manifests. | [README.md](README.md) |
| Edit documents and contribution materials. | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Publish and integrate. | [CONTRIBUTING.md](CONTRIBUTING.md) |
