#!/bin/sh
# Ce dont le scénario `atelier-4` a besoin avant le boot : l'établi allumé, et
# deux projets qui portent LE MÊME workbook — l'un en 3.0, l'autre passé en 4.0.
#
# Le vrai sujet du run : le 4.0 ajoute une source EN AMONT des pièces et ne
# touche pas à la géométrie, donc l'établi doit le dessiner exactement comme le
# 3.0. Un test unitaire dit que le validateur l'accepte ; il ne dit pas qu'un
# plan s'affiche. Le workbook est un vrai — celui d'un meuble déjà construit —
# parce qu'un workbook inventé pour l'occasion ne prouverait rien du rendu.
#
# Imprime ses volumes sur stdout, un `src:dst[:ro]` par ligne. Voir `run.sh`.
set -eu

stage=$1
src=${ATELIER_BENCH_SRC:-/Users/berard/Dev/Adestia/tmp/alfred-weekend/artefacts/workspace/memory/domaines/diy/projets/meuble-poubelle/assets/workbook.json}

# `pages` : le workspace a un sous-dossier pour les pages, et c'est LUI que
# l'établi parcourt. Poser les projets un cran trop haut donne un écran
# « aucun workbook » parfaitement calme.
# L'atelier n'a plus de tuile à lui : il EST la vue du domaine `diy`, dont
# l'INDEX porte le titre. Un domaine, une porte — cf. le chantier du 01/09.
w="$stage/workspace/pages/memory/domaines/diy/projets"
mkdir -p "$w/en-3-0/assets" "$w/en-4-0/assets"

cat >"$stage/workspace/pages/memory/domaines/diy/INDEX.md" <<'MD'
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

# Un projet riche est un DOSSIER qui contient sa fiche ET ses assets (D15) :
# c'est le dossier que l'établi réclame, pas la fiche posée à côté.
cat >"$w/en-3-0/en-3-0.md" <<'MD'
---
title: Meuble poubelle — schéma 3.0
type: projet
---

# Meuble poubelle — schéma 3.0

Le workbook tel qu'il a été écrit et coupé.
MD
cat >"$w/en-4-0/en-4-0.md" <<'MD'
---
title: Meuble à tiroirs — dérivé par le moteur
type: projet
---

# Meuble à tiroirs — dérivé par le moteur

Pièces, cotes et calepinage sortent du calcul. L'établi doit le dessiner
comme n'importe quel workbook écrit à la main.
MD

cp "$src" "$w/en-3-0/assets/workbook.json"

# Le second est DÉRIVÉ par le moteur : ses pièces, ses cotes et surtout son
# calepinage sortent du calcul, pas d'une main. C'est ce plan-là qu'il faut
# voir dessiné — un `debit[]` que le validateur accepte n'est pas encore un
# plan qu'on peut lire sur une TV d'atelier.
moteur=${ATELIER_MOTEUR:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)/plugins/atelier}
cp "$moteur/exemples/meuble-tiroirs.workbook.json" "$w/en-4-0/assets/workbook.json"
node "$moteur/tools/atelier.mjs" derive "$w/en-4-0/assets/workbook.json" \
  --regles "$moteur/exemples/regles" --ecrit >/dev/null

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Atelier
locale: fr
auth:
  mode: none
driver:
  id: claude-code
extensions:
  apps: [atelier]
  skin: default
YAML

chmod -R a+rwX "$stage"

echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
# Sur /workspace, pas /data/workspace : l'image pose ADESTIA_WORKSPACE, et une
# variable d'environnement l'emporte sur le YAML — un `workspace.root` dans la
# config est accepté, ignoré, et ne se voit qu'à l'écran vide qu'il produit.
echo "$stage/workspace:/workspace"
