#!/bin/sh
# What the `skin-dobby` scenario needs: an instance wearing the livery, and a
# memory with enough in it that the landing under the bookplate is not empty —
# a livery photographed over nothing says nothing about the tiles.
#
# Prints its volumes on stdout, one `src:dst[:ro]` per line. See `run.sh`.
set -eu

stage=$1
w="$stage/workspace"

page() {
  path="$w/memory/$1"
  mkdir -p "$(dirname "$path")"
  cat >"$path"
}

page 'lectures/INDEX.md' <<'MD'
---
title: Lectures
type: index
ico: 📚
couleur: rouge
---

Ce qui est en cours, ce qui attend sur la pile.
MD

page 'lectures/maitre-des-illusions.md' <<'MD'
---
title: Le Maître des illusions
---

Donna Tartt. Noté le 14 septembre, conseillé par ma sœur.
MD

page 'voyages/oxford/INDEX.md' <<'MD'
---
title: Oxford — printemps
type: voyage
ico: 🏛
---

Bodleian, Radcliffe Camera, et le pub où Tolkien et Lewis se retrouvaient.
MD

page 'carnet/INDEX.md' <<'MD'
---
title: Carnet
type: index
ico: 🖋
couleur: vert
---

Les idées qui n'ont pas encore de dossier.
MD

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Dobby
locale: fr
auth:
  mode: none
driver:
  id: claude-code
workspace:
  root: /workspace
  pages: memory
extensions:
  apps: [todo, voyages, journal]
  skin: dobby
YAML

chmod -R a+rX "$stage"

echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$w:/workspace"
