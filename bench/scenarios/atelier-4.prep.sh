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
w="$stage/workspace/pages/projets"
mkdir -p "$w/en-3-0/assets" "$w/en-4-0/assets"

cat >"$w/en-3-0.md" <<'MD'
---
title: Meuble poubelle — schéma 3.0
type: projet
---

# Meuble poubelle — schéma 3.0

Le workbook tel qu'il a été écrit et coupé.
MD
cat >"$w/en-4-0.md" <<'MD'
---
title: Meuble poubelle — schéma 4.0
type: projet
---

# Meuble poubelle — schéma 4.0

Le même workbook, avec sa source en amont. L'établi doit le dessiner à
l'identique : le 4.0 n'ajoute rien à la géométrie.
MD

cp "$src" "$w/en-3-0/assets/workbook.json"

# Le même, en 4.0 : un design par-dessus, les pièces et le débit inchangés.
python3 - "$src" "$w/en-4-0/assets/workbook.json" <<'PY'
import json, sys
wb = json.load(open(sys.argv[1]))
wb['schemaVersion'] = '4.0'
wb['design'] = {
    'famille': 'caisson',
    'trigramme': wb.get('projet', 'XXX'),
    'pose': 'mobile',
    'note': "Design minimal : ce run regarde le RENDU, pas la dérivation.",
}
wb['derive'] = {'de': 'fnv1a64:0000000000000000', 'moteur': 'bench'}
json.dump(wb, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
PY

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
