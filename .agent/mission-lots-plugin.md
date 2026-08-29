# Mission — plugin « lots » : visualiser les chantiers de la galaxie Tessera/Ostia

> Lettre de mission pour l'agent qui implémentera le plugin. **⚠️ À SUPPRIMER
> une fois l'implémentation terminée** (dans le commit final, avec le
> `status.md` à jour) : le contrat vivant est dans les repos scannés, cette
> lettre ne doit pas survivre comme deuxième source de vérité.

## Le besoin

Monsieur veut voir d'un coup d'œil, dans Golem : ses projets (repos), leurs
lots, l'état de chacun, **ce qui est à lui** (lots à spécifier, questions à
trancher), **dans quel ordre** traiter, et **ce qui est bloqué** — typiquement
une question structurante découverte par un agent coder qui gèle toute une
chaîne de lots.

## La source de vérité — à lire AVANT de coder

- **`~/Dev/tessera/.agent/lots/README.md`** — le canon : schéma du frontmatter,
  règles de dérivation, règle de lecture `main`/branches. Miroir :
  `~/Dev/ostia/.agent/lots/README.md`.
- `CLAUDE.md` §Lot lifecycle de chaque repo — le cycle vu des agents.

**En cas d'écart entre cette lettre et ces READMEs, les READMEs font foi.**
Relis-les au moment de l'implémentation : ils peuvent avoir évolué depuis.

## Le contrat de données (résumé)

Un repo participant porte `.agent/lots/` : un item = un fichier `<id>.md`.
Le frontmatter YAML (plat, délimité par `---`) est l'état ; le corps markdown
est de la prose (notes, rapports, décisions) — affichable, jamais parsé.

```yaml
id: tessera-2        # unique dans la galaxie, préfixé par le repo ; = nom du fichier
type: lot            # lot | question
title: "…"
status: idea         # lot : idea|design|code|integrate|done — question : open|decided
priority: 1          # optionnel ; 1 = le plus prioritaire
depends_on: []       # ids de lots OU de questions, inter-repos permis
spec: CONCEPTION.md  # optionnel ; où vit la spec
branch: lot1         # branche du chantier dès que status ≥ code, sinon null
updated: 2026-08-29
```

## La règle de lecture — Golem ne lit PAS toutes les branches

1. **`main` d'abord, et seulement `main` comme index** : lire toutes les
   fiches de `.agent/lots/` sur `main` de chaque repo scanné.
2. Pour chaque fiche dont `branch:` est renseignée **et dont la branche existe
   encore** : superposer la version de la pointe de branche
   (`git show <branch>:.agent/lots/<id>.md`) — elle fait foi pour SA fiche
   jusqu'à fusion — et ramasser toute fiche `question` **nouvelle** présente à
   cette pointe (cas du renvoi code→design).
3. Jamais d'énumération de `git branch` : une branche que `main` ne désigne
   pas n'existe pas pour le plugin.
4. Timeline d'un item : `git log --follow` sur son fichier — pas de champ
   d'historique à inventer.

## Les dérivations à afficher (ne JAMAIS les demander en champs)

- **Qui a la main** ← `status` : `idea`/`design` + questions `open` →
  Monsieur ; `code` → agent coder ; `integrate` → agent intégrateur.
- **Bloqué** = au moins une dépendance non terminée (lot non `done`, question
  non `decided`). Une question `open` en amont bloque toute sa chaîne aval —
  c'est LE signal à rendre visible en premier.
- **Actionnable** = toutes les dépendances terminées.
- **Ordre** = tri topologique sur `depends_on`, départagé par `priority`
  croissante, puis par `id`.
- **Vue « à traiter par Monsieur »** = questions `open` + lots `idea`/`design`.
- Les graphes des repos se **fusionnent** (ids préfixés) : les dépendances
  inter-repos sont légitimes — ex. `ostia-q-selectors` impacte `tessera-5`.

## Contraintes

- **Lecture seule, absolue** : le plugin ne modifie jamais les fiches ni quoi
  que ce soit dans les repos scannés. L'écriture appartient aux agents et à
  Monsieur, par git — Golem est une fenêtre, pas un stylo.
- Repos scannés **configurables** (chemins locaux ; `~/Dev/tessera` et
  `~/Dev/ostia` aujourd'hui — ostia n'a pas de remote, tout est local).
- Parse du frontmatter sans dépendance lourde : YAML plat (scalaires + listes
  en ligne), un split sur `---` et quelques lignes suffisent.
- Normes du repo : `CLAUDE.md` de golem (worktree, green first, et « if it
  draws something, look at it » — ce plugin dessine, donc on le REGARDE).
- Un repo sans `.agent/lots/`, une fiche au frontmatter invalide, une branche
  disparue : dégrader proprement et le DIRE dans l'UI, jamais planter ni
  deviner.

## À la fin de l'implémentation

1. `.agent/status.md` à jour dans le commit final.
2. **Supprime ce fichier** (`git rm .agent/mission-lots-plugin.md`) dans ce
   même commit. Mission accomplie = lettre détruite ; les READMEs des repos
   scannés restent l'unique contrat.
