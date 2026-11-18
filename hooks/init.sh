#!/usr/bin/env sh

workspace=${1-.}
if [ -z "$workspace" ]; then
  exit 0
fi

if ! root=$(git -C "$workspace" rev-parse --show-toplevel 2>/dev/null); then
  exit 0
fi

if ! cd "$root"; then
  exit 1
fi

export NODE_USE_SYSTEM_CA=1
exec npx --yes @colbymchenry/codegraph init --yes </dev/null >&2
