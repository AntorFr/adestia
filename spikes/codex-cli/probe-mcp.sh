#!/usr/bin/env bash
# Where does an MCP server land, and does the CLI report its health?
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"
H=codex-home-mcp
say() { echo; echo "########## $* ##########"; }

say "mcp add --help"
./run.sh --codex-home $H -- mcp add --help

say "mcp list (empty)"
./run.sh --codex-home $H -- mcp list --json; echo "exit=$?"

say "mcp add a stdio server"
./run.sh --codex-home $H -- mcp add testsrv -- /bin/echo hello; echo "exit=$?"

say "mcp add an http server"
./run.sh --codex-home $H -- mcp add remotesrv --url https://example.invalid/mcp; echo "exit=$?"

say "mcp list --json"
./run.sh --codex-home $H -- mcp list --json; echo "exit=$?"

say "what landed on disk"
ls "$here/$H"
echo "--- config.toml"
cat "$here/$H/config.toml" 2>/dev/null || echo "(no config.toml)"

say "mcp get testsrv"
./run.sh --codex-home $H -- mcp get testsrv --json; echo "exit=$?"

say "mcp remove remotesrv"
./run.sh --codex-home $H -- mcp remove remotesrv; echo "exit=$?"
echo "--- config.toml after removal"
cat "$here/$H/config.toml" 2>/dev/null
