#!/usr/bin/env sh

workspace=${1-.}
if [ -z "$workspace" ]; then
  exit 0
fi

if [ "$(git -C "$workspace" rev-parse --is-inside-work-tree 2>&1)" != "true" ]; then
  exit 0
fi

if ! exclude=$(git -C "$workspace" rev-parse --path-format=absolute --git-path info/exclude); then
  exit 1
fi

if grep -qsxE '[.]codegraph[[:space:]]*' "$exclude"; then
  exit 0
fi

if ! mkdir -p "${exclude%/*}"; then
  exit 1
fi
{
  echo
  echo .codegraph
} >> "$exclude"
