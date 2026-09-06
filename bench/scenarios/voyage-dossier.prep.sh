#!/bin/sh
# Ce dont le scénario `voyage-dossier` a besoin avant le boot : un voyage dont
# le DOSSIER porte plus que sa timeline — des fiches rédigées à côté, et des
# pièces jointes que personne n'a déclarées sur une carte.
#
# Le vrai sujet du run : ces deux blocs vivent SOUS la timeline, donc sous la
# ligne de flottaison. Un test unitaire dit que la règle du dossier est juste ;
# il ne dit pas qu'on voit les billets. Le voyage est court (4 jours) pour que
# le bas de page reste atteignable dans une capture.
#
# Un piège est monté exprès : `jours/` porte une page ET son PDF. Ni l'un ni
# l'autre ne doit apparaître — ils appartiennent à la page qui vit là, pas au
# voyage. C'est la règle de la coque, et c'est celle qui se casse en silence.
#
# Imprime ses volumes sur stdout, un `src:dst[:ro]` par ligne. Voir `run.sh`.
set -eu

stage=$1
w="$stage/workspace/pages/voyages/corse"
mkdir -p "$w/assets/photos" "$w/jours"

cat >"$w/assets/voyage.json" <<'JSON'
{
  "titre": "Corse — été 2026",
  "status": "prépa",
  "debut": "2026-08-08",
  "fin": "2026-08-11",
  "modes": ["marche", "voiture"],
  "lieux": [
    { "id": "calvi", "nom": "Calvi", "lat": 42.567, "lng": 8.757 }
  ],
  "items": [
    { "id": "hotel", "type": "hebergement", "statut": "confirme",
      "titre": "U Carabellu", "debut": "2026-08-08", "fin": "2026-08-11",
      "lieu": "calvi" },
    { "id": "ferry", "type": "trajet", "statut": "confirme",
      "titre": "Ferry Toulon → L'Île-Rousse", "jour": "2026-08-08",
      "heure": "08:00", "duree": "5 h 45", "ico": "⛴", "gmail": "abc",
      "docs": [{ "fichier": "assets/embarquement.pdf",
                 "titre": "Cartes d'embarquement" }] },
    { "id": "citadelle", "type": "activite", "statut": "confirme",
      "titre": "La citadelle à pied", "jour": "2026-08-09",
      "hint": "3 km, une heure, tout en haut",
      "fiche": "citadelle-calvi.md" },
    { "id": "anna", "type": "resto", "statut": "suggestion",
      "titre": "Chez Anna", "creneau": "soir", "prix": "~60 €",
      "hint": "Terrasse sous les remparts" },
    { "id": "scandola", "type": "visite", "statut": "suggestion",
      "titre": "Réserve de Scandola", "hint": "En bateau depuis le port" }
  ]
}
JSON

# Les fiches : enfants directs du dossier, rédigées par l'agent. Celle de la
# balade n'est pointée par AUCUNE carte — c'est l'orpheline que le bloc existe
# pour rattraper.
cat >"$w/citadelle-calvi.md" <<'MD'
---
title: La citadelle de Calvi
type: fiche
---

# La citadelle de Calvi

Montée par la rampe sud, une heure en flânant.
MD
cat >"$w/balade-notre-dame.md" <<'MD'
---
title: Balade à Notre-Dame de la Serra
type: fiche
---

# Balade à Notre-Dame de la Serra

Aucune carte ne la pointe. Elle doit être atteignable quand même.
MD

# Les pièces jointes : une déclarée par une carte, deux que personne n'a
# déclarées — dont une au fond de `assets/`, qui se prend en entier.
printf '%%PDF-1.4\n%% carte embarquement\n' >"$w/assets/embarquement.pdf"
printf '\377\330\377\341 jpeg\n' >"$w/assets/photos/calvi.jpg"
cat >"$w/reservation.ics" <<'ICS'
BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR
ICS

# Le piège : une page en sous-dossier avec SA pièce jointe. Ni l'une ni
# l'autre n'appartient au voyage.
cat >"$w/jours/mardi.md" <<'MD'
---
title: Mardi — le port
type: fiche
---

# Mardi — le port
MD
printf '%%PDF-1.4\n%% plan du port\n' >"$w/jours/plan-du-port.pdf"

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Voyages
locale: fr
auth:
  mode: none
driver:
  id: claude-code
extensions:
  apps: [voyages]
  skin: default
YAML

chmod -R a+rwX "$stage"

echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
# Sur /workspace : l'image pose ADESTIA_WORKSPACE, et l'environnement l'emporte
# sur le YAML.
echo "$stage/workspace:/workspace"
