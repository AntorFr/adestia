#!/bin/sh
# One sign-in server in the config, nobody connected: the state the card and
# the settings row exist for. The authorization server behind it is never
# reached — the shots stop at the button, and the connections endpoint
# answers from the (empty) sign-in store alone.
set -eu

stage=$1
mkdir -p "$stage/workspace/pages"

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Alfred
locale: fr
auth:
  mode: none
driver:
  id: claude-code
workspace:
  root: /workspace
mcp:
  servers:
    - name: home-assistant
      url: https://ha.bench.invalid/
      identity: user
      signIn: oauth
extensions:
  apps: []
  features: []
  skin: default
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
