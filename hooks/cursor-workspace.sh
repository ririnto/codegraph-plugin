#!/usr/bin/env sh

# Read Cursor's workspace in sh so PowerShell never has to expand the path.
exec sh "$1" "${CURSOR_PROJECT_DIR-}"
