#!/bin/sh
# Une entrée VIDE — ni titre ni corps, ce que `+` sans titre produit — suivie
# d'une entrée normale. Le crayon de la première est positionné en absolu dans
# une carte qui n'a presque pas de hauteur.
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

cat >"$pages/2026-09-10-0900.md" <<'MD'
---
type: entree
date: 2026-09-10T09:00
---
MD

cat >"$pages/2026-09-09-0900.md" <<'MD'
---
type: entree
date: 2026-09-09T09:00
title: Sans corps mais avec un titre
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
