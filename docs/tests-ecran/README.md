# Tests d'écran : inventaire par grappe

Un **test d'écran** est un test qui charge une page dans un navigateur : tout fichier de test
(`packages/*/test`, `bench/tests`, `plugins/*/test`) dont le texte nomme `chromium` ou `playwright`.
Les tests jsdom à réseau simulé restent hors inventaire, sauf ceux qu'une grappe y trouve en passant
(elle le dit dans son fichier).
Une grappe peut aussi lister des fichiers qui ne pilotent aucun navigateur : leurs lignes sont `sans-porte` (déjà hors écran, rien à reporter), voir plus bas.

## La règle

**L'effet par sa porte, l'affichage à l'écran.** Ce qu'un test d'écran vérifie se range en deux :

- l'*affichage* : où se tient une chose, ce qu'elle montre, son état visuel, ce qui ne se voit
  qu'à travers un rendu. Il reste à l'écran, entier ;
- l'*effet* : ce que le serveur ou un module fait (supprimer puis relire, refuser, persister). Il se
  vérifie par sa porte, une route, une API ou un module déjà exposés, sans navigateur.

Ordre de travail pour un effet : le test hors écran d'abord, vert ; ensuite seulement le test d'écran
est allégé ou retiré. Aucune assertion d'affichage ne se retire. Un effet sans porte testable hors écran
est `sans-porte` : il reste à l'écran, jamais retiré, avec la raison.

## Forme d'une ligne d'inventaire

Un fichier par grappe, `docs/tests-ecran/<grappe>.md`. Il porte une ligne `Statut : vide` (la grappe
n'est pas encore classée) ou `Statut : complet` (chaque test existant de ses fichiers a sa ligne), puis
un tableau, une ligne par test :

| Test | Classe | Hors écran | À l'écran | Raison |
|---|---|---|---|---|
| `<fichier> > <nom JUnit du test>` | `affichage` \| `effet` \| `scindé` \| `sans-porte` | `<fichier> > <nom du test hors écran>` | `gardé` \| `allégé` \| `retiré` | pourquoi aucune porte |

- `Test` : le fichier d'écran, ` > `, le nom du test tel que le rapport JUnit le donne (`docs/tests-ecran/existants.txt`).
- `effet` et `scindé` : `Hors écran` nomme un test vert d'un fichier qui n'est pas un test d'écran
  (le garde-fou vérifie que le fichier existe et contient ce nom), et `À l'écran` dit ce que le test
  d'écran est devenu.
- `sans-porte` : `Raison` n'est jamais vide. `affichage` : les deux colonnes du milieu restent vides.
- Une barre verticale dans un nom s'écrit `\|`.

## Le garde-fou

`scripts/tests-ecran.mjs` (joué par `packages/server/test/tests-ecran-garde.test.ts`) échoue quand :
un fichier d'écran n'est dans aucune grappe ; un effet cite un test hors écran qui n'existe pas ; une
ligne `sans-porte` n'a pas de raison ; un inventaire `complet` a perdu la ligne d'un test de
`existants.txt` (un test retiré garde sa ligne, classée `retiré`). Il reste vert sur un inventaire `vide`.

`node scripts/tests-ecran.mjs` le joue seul.

## Durée

`avant.md` : la durée de chaque fichier d'écran avant tout allègement, mesurée par
`scripts/mesurer-tests-ecran.mjs`. La durée « après », par grappe et au total, est dans le `README.md` du dépôt
(section « Screen-test duration, before and after »), mesurée par la même commande.

## Grappes

### web-chat-charte

- `packages/web/test/besoin-chat-browser.test.ts`
- `packages/web/test/besoin-chat-narrow-browser.test.ts`
- `packages/web/test/besoin-chargements-browser.test.ts`
- `packages/web/test/besoin-charte-browser.test.ts`
- `packages/web/test/besoin-charte-comportement.test.ts`
- `packages/web/test/besoin-tours.test.ts`

### web-hors-ligne-acces

- `packages/web/test/besoin-hors-ligne-browser.test.ts`
- `packages/web/test/besoin-hors-ligne-bords.test.ts`
- `packages/web/test/besoin-hors-ligne-flux.test.ts`
- `packages/web/test/ensemble-hors-ligne-browser.test.ts`
- `packages/web/test/ensemble-acces-refuse-browser.test.ts`

### web-mcp-pages

- `packages/web/test/besoin-mcp-browser.test.ts`
- `packages/web/test/besoin-pages-browser.test.ts`
- `packages/web/test/besoin-pages-ensemble-browser.test.ts`

### bench-chat

- `bench/tests/chat-besoin.test.mjs`
- `bench/tests/chat-chargements-besoin.test.mjs`
- `bench/tests/chat-correctifs-besoin.test.mjs`
- `bench/tests/chat-correctifs-course.test.mjs`
- `bench/tests/chat-p2-besoin.test.mjs`
- `bench/tests/chat-p2-gestes-besoin.test.mjs`
- `bench/tests/chat-session-perdue-besoin.test.mjs`
- `bench/tests/diagnostics-phone-besoin.test.mjs`

### bench-pages

- `bench/tests/pages-besoin.test.mjs`
- `bench/tests/pages-verify.test.mjs`
- `bench/tests/page-suivie-besoin.test.mjs`
- `bench/tests/page-suivie-complement-besoin.test.mjs`
- `bench/tests/page-suivie-suites-besoin.test.mjs`

### bench-plugins-shell

- `bench/tests/plugins-besoin.test.mjs`
- `bench/tests/plugins-chargements-besoin.test.mjs`
- `bench/tests/plugins-chargements-ensemble.test.mjs`
- `bench/tests/plugins-chargements-retry-besoin.test.mjs`
- `bench/tests/plugins-ensemble.test.mjs`
- `bench/tests/shell-besoin.test.mjs`
- `bench/tests/dette-ensemble.test.mjs`
- `bench/tests/playwright-une-fois.test.mjs`

### serveur

- `packages/server/test/bench-besoin.test.ts`
- `packages/server/test/bench-ensemble.test.ts`
- `packages/server/test/bench-launcher.test.ts`
- `packages/server/test/bench-sweep.test.ts`
- `packages/server/test/catalogues-provenance-ui-ensemble.test.ts`
- `packages/server/test/catalogues-retrait-ecran-ensemble.test.ts`
- `packages/server/test/catalogues-retrait-imports-ecran-ensemble.test.ts`
- `packages/server/test/catalogues-ui-ensemble.test.ts`
- `packages/server/test/qualite-serveur-ensemble.test.ts`

`sans-porte` a deux sens, toujours dits dans la colonne `Raison` : (1) un effet qu'aucune route, API ni module n'expose hors écran, et le test reste entier à l'écran ; (2) un test qui ne pilote aucun navigateur (fichier de grappe qui ne nomme ni `chromium` ni `playwright`, ou test de lanceur, de route, d'arguments) : il est déjà hors écran, il n'y a rien à reporter, et sa ligne n'est pas un travail à faire. Cas surtout fréquent dans la grappe `serveur`. Pour rejouer un test hors écran seul : `scripts/rejouer.sh "<nom>"`. La cellule `Test` s'écrit avec ou sans accents graves ; le garde-fou accepte les deux. Les nombres de tests de `avant.md` (colonne Tests) comptent les cas que `node --test` et vitest rapportent, pas les lignes d'inventaire, qui suivent `existants.txt`.

