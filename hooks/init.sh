#!/usr/bin/env sh

if [ -z "${1-.}" ]; then
  exit 0
fi

if [ "$(git -C "${1-.}" rev-parse --is-inside-work-tree 2>&1)" != "true" ]; then
  exit 0
fi

if ! root=$(git -C "${1-.}" rev-parse --show-toplevel); then
  exit 1
fi

if ! cd "$root"; then
  exit 1
fi

export NODE_USE_SYSTEM_CA=1
exec npx --yes @colbymchenry/codegraph init --yes <&- >&2
