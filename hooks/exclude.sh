#!/usr/bin/env sh

workspace=${1-.}
[ -n "$workspace" ] || exit 1
exclude=$(git -C "$workspace" rev-parse --path-format=absolute --git-path info/exclude) || exit 1

if ! grep -qsxE '[.]codegraph[[:space:]]*' "$exclude"; then
  mkdir -p "${exclude%/*}" && printf '\n.codegraph\n' >> "$exclude"
fi
