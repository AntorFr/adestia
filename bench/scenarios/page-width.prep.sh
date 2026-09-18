#!/bin/sh
# Une page d'atelier comme Alfred en écrit, pour regarder la LARGEUR.
#
# Le point du banc : sur un grand écran, la prose garde sa mesure (~830 px) et
# tout le reste prend la largeur du canevas — le tableau de débit, le bandeau
# `w=2/3` + `w=1/3`, les chiffres, la carte. Un test ne dit rien de ça : il ne
# voit ni où une colonne s'arrête, ni si une carte s'aligne sur les chiffres
# sous elle. Le tableau est volontairement large (sept colonnes), parce que
# c'est lui qui passait ligne à ligne dans une colonne de 632 px.
#
# Imprime ses volumes sur stdout, un `src:dst[:ro]` par ligne. Voir `run.sh`.
set -eu

stage=$1
w="$stage/workspace/memory/domaines/diy/projets"
mkdir -p "$w"

cat >"$stage/workspace/memory/domaines/diy/INDEX.md" <<'MD'
---
title: L'Atelier
type: index
ico: 🪚
---

# L'Atelier
MD

cat >"$w/INDEX.md" <<'MD'
---
title: Projets
type: index
---

# Projets
MD

mkdir -p "$w/servante"
cat >"$w/servante/INDEX.md" <<'MD'
---
title: Servante d'atelier sur roulettes
type: projet
status: en cours
---

# Servante d'atelier sur roulettes

:::content{type=synthese title="Synthèse" ico=📋 by=Alfred on=2026-09-18 view=cards}
Caisson bas sur roulettes, au standard de hauteur de l'établi (1000 mm), plan
de travail affleurant. Cotes arrêtées, workbook validé ; reste à choisir le
chant des tablettes avant la coupe.
:::

:::figures
- Pièces: 9 — 2 plaques
- Hauteur: 1000 mm — plan affleurant
- Chute: 11 % — sur P2
- Coupe: samedi — si le chant est tranché
:::

:::list{depth=children w=2/3}
:::

:::content{type=perimetre title="Périmètre" w=1/3 view=cards}
Le caisson, ses tablettes et le plateau. Les roulettes sont celles du meuble
imprimante, déjà en stock.
:::

## Pourquoi cette profondeur

Les profondeurs dictées d'abord ne tenaient pas dans l'emprise : 400 + 19 + 350
= 769 mm pour 650 annoncés. La poire a été coupée en deux, côté outils comme
côté bacs, et le séparateur médian tient lieu de panneau de fond — il isole les
deux zones et porte le plan de travail, ce qui dispense d'un fond qui ne
servirait qu'à fermer.

## Liste de débit

| Étiquette | Rôle | Largeur (mm) | Longueur (mm) | Réglage FS-PA | Ép. | Panneau |
|---|---|---|---|---|---|---|
| SRV-CÔTÉ-G | Côté gauche, chanté en façade | 668 (→ 670 fini) | 721 | 668 | 19 | P1 |
| SRV-CÔTÉ-D | Côté droit, chanté en façade | 668 (→ 670 fini) | 721 | 668 | 19 | P1 |
| SRV-TABLETTE-G | Tablette médiane gauche (500 / 183) | 651 (→ reprise) | 331,5 | 668 | 19 | P1 |
| SRV-TABLETTE-D | Tablette médiane droite (400 / 283) | 651 (→ reprise) | 331,5 | 668 | 19 | P1 |
| SRV-SÉPARATEUR | Séparateur médian, porte le plateau | 651 | 702 | 651 | 19 | P2 |
| SRV-BAS | Bas traversant, chanté sur quatre bords | 722 | 671 | 671 | 19 | P2 |

:::callout{type=warning}
Le bas se chante sur ses quatre bords : il passe sous les côtés et sous le
séparateur, donc ses deux bouts et sa rive arrière sont à nu.
:::
MD

# Ses enfants, pour que le bandeau ait une liste à tenir.
cat >"$w/servante/plateau.md" <<'MD'
---
title: Plateau MDF du stock
status: en cours
---

Le plateau, recoupé dans une chute de 19.
MD
cat >"$w/servante/roulettes.md" <<'MD'
---
title: Roulettes à frein, reprises du meuble imprimante
status: clos
---

Quatre, dont deux à frein.
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
  apps: []
  features: []
  skin: alfred
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
