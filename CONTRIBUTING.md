# Contributing

Issues are optional and are not prerequisites for implementation, pull requests, or integration.
Record the problem, scope, and acceptance criteria in the task or pull request when no issue is used.
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
