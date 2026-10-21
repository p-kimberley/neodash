#!/bin/sh
# Prints the changelog.md section for one release (its "## NeoDash <version>" heading up to the
# next "## " heading), without the heading itself. Fails if the changelog has no such section, so a
# release can't be tagged without its notes.
#   scripts/release-notes.sh 3.2.1
set -e
version="$1"
if [ -z "$version" ]; then
  echo "usage: $0 <app version>" >&2
  exit 2
fi
changelog="$(dirname "$0")/../changelog.md"
notes=$(tr -d '\r' < "$changelog" | awk -v v="$version" '
  /^## / { if (found) exit; if ($0 ~ "^## NeoDash " v "( |$)") { found = 1; next } }
  found { print }
')
if [ -z "$(printf '%s' "$notes" | tr -d '[:space:]')" ]; then
  echo "changelog.md has no section '## NeoDash $version'" >&2
  exit 1
fi
printf '%s\n' "$notes"
