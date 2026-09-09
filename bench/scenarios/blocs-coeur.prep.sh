#!/bin/sh
# Un chantier écrit avec les quatre rendus génériques, et ses enfants.
#
# Le point du banc : ces blocs sont du DESSIN. Un test dit qu'une tuile porte
# « 62 % » ; il ne dit pas si quatre tuiles tiennent sur une ligne, si le
# tableau respire, si la liste se distingue de la prose autour, ni si tout ça
# survit au sombre. Et il ne dit rien du bandeau — deux blocs partageant une
# ligne par `w=`, ce que le lecteur fait mais qu'aucun test ne regarde.
set -eu

stage=$1
w="$stage/workspace"
mkdir -p "$w/memory/chantiers/adestia/socle" "$w/memory/chantiers/adestia/editeur"

cat >"$w/memory/chantiers/INDEX.md" <<'MD'
---
title: Chantiers
---

# Chantiers
MD

cat >"$w/memory/chantiers/adestia/INDEX.md" <<'MD'
---
title: Adestia v1
type: projet
status: en cours
---

# Adestia v1

:::content{type=synthese by=Antor on=2026-09-09}
Le produit tourne : chat streamé, mémoire composée de plusieurs magasins, huit
plugins livrés. Restent deux lots avant de taguer la v1.0 — l'éditeur de blocs
et le mode `ask`. Aucun des deux ne dépend d'un tiers.
:::

:::figures
- Avancement: 62 % — 8 lots sur 13
- Jalon: 12 sept. — dans 3 jours
- Risques ouverts: 1 — 1 levé
- Sujets: 3 — 1 décision attendue
:::

:::list{depth=children pull=status w=2/3}
:::

:::content{type=perimetre w=1/3}
Le socle de contenu et son shell. Hors infra, hors déploiement.
:::

:::table{type=risques}
| Gravité | Risque | Parade |
|---|---|---|
| Moyen | Le CLI change son contrat de session | Un test de contrat casse le build avant la mise en production. |
| Levé | Un onglet fermé perd le tour en cours | Le tour est un travail détaché de la requête. |
:::
MD

cat >"$w/memory/chantiers/adestia/note.md" <<'MD'
---
title: Note de lecture
---

Une page rangée ici, qui n'est pas un sous-chantier.
MD

cat >"$w/memory/chantiers/adestia/socle/INDEX.md" <<'MD'
---
title: Socle de contenu
status: en cours
---

# Socle de contenu
MD

cat >"$w/memory/chantiers/adestia/editeur/INDEX.md" <<'MD'
---
title: Éditeur de blocs
status: clos
---

# Éditeur de blocs
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
  planif: planning
extensions:
  apps: []
  features: []
  skin: default
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$w:/workspace"
