#!/bin/sh
# A `background`-flagged connection in a deployment that keeps no user keys
# (`auth: none`), and one EXPIRED mission so the clock spawns a caller-less
# turn on its very first tick. That is the real path to `backgroundTrouble`:
# no stubbing, the runtime refuses its own mint and must say so. The turn
# itself then dies on the absent engine, which is fine — the trouble is set
# before the spawn, and the banner is what the shots are for.
set -eu

stage=$1
mkdir -p "$stage/workspace/pages" "$stage/workspace/planif"

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Alfred
locale: fr
auth:
  mode: none
driver:
  id: claude-code
workspace:
  root: /workspace
schedule:
  enabled: true
  tickMs: 1000
mcp:
  servers:
    - name: google
      url: https://hub.bench.invalid/google/
      identity: user
      background: true
extensions:
  apps: []
  features: []
  skin: default
YAML

# Expired years ago: the final turn is owed at the first tick, no waiting on
# an occurrence window. The clock stamps `expired` into this file, so the
# workspace mount must stay writable.
cat >"$stage/workspace/planif/relance.md" <<'MD'
---
title: Relance du bail
every: 1d
until: 2020-01-01
---
Dis un mot sur le bail.
MD

chmod -R a+rwX "$stage/workspace"
chmod a+rX "$stage" "$stage/adestia.config.yaml"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
