#!/usr/bin/env sh

workspace=${1-.}
[ -n "$workspace" ] || exit 1
root=$(git -C "$workspace" rev-parse --show-toplevel) || root=$workspace
cd "$root" || exit 1

export NODE_USE_SYSTEM_CA=1
exec npx --yes @colbymchenry/codegraph init --yes </dev/null >&2
