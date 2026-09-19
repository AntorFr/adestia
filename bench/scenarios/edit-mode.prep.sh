#!/bin/sh
# Une page faite de blocs, pour comparer ce qu'on LIT et ce qu'on ÉCRIT.
#
# Le point du banc : en édition, chaque bloc doit ressembler à ce qu'il est en
# lecture — la carte, le titre en bandeau, l'encadré, les rangées `w=` — et
# non plus une boîte grise à liseré avec son corps brut. Et chaque bloc doit
# pouvoir être réglé (⚙) là où il est. Un test ne dit rien de « ressemble ».
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

cat >"$w/INDEX.md" <<MD
---
title: Servante d'atelier sur roulettes
type: projet
status: en cours
---

# Servante d'atelier sur roulettes

Un paragraphe d'introduction, écrit comme une personne l'écrit, avant les blocs.

:::content{type=synthese title="Synthèse" ico=📋 by=Alfred on=2026-09-19 frame=card w=2/3}
Cotes arrêtées, workbook validé ; reste le chant des tablettes avant la coupe.
:::

:::list{title="Sous-projets" ico=🧱 frame=card w=1/3}
:::

:::figures{title="En chiffres" ico=📊}
- Pièces: 9 — 2 plaques
- Hauteur: 1000 mm — plan affleurant
- Chute: 11 % — sur P2
:::

:::timeline{frame=card title="Planning" ico=🗓️ w=1/2}
- Conception: $(day -20) → $(day -3)
- Débit et usinage: $(day -2) → $(day +12)
- Coupe: $(day +3)
:::

:::checklist{frame=card title="À faire" ico=✅ w=1/2}
:::

:::callout{type=warning title="Avant la coupe" ico=⚠️}
Le bas se chante sur ses quatre bords.
:::

## Liste de débit

| Étiquette | Largeur | Longueur |
|---|---|---|
| SRV-CÔTÉ-G | 668 | 721 |
| SRV-BAS | 722 | 671 |
MD

for n in plateau roulettes; do
  printf -- '---\ntitle: %s\nstatus: en cours\n---\n\nRien.\n' "$n" >"$w/$n.md"
done
printf -- '---\ntype: tache\ntitle: Choisir le chant des tablettes\ndue: %s\n---\n' "$(day -2)" >"$w/chant.md"

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
