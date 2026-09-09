#!/bin/sh
# Le premier bloc d'un plugin `feature` qui dessine dans une page : `:::timeline`.
#
# Le point du banc : des barres positionnées en pourcentages, un trait
# d'aujourd'hui, des jalons dont l'étiquette dépasse au-dessus — tout ça est
# de la géométrie que les tests ne regardent pas. Et les trois honnêtetés du
# bloc doivent se VOIR : la ligne illisible nommée sous le dessin, le bloc
# vide qui montre la grammaire, la phase courante qui se distingue.
set -eu

stage=$1
w="$stage/workspace"
mkdir -p "$w/memory/chantiers/adestia"

cat >"$w/memory/chantiers/INDEX.md" <<'MD'
---
title: Chantiers
---

# Chantiers
MD

cat >"$w/memory/chantiers/adestia/INDEX.md" <<'MD'
---
title: Adestia v1
type: projet
status: en cours
---

# Adestia v1

Le planning du chantier, rédigé dans le bloc — une ligne à deux dates est une
phase, une ligne à une date est un jalon.

:::timeline
- Cadrage: 2026-07-01 → 2026-08-15
- Réalisation: 2026-08-01 → 2026-09-30
- Recette: 2026-09-20 → 2026-10-15
- Revue de mi-parcours: 2026-08-20
- v1.0: 2026-09-12
- Sortie mobile: bientôt
:::

Le sprint en cours, à la semaine :

:::timeline{scale=weeks}
- Éditeur de blocs: 2026-09-07 → 2026-09-18
- Démo: 2026-09-16
:::

Et un bloc dont aucune ligne ne porte de date lisible — il doit montrer la
grammaire ET rendre les lignes par leur nom, jamais un axe autour de rien :

:::timeline
- Sortie mobile: à caler
- Idées en vrac
:::
MD

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Alfred
locale: fr
auth:
  mode: none
driver:
  id: claude-code
workspace:
  root: /workspace
  pages: memory
  planif: planning
extensions:
  apps: []
  features: [project-management]
  skin: default
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$w:/workspace"
