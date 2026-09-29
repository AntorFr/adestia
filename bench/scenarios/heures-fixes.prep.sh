#!/bin/sh
# Une instance dont l'horloge TOURNE, avec les trois formes d'une cadence :
# l'heure fixe (`at:`), la période (`every:`), et la note confuse qui porte
# les deux — refusée, et l'écran doit le dire.
#
# Imprime ses volumes sur stdout, un `src:dst[:ro]` par ligne. Voir `run.sh`.
set -eu

stage=$1
mkdir -p "$stage/workspace/planif" "$stage/workspace/memory"

cat >"$stage/workspace/planif/briefing.md" <<'MD'
---
title: Briefing du foyer
at: 06:30, 12:30, 18:30
---

Prépare le point du foyer : météo du créneau, agenda des prochaines heures,
courrier en attente. Écris-le dans `memory/home/briefing.md`.
MD

cat >"$stage/workspace/planif/veille.md" <<'MD'
---
title: Veille des brouillons
every: 2h
---

Relis les pages sous `brouillons/` modifiées depuis le dernier passage et
signale celles qui contiennent une question en suspens.
MD

cat >"$stage/workspace/planif/confus.md" <<'MD'
---
title: Note confuse
every: 1h
at: 09:00
---

Une note qui porte les deux cadences ne sait pas ce qu'elle veut dire.
MD

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Adestia
auth:
  mode: none
driver:
  id: claude-code
schedule:
  enabled: true
workspace:
  root: /workspace
  pages: memory
extensions:
  apps: [planif]
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
