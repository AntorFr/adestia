#!/bin/sh
# Un `2/3` seul sur sa ligne, puis un `1/3` et un `2/3` sur la suivante.
#
# Le point du banc : `:::row` coupe la ligne des blocs `w=` et ne dessine RIEN
# dans la page — pas de trait, pas de trou en hauteur — mais se montre dans
# l'éditeur, pour qu'on sache qu'il est là. Un test compte les cellules ; il
# ne dit pas si la page a l'air d'avoir voulu ce trou à droite du `2/3`.
#
# Imprime ses volumes sur stdout, un `src:dst[:ro]` par ligne. Voir `run.sh`.
set -eu

stage=$1
w="$stage/workspace/memory/domaines/diy/projets/servante"
mkdir -p "$w"

cat >"$w/INDEX.md" <<'MD'
---
title: Servante d'atelier sur roulettes
type: projet
status: en cours
---

# Servante d'atelier sur roulettes

:::content{type=synthese title="Synthèse" ico=📋 frame=card w=2/3}
Cotes arrêtées, workbook validé ; reste le chant des tablettes avant la coupe.
:::

:::row
:::

:::list{title="Sous-projets" ico=🧱 frame=card w=1/3}
:::

:::content{type=planning title="Planning" ico=🗓️ frame=card w=2/3}
Débit la semaine prochaine, finition la suivante.
:::
MD

for n in plateau roulettes; do
  printf -- '---\ntitle: %s\nstatus: en cours\n---\n\nRien.\n' "$n" >"$w/$n.md"
done

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
extensions:
  apps: []
  features: []
  skin: alfred
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
