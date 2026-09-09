#!/bin/sh
# Un journal avec une entrée déjà écrite : de quoi voir le `+` à côté de
# quelque chose, et de quoi renommer une entrée qui existait avant.
set -eu

stage=$1
pages="$stage/workspace/pages/journal/atelier"
mkdir -p "$pages"

cat >"$pages/INDEX.md" <<'MD'
---
title: Atelier
type: journal
ico: 🪵
---
MD

cat >"$pages/2026-09-01-0800.md" <<'MD'
---
type: entree
date: 2026-09-01T08:00
title: Affutage
---

Pierre 1000 puis 6000. Le ciseau de 25 coupe le papier sans forcer.
MD

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Atelier
locale: fr
auth:
  mode: none
driver:
  id: claude-code
extensions:
  apps: [journal]
  skin: default
YAML

chmod -R a+rwX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
