# Questions — chantier statut de projet

> Une question vivante à la fois ; les autres attendent leur tour, dans l'ordre.
> Worktree `statut-de-projet`, branche `worktree-statut-de-projet`, rebasée sur
> `main` à v0.73.0 (l'édition du frontmatter par formulaire).

| # | Question | État | Réponse |
|---|---|---|---|
| 0 | La pastille colorée pour `pull=status` dans `:::list` | close | oui (24/09) — livrée, banc regardé clair + sombre |
| 1 | ~~Qui porte le vocabulaire Vert/Ambre/Rouge~~ → reformulée en 1bis | close | v0.73.0 : le manifeste porte la **déclaration** (`fields`, par type revendiqué). Reste la couleur et la précédence. |
| 1bis | Où vivent la couleur et la précédence : un mot connu du cœur, ou un mécanisme générique ? | close | **générique** (24/09) : « ce n'est pas un cas isolé, on peut avoir à gérer des status / états dans plein de situations » |
| 1ter | Le cœur dessine-t-il tout champ noté déclaré ? | close | **non** (24/09) : « le status red green amber s'applique à des projets et QUE à des projets ». Le barème reste au plugin ; générique = le mécanisme, pas le vocabulaire |
| 1quater | Une **prise** dans le dessin du cœur, ou un **bloc dédié** ? | close | **bloc dédié** (24/09) : une prise fait dépendre l'évolution d'une carte de tous les plugins, y compris ceux qu'on ne maîtrise pas ; et le bloc mutualise avec `:::timeline` |
| 2 | Une pastille ou deux ? | close | **une** — tranchée dès ton premier message : « hold et clos prenant l'avantage » ; c'est une substitution, pas une addition |
| 3 | Les MOTS écrits à côté du point | close | **renversée par le propriétaire** (24/09) : `Green` · `Amber` · `Red`, pas `nominal`/`à surveiller`/`en danger`. Ce sont les termes du métier — un chef de projet lit « Amber » comme un état, pas comme une couleur. Lues dans n'importe quelle casse, affichées dans l'orthographe canonique |
| 4 | `project-status` repeint-il les barres de `:::timeline` ? | close | **oui** (24/09) : la parole écrite gagne sur l'inférence. Correction au passage : `late` était en `--warning` (ambre), pas en rouge — la collision était ambre/ambre, et elle demeure (le mot du survol distingue) |
| 5 | Le contrôle en édition écrit-il à travers le document ou dans le fichier ? | close | v0.73.0 : par l'API document de `yaml`, comme l'éditeur de config ; ce qui n'est pas touché revient octet pour octet, un YAML illisible est refusé plutôt que « réparé » |
| 6 | La valeur quand le projet se clôt | **pris par défaut** (24/09) : gardée sur le fichier, simplement pas dessinée | à renverser d'un mot |
| 7 | Visible/modifiable en lecture aussi, ou en édition seulement ? | close | v0.73.0 : le ⚙ vit sur la bande de puces de l'ÉDITEUR — édition seulement, comme tu l'avais dit |

## Ce que v0.73.0 donne déjà, sans une ligne de code

Un champ déclaré dans `adestia-plugin.json`, pour un type revendiqué :

```json
"fields": {
  "project-management": {
    "health": { "kind": "choice", "label": "Health", "values": ["…"], "closed": true,
                "help": "…" }
  }
}
```

→ le contrôle apparaît dans le panneau des propriétés, l'écriture est sûre, et
un `fields` sur un type non revendiqué est refusé au chargement.

## Ce qui manque encore, et c'est exactement la moitié « couleur »

- `FieldSpec` dit quel CONTRÔLE un champ obtient ; il ne dit rien de ce à quoi
  une VALEUR ressemble une fois écrite. `couleur`, dont les valeurs SONT des
  teintes, sort aujourd'hui en `<select>` gris.
- `toneOf` ne connaît que les mots du cycle de vie : rien ne dessinerait une
  pastille `health` dans une ligne, une carte ou un entête.
- La précédence (hold et clos l'emportent) n'est écrite nulle part — et ce
  n'est pas du dessin, c'est la même nature de savoir qu'`isFinished`.

## Trouvé en construisant, hors chantier

- ~~**Les libellés de champ d'un plugin restent en anglais**~~ — **réglé par
  v0.74.0**, arrivée pendant ce chantier : la fabrique d'une facette rend
  `words` à côté du reste, et la coque dit les mots déclarés par le plugin
  avec. Le plugin traduit donc « Project status » → « Statut projet », sa
  phrase d'aide, la description de `:::subproject` et le nom de son groupe
  dans le formulaire. Le test croisé de `plugins/test/words.test.js` épingle
  les deux sens : rien de déclaré sans traduction, rien de traduit que
  personne ne dit.
- **Les VALEURS d'un menu ne sont toujours pas traduites**, et c'est délibéré
  ici plutôt qu'un manque : le formulaire rend les options telles quelles, et
  `Green`/`Amber`/`Red` sont ce que le fichier porte. Un menu qui proposerait
  « Vert » en écrivant `Green` mentirait sur ce qu'il s'apprête à écrire, et
  il faudrait ensuite que la pastille et le survol de la barre tranchent aussi.
  Le cœur n'a jamais eu le problème : ses propres vocabulaires de valeurs
  (`en cours`, `bloqué`, `rouge`…) sont déjà dans la langue du corpus.
- **Ambre veut deux choses sur un planning** : « en retard » (déduit d'une
  date) et « à surveiller » (écrit par le porteur). Le survol écrit le mot, ce
  qui tient la règle « la teinte n'est jamais l'étiquette » — mais à l'œil, sur
  le banc, deux barres ambre ne se distinguent pas.
