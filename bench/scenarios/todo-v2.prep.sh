#!/bin/sh
# A todo base with everything v2 added, on the mounting it was designed for.
#
# Two stores — a personal one and a shared circle — because "on a des stores
# partageables, du coup tâche pour tout le monde" is the sentence this whole
# change answers, and a single-store instance photographs none of it: no rim,
# no store tab, and "up for grabs" never occurring.
#
# Dates are computed from the day the bench runs, so the shots keep saying the
# same thing next month: a base with hard-coded dates goes all-red in a week
# and the picture stops being about the feature.
#
# Prints its volumes on stdout, one `src:dst[:ro]` per line. See `run.sh`.
set -eu

stage=$1
w="$stage/workspace"
f="$stage/famille"

# BSD date wants an explicit SIGN — `-v56d` is refused, `-v+56d` is not — and
# GNU date wants `-d`. Both are covered, and the offset is normalised first:
# without that the failure is SILENT, because `2>/dev/null` eats the message
# and `set -e` kills the prep before it prints a single volume.
day() {
  case "$1" in [-+]*) offset=$1 ;; *) offset="+$1" ;; esac
  date -u -v"$offset"d +%Y-%m-%d 2>/dev/null || date -u -d "$offset days" +%Y-%m-%d
}

# path title [extra frontmatter lines] [body]
#
# Written with `if` rather than `[ … ] && …`: under `set -e` a trailing test
# that is FALSE makes the whole function return 1, and the prep dies without a
# word — the same silent death the date helper above already cost once.
task() {
  path="$1"
  mkdir -p "$(dirname "$path")"
  {
    echo '---'
    echo 'type: tache'
    echo "title: $2"
    if [ -n "${3:-}" ]; then printf '%s\n' "$3"; fi
    echo '---'
    if [ -n "${4:-}" ]; then echo; echo "$4"; fi
  } >"$path"
}

# ── Le magasin perso ──────────────────────────────────────────────────────
task "$w/memory/taches/plombier.md" 'Appeler le plombier' \
  "due: $(day -17)
assignee: antoine
dom: maison
pri: 1"

task "$w/memory/taches/mutuelle.md" 'Renvoyer le formulaire de mutuelle' \
  "due: $(day -3)
assignee: antoine
dom: admin"

# Celle qui porte tout : une note, deux documents cités, une priorité, un
# chantier et des sous-tâches. C'est la ligne qui doit montrer ses marqueurs.
task "$w/memory/taches/poncer-porte.md" 'Poncer la porte du garage' \
  "due: $(day 0)
assignee: antoine
dom: atelier
pri: 2
projet: domaines/diy/garage
files: [domaines/admin/assurance/devis.pdf, domaines/diy/assets/avant.jpg]
sub: [taches/demonter-gonds, taches/reposer-porte]" \
  'Grain 120 puis 240. Vérifier les gonds avant de reposer — celui du haut avait du jeu.'

task "$w/memory/taches/demonter-gonds.md" 'Démonter les gonds' "done: $(day -2)
dom: atelier"
task "$w/memory/taches/reposer-porte.md" 'Reposer et vernir' "assignee: antoine
dom: atelier"

task "$w/memory/taches/devis-fenetres.md" 'Relancer le devis fenêtres' \
  "due: $(day 3)
dom: maison" \
  'Trois artisans contactés, un seul a répondu.'

task "$w/memory/taches/charnieres.md" 'Commander les charnières' "done: $(day -1)
assignee: antoine
dom: atelier"

# Les différées : le cœur de `start:`. Elles doivent QUITTER les vues vivantes.
task "$w/memory/taches/ramoner.md" 'Ramoner le poêle' \
  "start: $(day 56)
assignee: antoine
dom: maison"
task "$w/memory/taches/pneus.md" 'Sortir les pneus hiver' "start: $(day 70)
dom: voiture"
task "$w/memory/taches/impots.md" 'Déclarer les impôts fonciers' \
  "start: $(day 200)
assignee: antoine
dom: admin"

# Le réglage : qui est « moi » sur CETTE instance.
mkdir -p "$w/memory/taches"
cat >"$w/memory/taches/reglages.md" <<'MD'
---
type: todo-config
title: Réglages todo
me: antoine
---
MD

# ── Le cercle famille ─────────────────────────────────────────────────────
# Deux à prendre : l'état que le partage produit et qu'aucun écran ne montrait.
task "$f/taches/gite.md" 'Réserver le gîte pour la Toussaint' "due: $(day 1)
dom: voyages" \
  'Trois nuits, deux chambres. Regarder du côté de Sarzeau.'
task "$f/taches/mediatheque.md" 'Rendre les livres à la médiathèque' "due: $(day 2)
assignee: lena
dom: maison"
task "$f/taches/dentiste.md" 'Prendre rendez-vous chez le dentiste' "due: $(day 3)
assignee: celine
dom: sante"
task "$f/taches/vernis.md" 'Choisir la teinte du vernis' "due: $(day 4)
dom: atelier"

# ── La page qui porte un :::checklist ─────────────────────────────────────
mkdir -p "$w/memory/domaines/diy" "$w/memory/domaines/admin/assurance" "$w/memory/domaines/diy/assets"
cat >"$w/memory/domaines/diy/garage.md" <<'MD'
---
title: Rangement du garage
type: projet
status: en cours
---

L'établi passe contre le mur nord, les vélos sur le rail. Le vernis attend que
la porte soit poncée.

## Ce qui reste

:::checklist
:::
MD

# Deux blocs qui se partagent une ligne : le seul moyen de voir que `w` fait
# ce qu'il dit, puisqu'un composant ne voit jamais son voisin.
cat >"$w/memory/domaines/diy/atelier.md" <<'MD'
---
title: L'atelier cette semaine
type: fiche
---

Ce qui reste ici, et ce que la maison attend.

:::checklist{depth=self w="1/2"}
:::

:::checklist{page="../../taches" assignee=antoine w="1/2"}
:::

Et en dessous, pleine largeur, ce qui n'a pas de porteur.

:::checklist{page="../../taches" w="1"}
:::
MD

# Les documents cités existent vraiment : un lien mort se photographie mal.
printf 'devis\n' >"$w/memory/domaines/admin/assurance/devis.pdf"
printf 'photo\n' >"$w/memory/domaines/diy/assets/avant.jpg"

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Alfred
locale: fr
auth:
  mode: none
driver:
  id: claude-code
workspace:
  root: /workspace
  planif: planning
  stores:
    - id: perso
      path: memory
      label: Perso
      default: true
    - id: famille
      path: /famille
      label: Famille
      hue: violet
extensions:
  apps: [todo]
  features: []
  skin: default
YAML

mkdir -p "$w/planning"
chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$w:/workspace"
echo "$f:/famille"
