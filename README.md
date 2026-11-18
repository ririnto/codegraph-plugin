# CodeGraph

Use [CodeGraph](https://github.com/colbymchenry/codegraph) in Claude Code, Codex, or Cursor to find symbols and trace calls in a Git checkout.
The plugin runs the upstream MCP server through `npx` and initializes the index when a session starts.

## Install

Use Git, a POSIX shell, and npm with Node.js 22.19+ on 22.x or 24.6+ on 24.x for system certificate support.

### Claude Code

```sh
claude plugin marketplace add ririnto/codegraph-plugin
claude plugin install codegraph-plugin@codegraph-plugin
```

### Codex

```sh
codex plugin marketplace add ririnto/codegraph-plugin
codex plugin add codegraph-plugin@codegraph-plugin
```

Trust the startup hook in Codex.
If you already use the `sinon` marketplace, install `codegraph-plugin@sinon` from it instead.
Start a new session in the repository you want to query.

### Cursor

In **Customize**, choose **From GitHub Repository** and enter `https://github.com/ririnto/codegraph-plugin`.
Select **CodeGraph**, choose **Install**, then open a new Agent conversation in your Git checkout.

For a local install, clone this repository into `~/.cursor/plugins/local/codegraph-plugin` and run **Developer: Reload Window**.

## Use the index

Ask your agent to find a symbol or its callers.
To check indexing progress from the checkout, run `npx --yes @colbymchenry/codegraph status`.

On startup, the plugin runs `codegraph init --yes` in the background and adds `.codegraph` to Git’s local exclude file.
The MCP server keeps the index in sync.
If file watching is unavailable, initialization can install Git sync hooks.
Claude Code also initializes each linked worktree on entry.
When querying a worktree through an existing MCP connection, pass its root as `projectPath`.

Report vulnerabilities through [private vulnerability reporting](https://github.com/ririnto/codegraph-plugin/security/advisories/new).
