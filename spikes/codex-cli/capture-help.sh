#!/usr/bin/env bash
# Capture every subcommand's --help into raw/, unauthenticated.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"
for c in exec login logout mcp plugin app-server remote-control completion \
         update doctor sandbox debug apply resume queue archive delete \
         unarchive fork cloud exec-server features agents review \
         migrate-rollouts; do
  ./run.sh -- "$c" --help > "raw/cmd-$c.txt" 2>&1
  echo "$c exit=$? lines=$(wc -l < "raw/cmd-$c.txt")"
done
