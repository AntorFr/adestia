#!/bin/sh
# What the landing canvas looks like on a REAL corpus.
#
# The bench's default instance is empty, and an empty home page is the one
# state nobody complains about. The complaint is "moche et pas pratique à
# explorer", and it is only earnable at density: 212 pages over five folders,
# unevenly filled, with the app mosaic underneath.
#
# Shape mirrored from the instance the complaint came from (measured
# 2026-08-31): domaines 131, todo 59, sujets 20 + an index, planning empty,
# home carrying the brief. Titles are invented but sized like real ones —
# truncation is a defect this bench has caught before.
#
# Prints its volumes on stdout, one `src:dst[:ro]` per line. See `run.sh`.
set -eu

stage=$1
w="$stage/workspace"

page() {
  path="$w/$1"
  mkdir -p "$(dirname "$path")"
  {
    echo '---'
    echo "title: $2"
    echo "type: ${3:-fiche}"
    echo "status: ${4:-en cours}"
    [ -n "${5:-}" ] && echo "ico: $5"
    echo '---'
    echo
    echo "Contenu de démonstration."
  } >"$path"
}

# ── domaines : le gros morceau, et le plus profond ────────────────────────
# `domaines` ne porte PAS d'index — mesuré sur l'instance : c'est le cas réel,
# et il change ce qui remonte en tuile, donc il ne s'invente pas.
page 'memory/domaines/diy/INDEX.md' 'Bois & atelier' 'index' 'permanent' '🪚'
page 'memory/domaines/diy/machines/INDEX.md' 'Machines' 'index' 'permanent'
page 'memory/domaines/diy/projets/INDEX.md' 'Projets' 'index' 'permanent'
page 'memory/domaines/diy/savoir-faire/INDEX.md' 'Savoir-faire' 'index' 'permanent'
for n in $(seq 1 9); do
  page "memory/domaines/diy/projets/projet-$n.md" "Meuble à tiroirs pour le bureau de Laurine ($n)" 'projet' 'en cours' 
done
for n in $(seq 1 7); do
  page "memory/domaines/diy/machines/machine-$n.md" "Lamello Zeta P2 — réglages et consommables ($n)" 'machine' 'permanent'
done
for n in $(seq 1 8); do page "memory/domaines/diy/savoir-faire/sf-$n.md" "Dérasage et bords de référence ($n)" 'savoir-faire' 'permanent'; done
for d in maison sante finances cuisine jardin voyages informatique famille; do
  case "$d" in maison|sante|cuisine|famille) page "memory/domaines/$d/INDEX.md" "$d" 'index' 'permanent' ;; esac
  for n in $(seq 1 13); do page "memory/domaines/$d/fiche-$n.md" "Une fiche de $d dont le titre est long comme la vraie vie ($n)" 'fiche' 'en cours'; done
done

# ── todo : beaucoup, courtes ──────────────────────────────────────────────
for n in $(seq 1 59); do page "memory/todo/todo-$n.md" "Rappeler le menuisier au sujet du panneau ($n)" 'todo' 'en cours'; done

# ── sujets : le seul dossier qui porte un index, chez lui ─────────────────
page 'memory/sujets/INDEX.md' 'Sujets' 'index' 'permanent' '🔎'
for n in $(seq 1 20); do page "memory/sujets/sujet-$n.md" "Adestia — la coque web posée sur les CLI ($n)" 'sujet' 'veille'; done

# ── planning : vide, et c'est un cas à photographier ──────────────────────
mkdir -p "$w/memory/planning"

# ── le brief, tel que l'agent l'écrit ─────────────────────────────────────
mkdir -p "$w/memory/home"
cat >"$w/memory/home/brief.json" <<'JSON'
{
  "items": [
    { "titre": "Le meuble à tiroirs ne passe pas la validation", "raison": "14 erreurs, dont 4 pièces jamais débitées", "cible": "domaines/diy/projets/projet-1.md" },
    { "titre": "Dressing de Laurine — bon pour la coupe", "raison": "revalidé ce matin", "cible": "domaines/diy/projets/projet-2.md" },
    { "titre": "Rails FS : la fiche machine n'a pas de photo", "raison": "à compléter", "cible": "domaines/diy/machines/machine-3.md" },
    { "titre": "Trois todos ouverts depuis plus d'un mois", "raison": "à trancher ou à fermer", "cible": "todo/todo-4.md" }
  ]
}
JSON

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
  apps: [todo, planif, collections, atelier, voyages, journal]
  features: [scan, parcours]
  skin: default
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$w:/workspace"