## Hors inventaire

Gardes de la suite, qui nomment le navigateur sans en piloter un écran :

- `bench/tests/bench-once.test.mjs` — garde de la suite (hors tranche des grappes)
- `bench/tests/niveaux-besoin.test.mjs` — teste le script `scripts/niveaux.mjs` (node) ; `playwright` n'y est que dans une chaîne de fixture, aucun navigateur n'est lancé
- `bench/tests/niveaux-ensemble.test.mjs` — idem : fixture en chaîne, aucun navigateur lancé

Tests d'écran nés dans `epic/adestia-pages`, après l'inventaire par grappe : ils pilotent un navigateur et restent entiers à l'écran, mais leurs tests ne sont pas encore classés ligne à ligne (classement à faire, avec une grappe ; un fichier d'écran de plus n'entre dans aucune grappe sans que ses lignes y soient).

- `packages/web/test/besoin-pages-structure-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/besoin-coller-tableau-browser.test.ts` — écran de la feature `adestia-coller-tableau` (B-paste-1), classement à faire
- `packages/web/test/besoin-creer-dossier-browser.test.ts` — écran de la feature `adestia-decouverte-creer-dossier` (B-32, B-33 ; E-2, E-3, E-38), classement à faire
- `packages/web/test/besoin-creer-dossier-complement-browser.test.ts` — écran de la feature `adestia-decouverte-creer-dossier`, seconde passe (B-32, B-33 ; E-2, E-3, E-38), classement à faire
- `packages/web/test/besoin-decouverte-plugins-browser.test.ts` — écran de la feature `adestia-decouverte-plugins` (B-34, P-21 étape 4 ; E-3, E-36, E-38), classement à faire
- `packages/web/test/besoin-dossiers-reglages-browser.test.ts` — écran de la feature `adestia-dossiers-fichier-reglages` (B-36, B-37 ; E-2, E-3), classement à faire
- `packages/web/test/besoin-dossiers-reglages-ecran-browser.test.ts` — écran de la feature `adestia-dossiers-reglages-ecran` (B-39, B-40, P-23 ; E-3, E-4, E-39), classement à faire
- `packages/web/test/besoin-dossiers-reglages-ecran-complement-browser.test.ts` — écran de la feature `adestia-dossiers-reglages-ecran`, seconde passe (B-39, B-40, P-23 ; E-3, E-4, E-39), classement à faire
- `packages/server/test/besoin-dossiers-pieces-jointes-ecran-ensemble.test.ts` — écran de la feature `adestia-dossiers-pieces-jointes` (B-38, AD-41 ; E-3), classement à faire
- `packages/web/test/besoin-renommer-browser.test.ts` — écran de la feature `adestia-decouverte-renommer` (B-35 ; E-3, E-38), classement à faire
- `packages/web/test/besoin-etat-projet-browser.test.ts` — écran de l'epic `adestia-pages` (E-3, E-4, E-31, E-36), classement à faire
- `packages/web/test/besoin-popover-bandeau-tardif-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/besoin-rouge-23-spinner-config.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/besoin-rouge-25-menu-rouage-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/blocs-projet-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/complement-formulaires-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/ensemble-pages-deplacer-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/ensemble-pages-deplacer-cartes-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/ensemble-pages-formulaires-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/ensemble-pages-structure-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/etat-projet-gabarit-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/galerie-formulaire-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/nouveau-modele-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/pages-structure-edition-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/recette-formulaires-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/reglages-undo-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/verify-formulaires-browser.test.ts` — écran de l'epic `adestia-pages`, classement à faire
- `packages/web/test/version-hors-image-ecran-browser.test.ts` — écran E-15 de la feature `adestia-version-hors-image` (ligne de version du menu ⚙), classement à faire
- `bench/tests/folders-migration-ensemble.test.mjs` — écran de la feature `adestia-dossiers-migration-agent` (B-41 ; E-3, deux tests d'écran ; le reste du fichier passe par les portes sans navigateur), classement à faire
