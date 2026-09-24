#!/bin/sh
# Une instance qui NE DÉCLARE PAS sa langue, pour que le navigateur décide.
#
# Le point du banc : les mots qu'un plugin déclare dans son manifeste — le nom
# de sa tuile, le libellé et l'aide de ses champs — sont dessinés par la
# COQUE, pas par lui. Deux lecteurs sur la même instance, l'un en français
# l'autre en anglais, c'est la seule façon de voir que la clé est bien la
# phrase anglaise et que la table du plugin répond par-dessus.
#
# Imprime ses volumes sur stdout, un `src:dst[:ro]` par ligne. Voir `run.sh`.
set -eu

stage=$1
w="$stage/workspace/memory/domaines/diy/projets"
mkdir -p "$w/servante"

cat >"$w/servante/INDEX.md" <<'MD'
---
title: Servante d'atelier sur roulettes
type: projet
id: servante
status: en cours
domaine: atelier
---

# Servante d'atelier sur roulettes

Le projet qu'une tâche pointe.
MD

cat >"$w/servante/chant.md" <<'MD'
---
title: Choisir le chant des tablettes
type: tache
due: 2026-09-30
start: 2026-09-20
pri: 2
dom: atelier
projet: servante
---

Chêne massif : congé de 2 mm, ou chant collé ?
MD

# Pas de `locale:` — c'est le navigateur qui tranche, un lecteur à la fois.
cat >"$stage/adestia.config.yaml" <<'YAML'
name: Adestia
auth:
  mode: none
driver:
  id: claude-code
workspace:
  root: /workspace
  pages: memory
extensions:
  apps: [todo, planif, journal]
  features: [project-management]
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
