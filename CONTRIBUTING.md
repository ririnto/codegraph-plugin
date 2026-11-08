# Contributing

Open an issue before changing behavior.
Keep each pull request a single coherent change.

## Reproducing document validation

```sh
pnpm install --frozen-lockfile
pnpm run check
```

`pnpm run check` runs the manifest tests, issue-form validation, plugin version validation, Markdown lint, and type-aware lint.
Run `pnpm run fix` when supported formatting repairs are needed.

## Pull requests

Describe the problem, the resulting behavior, the executed checks, and any unrun checks.
Reuse passing evidence only while its relevant inputs, configuration, and tools remain unchanged.
