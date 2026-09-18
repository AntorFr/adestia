#!/bin/sh
# Un planning et une checklist EN CARTES, à côté d'une section encadrée.
#
# Le point du banc : `view=cards` sur un bloc de plugin est dessiné par le
# lecteur — la carte d'une section, le titre en bandeau — et la checklist,
# qui dessinait sa propre boîte, la quitte dans une carte. Un test dit qu'il y
# a une carte ; il ne dit pas si deux cartes d'une rangée ont leurs bandeaux
# alignés, ni s'il reste une boîte dans la boîte. Dessous, les mêmes blocs
# SANS carte, dont une checklist écrite à l'ancienne (`view=late`), qui doit
# toujours filtrer.
#
# Imprime ses volumes sur stdout, un `src:dst[:ro]` par ligne. Voir `run.sh`.
set -eu

stage=$1
w="$stage/workspace/memory/domaines/diy/projets/servante"
mkdir -p "$w"

day() {
  case "$1" in [-+]*) offset=$1 ;; *) offset="+$1" ;; esac
  date -u -v"$offset"d +%Y-%m-%d 2>/dev/null || date -u -d "$offset days" +%Y-%m-%d
}

task() {
  {
    echo '---'
    echo 'type: tache'
    echo "title: $2"
    [ -n "${3:-}" ] && echo "due: $3"
    echo '---'
  } >"$w/$1.md"
}
task chant 'Choisir le chant des tablettes' "$(day -4)"
task plateau 'Recouper le plateau MDF' "$(day +2)"
task roulettes 'Commander les roulettes à frein' "$(day -1)"
task quincaillerie 'Faire le tour de la quincaillerie' ''

cat >"$w/INDEX.md" <<MD
---
title: Servante d'atelier sur roulettes
type: projet
status: en cours
---

# Servante d'atelier sur roulettes

:::content{type=synthese title="Synthèse" ico=📋 view=cards}
Cotes arrêtées, workbook validé ; reste le chant des tablettes avant la coupe.
:::

:::timeline{view=cards title="Planning" ico=🗓️ w=1/2}
- Conception: $(day -20) → $(day -3)
- Débit et usinage: $(day -2) → $(day +12)
- Finition: $(day +10) → $(day +24)
- Coupe: $(day +3)
:::

:::checklist{view=cards title="À faire" ico=✅ w=1/2}
:::

## Sans carte

:::timeline
- Conception: $(day -20) → $(day -3)
- Débit et usinage: $(day -2) → $(day +12)
:::

:::checklist{view=late}
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
extensions:
  apps: [todo]
  features: [project-management]
  skin: alfred
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
