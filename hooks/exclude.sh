#!/usr/bin/env sh

if [ -z "${1-.}" ]; then
  exit 0
fi

if [ "$(git -C "${1-.}" rev-parse --is-inside-work-tree 2>&1)" != "true" ]; then
  exit 0
fi

if ! exclude=$(git -C "${1-.}" rev-parse --path-format=absolute --git-path info/exclude); then
  exit 1
fi

if grep -qsxE '[.]codegraph[[:space:]]*' "$exclude"; then
  exit 0
fi

if ! mkdir -p "${exclude%/*}"; then
  exit 1
fi

echo >> "$exclude"
echo .codegraph >> "$exclude"
