#!/bin/sh
# Une page d'atelier avec ses fichiers, et des listes qui les PLACENT.
#
# Le point du banc : `:::list{source=files}` montre les fichiers de la page où
# l'auteur l'écrit — une rangée « documents en lignes / photos en planche » —
# et la bande « Fichiers joints » sous la page cesse de les répéter. Un test
# dit qu'il y a des lignes ; il ne dit pas si une planche mêlant photos et PDF
# a l'air d'une planche, ni si la bande du bas ne garde QUE ce qu'aucune liste
# n'a montré (ici, le zip).
#
# Les deux « photos » sont de minuscules dégradés PNG : un vrai fichier image,
# pour que la vignette soit servie et dessinée par le vrai chemin.
#
# Imprime ses volumes sur stdout, un `src:dst[:ro]` par ligne. Voir `run.sh`.
set -eu

stage=$1
w="$stage/workspace/memory/domaines/diy/projets/servante"
mkdir -p "$w/assets"

cat >"$w/INDEX.md" <<'MD'
---
title: Servante d'atelier sur roulettes
type: projet
status: en cours
---

# Servante d'atelier sur roulettes

Le caisson bas, au standard de hauteur de l'établi. Les documents et les
photos sont rangés à côté de cette page ; les listes ci-dessous les placent.

:::list{source=files type=pdf,text,data title="Documents" ico=📎 frame=card w=1/2}
:::

:::list{source=files type=image view=cards title="Photos" ico=📷 w=1/2}
:::

:::list{source=files type=pdf,image view=chips sort=modified title="Récents"}
:::
MD

printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAABYUlEQVR42g3LoQ6FIABA0fdh90soFAqFQqFAYG5sjgDFZCKRSCYTiWTyi56nn58TBMEm2AVFcAhOQRN0wRBcglswBUvwCF7Bz0mCZJPskiI5JKekSbpkSC7JLZmSJXkkr/yCIig2xa4oikNxKpqiK4biUtyKqViKR/GqL2iCZtPsmqI5NKemabpmaC7NrZmapXk0r/6CIRg2w24ohsNwGpqhG4bhMtyGaViGx/CaL1iCZbPslmI5LKelWbplWC7LbZmWZXksr/2CIzg2x+4ojsNxOpqjO4bjctyO6ViOx/G6L3iCZ/PsnuI5PKenebpneC7P7Zme5Xk8r/9CJES2yB4pkSNyRlqkR0bkityRGVmRJ/LGLyRCYkvsiZI4EmeiJXpiJK7EnZiJlXgSb/pCJmS2zJ4pmSNzZlqmZ0bmytyZmVmZJ/PmL1RCZavslVI5KmelVXplVK7KXZmVVXkqb+UPtm8A8OtWuzoAAAAASUVORK5CYII=' | base64 --decode >"$w/assets/avant.png"
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAABW0lEQVR42g3LoarGIBiA4XNN74UZjUaTCCtfGYhFg8GVIax8ZSArK5b/ds6e/vxhAmbDCGbHZEzBNMyBOTEXRjE35sG8mIX5/WEDdsMKdsdmbME27IE9sRdWsTf2wb7Yhf2CC7gNJ7gdl3EF13AH7sRdOMXduAf34hbuCz7gN7zgd3zGF3zDH/gTf+EVf+Mf/Itf+C/EQNyIQtyJmViIjXgQT+JFVOJNfIgvcRG/IAHZEEF2JCMFaciBnMiFKHIjD/IiC/lCCqSNJKSdlEmF1EgH6SRdJCXdpIf0khbpCzVQN6pQd2qmFmqjHtSTelGVelMf6ktd1C/0QN/oQt/pmV7ojX7QT/pFV/pNf+gvfdG/MAJjYwhjZ2RGYTTGwTgZF0MZN+NhvIzF+IIGdEMF3dGMFrShB3qiF6rojT7oiy70CzMwN6Ywd2ZmFmZjHsyTeTGVeTMf5stczN8/rzMeMFLGoNwAAAAASUVORK5CYII=' | base64 --decode >"$w/assets/apres.png"
printf '%%PDF-1.4\n%% banc\n' >"$w/plan-de-coupe.pdf"
printf 'piece;largeur;longueur\nSRV-COTE-G;668;721\n' >"$w/debit.csv"
printf '{"pieces": 9}\n' >"$w/workbook.json"
printf 'PK' >"$w/sources-fusion360.zip"

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
