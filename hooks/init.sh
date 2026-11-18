#!/usr/bin/env sh

workspace=${1-.}
if [ -z "$workspace" ]; then
  exit 0
fi

if [ "$(git -C "$workspace" rev-parse --is-inside-work-tree 2>&1)" != "true" ]; then
  exit 0
fi

if ! root=$(git -C "$workspace" rev-parse --show-toplevel); then
  exit 1
fi

if ! cd "$root"; then
  exit 1
fi

export NODE_USE_SYSTEM_CA=1
exec npx --yes @colbymchenry/codegraph init --yes <&- >&2
