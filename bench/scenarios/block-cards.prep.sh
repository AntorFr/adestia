#!/bin/sh
# Un planning, une checklist et une liste EN CARTES, à côté d'une section
# encadrée — et les mêmes, nus.
#
# Le point du banc : `frame=card` sur n'importe quel bloc est dessiné par le
# lecteur — la carte d'une section, le titre en bandeau — et aucun bloc ne
# s'encadre plus tout seul : ni la checklist, qui dessinait sa boîte à liseré,
# ni la liste en lignes, qui avait une bordure sans l'avoir demandée. Un test
# dit qu'il y a une carte ; il ne dit pas si deux cartes d'une rangée ont
# leurs bandeaux alignés, si les lignes d'une liste encadrée vont d'un bord à
# l'autre, ni s'il reste une boîte dans la boîte. Ni si les étiquettes de
# jalons — trois, rapprochées, donc sur deux rangées — restent DANS le
# planning au lieu de monter sur le bloc du dessus.
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

:::content{type=synthese title="Synthèse" ico=📋 frame=card}
Cotes arrêtées, workbook validé ; reste le chant des tablettes avant la coupe.
:::

:::timeline{frame=card title="Planning" ico=🗓️ w=1/2}
- Conception: $(day -20) → $(day -3)
- Débit et usinage: $(day -2) → $(day +12)
- Finition: $(day +10) → $(day +24)
- Coupe: $(day +3)
- Chant validé: $(day +5)
- Livraison: $(day +22)
:::

:::checklist{frame=card title="À faire" ico=✅ w=1/2}
:::

:::list{frame=card title="Les pièces" ico=🧱}
- Côté gauche: 668 × 721
- Séparateur: 651 × 702
:::

## Sans carte

:::list{title="Les pièces"}
- Côté gauche: 668 × 721
- Séparateur: 651 × 702
:::

:::timeline
- Conception: $(day -20) → $(day -3)
- Débit et usinage: $(day -2) → $(day +12)
- Coupe: $(day +3)
- Chant validé: $(day +5)
:::

:::checklist{show=late}
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
