#!/bin/sh
# What the `signatures` scenario needs before boot: an instance that names a
# signing façade and says it may be framed. The façade itself never exists —
# the scenario answers its URL from the browser (see signatures.mjs).
#
# Prints its volumes on stdout, one `src:dst[:ro]` per line. See `run.sh`.
set -eu

stage=$1
cat >"$stage/adestia.config.yaml" <<'YAML'
name: Signatures
locale: fr
auth:
  mode: none
driver:
  id: claude-code
signatures:
  origins: [https://tessera.example]
  embed: true
YAML
chmod -R a+rwX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
