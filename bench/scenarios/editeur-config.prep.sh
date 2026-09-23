#!/bin/sh
# Ce dont le scénario `editeur-config` a besoin : un `adestia.config.yaml`
# écrit à la main, commenté, et monté COMME EN PRODUCTION — un bind mount d'un
# seul fichier, mais inscriptible.
#
# C'est le montage qui est le sujet. `docker-compose.yml` monte ce fichier-là,
# un ConfigMap Kubernetes aussi, et un fichier bind-monté est un point de
# montage : on ne peut PAS lui renommer un frère par-dessus (EBUSY, mesuré le
# 23/09 sur node:22-alpine). L'écriture passe par le fichier lui-même. Un test
# unitaire simule ce refus ; seul ce banc le fait vraiment arriver.
#
# Les commentaires ci-dessous ne sont pas de la décoration : ce sont eux qui
# doivent survivre au clic. Un sérialiseur les aurait rendus à l'opérateur
# dépouillés, et c'est la raison pour laquelle le produit refusait d'écrire ce
# fichier.
#
# Imprime ses volumes sur stdout, un `src:dst[:ro]` par ligne. Voir `run.sh`.
set -eu

stage=$1
mkdir -p "$stage/workspace/memory/notes"

cat >"$stage/workspace/memory/notes/INDEX.md" <<'MD'
---
title: Notes
ico: 📓
---

# Notes

De quoi que l'instance ait un contenu.
MD

cat >"$stage/adestia.config.yaml" <<'YAML'
# ─────────────────────────────────────────────────────────────────────────
# L'instance, écrite à la main. CES COMMENTAIRES DOIVENT SURVIVRE AU CLIC.
# ─────────────────────────────────────────────────────────────────────────
name: Adestia
locale: fr

auth:
  mode: none

driver:
  id: claude-code

workspace:
  root: /workspace
  pages: memory
  # Rafraîchissement vivant. Les événements natifs ne traversent pas
  # certains montages — /mnt/c de WSL, NFS, SMB — d'où le scan.
  watch:
    enabled: true
    polling: false # ← celui que le scénario bascule

extensions:
  skin: default
YAML

chmod -R a+rwX "$stage"

# PAS de `:ro` : c'est tout l'objet du run. Et c'est bien un fichier, pas un
# dossier — donc un point de montage, avec ce que ça interdit.
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml"
echo "$stage/workspace:/workspace"
