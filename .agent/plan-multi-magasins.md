# Plan — plusieurs magasins, une seule mémoire

> L'ordre est l'instruction. Le contrôle de non-régression vient AVANT le
> composeur, parce qu'après il ne prouve plus rien. À supprimer avec la lettre
> de mission et la liste de questions quand la fonctionnalité est livrée.

## 0. Les témoins, d'abord — le contrôle de non-régression

La règle nº 2 dit : l'union d'un ensemble à un élément est l'identité, et ça se
vérifie **octet à octet**. Ça ne peut se capturer que sur le code d'AVANT.

Sur un espace de travail de fixture, sérialiser et commiter les réponses de
`/api/pages`, `/api/pages/index`, `/api/files?under=`, `/api/files?page=` et
`/api/home/brief`. Après le composeur, les mêmes requêtes doivent rendre les
mêmes octets. « C'est un diff, pas une impression. »

## 1. La table des magasins et le résolveur — `packages/server/src/stores.ts`

Le seul module qui connaît la disposition physique. Rien d'autre n'en parle.

- `resolveStores(config)` : `{ id, label, hue?, dir, at, default }[]`, `dir`
  absolu, `at` normalisé, défaut monté à `''` et `at` refusé sur lui.
- `resolve(logique)` → `{ file, store }[]` — candidats, principal d'abord,
  **garde de traversée appliquée magasin par magasin, après retrait du préfixe
  de montage** (un `../` ne doit pas sortir en profitant d'une seconde racine).
- `list({ under?, suffix? })` → chemins **logiques** + `store`, union,
  précédence, collisions remontées.
- `logicalOf(fichier)` → le chemin logique, ou `undefined` (le veilleur en a
  besoin dans l'autre sens).
- `targetFor(logique)` → le magasin d'écriture, ou la liste des candidats quand
  la question se pose (R2).

Testé seul, avant tout branchement : c'est ici que vivent l'union, la
précédence, les collisions et la garde.

## 2. La configuration — `config.ts`

`workspace.stores[]` (`id`, `path`, `at?`, `label?`, `hue?`, `default?`).
Absent ⇒ **un magasin synthétisé** depuis `workspace.pages` — rétrocompatible
par construction. `pages` et `stores` tous deux présents ⇒ `stores` gagne et le
dit au log de démarrage. Refus au boot : deux `default`, un `at` sur le défaut,
un id dupliqué, un `path` hors du disque. Déclaration **dans le fichier
seulement** (une variable d'environnement ne sait porter ni libellé ni teinte).

## 3. Les quatre consommateurs de `pagesRoot` (`app.ts:977`)

- **`pages.ts`** — `list`/`index` par l'union (+ `store` si >1, + `stores[]`) ;
  `GET` par le résolveur, `?store=` en qualificatif ; **409 + candidats** quand
  c'est indécidable ; `PUT` par `targetFor`, 403 nommant le magasin sur EACCES.
- **`files.ts`** — `attachmentsOf` et `?under=` par l'union ; les pièces
  jointes d'un même dossier logique peuvent être réparties, elles s'unionnent.
- **`watch.ts`** — N veilleurs, un par magasin ; `logicalOf` traduit avant de
  rapporter. Le format du flux ne bouge pas : l'événement porte le chemin
  logique, comme aujourd'hui.
- **`plugin-host.ts`** — `pagesRoot` **disparaît** du contrat, remplacé par un
  service (`list`, `resolve`, `read`, `write`) sur des chemins logiques.

## 4. Porter les quatre plugins

`voyages` (`findVoyages`), `atelier` (`findWorkbooks`), `listening-post`
(`readSources`/`readLibrary`) : leur marcheur de FS disparaît au profit de
`ctx.pages.list()`. `parcours` et `listening-post` : leur garde de traversée
maison (`safeParcoursPath`, `safePath`) disparaît au profit de
`ctx.pages.resolve()`. Aucun `join(root, …)` ne doit survivre.

## 5. Le contrat de l'agent — `skills.ts`

Contrat **généré** listant les magasins (id, libellé, chemin disque, montage)
et la règle d'écriture. Livré seulement si plus d'un magasin. La mécanique
existe : `SkillFile.contents` est une chaîne construite en code, et la
livraison substitue déjà `{{plugin_dir}}`.

## 6. La coque

- URL sans extension, dans les deux fonctions qui la produisent et la lisent
  (`openPage`, la route `/page/`) ; un vieux lien portant `.md` ouvre toujours.
- Le traducteur : candidat unique → lui ; principal parmi les candidats → le
  principal ; plusieurs annexes sans principal → **navigation vers l'URL du
  dossier parent** (sauf si on y est déjà).
- Carte : pastille de magasin (teinte résolue comme `--adestia-hue-<nom>`,
  mécanisme existant des tuiles) ; suffixe du libellé **seulement en conflit**,
  le principal gardant son titre nu. Clé React = chemin + magasin.
- Le lien d'une carte non prioritaire porte `?store=`.

## 7. Le regard

`bench/run.sh bench/scenarios/multi-magasins.mjs` : deux magasins, un domaine
fusionné, un conflit (les deux cartes, une suffixée), une pastille par magasin,
clair et sombre. « Si ça dessine quelque chose, on le regarde. »

## 8. La fermeture

Supprimer `mission-multi-magasins.md`, `questions-multi-magasins.md` et ce
fichier ; mettre `status.md` à jour. Le contrat vivant est le code et
`DESIGN.md`.
