#!/bin/sh
# Une entrée par bloc du cœur, plus un témoin sans bloc du tout.
#
# Écrit pour une panne : `adestiaVocabulary()` ne déclarait un nœud d'éditeur
# que pour `callout`, `gallery` et `app`, et rien pour les quatre renderings
# ajoutés le 2026-09-09 (`content`, `figures`, `table`, `list`) — Milkdown
# rendait « cannot match target parser » sur un document que le lecteur
# dessine parfaitement. La panne est réparée ; le jeu d'entrées reste, comme
# garde-fou : chaque bloc du cœur doit pouvoir s'ouvrir au ✎, et en revenir
# écrit pareil.
#
# Les attributs sont ceux que le cœur déclare AUJOURD'HUI (`vocabulary.ts`).
# Ils ont bougé depuis la première version de ce fichier, qui demandait un
# `ton=` à un callout et un `type=` à une table : le lecteur les ignorait en
# le disant, et les captures se remplissaient d'avertissements qui n'étaient
# pas le sujet.
set -eu

stage=$1
pages="$stage/workspace/pages/journal/atelier"
mkdir -p "$pages"

cat >"$pages/INDEX.md" <<'MD'
---
title: Atelier
type: journal
ico: 🪵
---
MD

# 1 — témoin : rien que de la prose. Doit s'éditer.
cat >"$pages/2026-09-01-0800.md" <<'MD'
---
type: entree
date: 2026-09-01T08:00
title: Temoin sans bloc
---

Rien que de la prose, pour avoir une entrée dont on sait qu'elle marche.
MD

# 2 — callout : il avait déjà son nœud d'éditeur quand les autres n'en avaient pas.
cat >"$pages/2026-09-02-0800.md" <<'MD'
---
type: entree
date: 2026-09-02T08:00
title: Avec un callout
---

:::callout{type="tip"}
Le gabarit est rangé au fond, derrière la scie.
:::

Une phrase après le bloc.
MD

# 3 — content : un des quatre qui vidaient la zone d'édition.
cat >"$pages/2026-09-03-0800.md" <<'MD'
---
type: entree
date: 2026-09-03T08:00
title: Avec un content
---

:::content{type="Bilan"}
Quatre plateaux débités, deux réservés.
:::

Une phrase après le bloc.
MD

# 4 — figures : idem.
cat >"$pages/2026-09-04-0800.md" <<'MD'
---
type: entree
date: 2026-09-04T08:00
title: Avec des figures
---

:::figures
- Avancement: 62 % — 8 lots sur 13
- Chutes: 14 kg
:::

Une phrase après le bloc.
MD

# 5 — table : idem, et c'est elle qui fait l'aller-retour plus bas.
cat >"$pages/2026-09-05-0800.md" <<'MD'
---
type: entree
date: 2026-09-05T08:00
title: Avec une table
---

:::table
| Niveau | Quoi |
| --- | --- |
| moyen | La butée arrière bouge |
| levé | La cale de 8 mm |
:::

Une phrase après le bloc.
MD

# 6 — list : idem, et sans corps — un bloc vide doit s'ouvrir aussi.
cat >"$pages/2026-09-06-0800.md" <<'MD'
---
type: entree
date: 2026-09-06T08:00
title: Avec une list
---

:::list{source="children"}
:::

Une phrase après le bloc.
MD

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Atelier
locale: fr
auth:
  mode: none
driver:
  id: claude-code
extensions:
  apps: [journal]
  skin: default
YAML

chmod -R a+rwX "$stage"

echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
