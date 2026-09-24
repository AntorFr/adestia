#!/bin/sh
# Un petit corpus qui a du VOCABULAIRE, pour que le formulaire ait de quoi proposer.
#
# Le point du banc : les listes ne sont pas écrites dans le code, elles sortent
# de l'index. Il faut donc plusieurs fiches qui écrivent `domaine`, `cat` et des
# `tags`, deux projets avec un `id` (la liste d'un champ « référence »), une
# tâche (les champs déclarés par le plugin todo), une fiche dont le frontmatter
# porte une structure imbriquée (ce que l'éditeur garde sans y toucher) et une
# fiche qui n'en a pas du tout (celle qui n'avait aucun point d'entrée).
#
# Imprime ses volumes sur stdout, un `src:dst[:ro]` par ligne. Voir `run.sh`.
set -eu

stage=$1
w="$stage/workspace/memory/domaines/diy/projets"
mkdir -p "$w/servante" "$stage/workspace/memory/domaines/maison"

cat >"$w/servante/INDEX.md" <<'MD'
---
# la fiche elle-même
title: Servante d'atelier sur roulettes
type: projet
id: servante
status: en cours
domaine: atelier
cat: menuiserie
tags: [etabli, rangement]
cotes:
  hauteur: 1000
  largeur: 720
---

# Servante d'atelier sur roulettes

Un paragraphe d'introduction, écrit comme une personne l'écrit, avant les blocs.

:::figures{title="En chiffres" ico=📊}
- Pièces: 9 — 2 plaques
- Hauteur: 1000 mm — plan affleurant
:::
MD

cat >"$w/etabli.md" <<'MD'
---
title: Établi MFT maison
type: projet
id: etabli
status: réalisé
domaine: atelier
cat: menuiserie
tags: [etabli]
---

Fini l'an dernier.
MD

cat >"$stage/workspace/memory/domaines/maison/rangement.md" <<'MD'
---
title: Rangement du garage
type: projet
id: garage
status: idée
domaine: maison
cat: amenagement
---

À chiffrer.
MD

cat >"$w/servante/chant.md" <<'MD'
---
title: Choisir le chant des tablettes
type: tache
due: 2026-09-30
pri: 2
dom: atelier
projet: servante
urgence: haute
---

Chêne massif : congé de 2 mm, ou chant collé ?
MD

# Aucun frontmatter : la fiche qui n'avait aucun point d'entrée.
cat >"$w/servante/note.md" <<'MD'
# Note rapide

Trois lignes écrites à la volée, sans rien déclarer.
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
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
