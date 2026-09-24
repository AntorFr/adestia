# Questions — chantier statut de projet

> Une question vivante à la fois ; les autres attendent leur tour, dans l'ordre.
> Worktree `statut-de-projet`, branche `worktree-statut-de-projet`, rebasée sur
> `main` à v0.73.0 (l'édition du frontmatter par formulaire).

| # | Question | État | Réponse |
|---|---|---|---|
| 0 | La pastille colorée pour `pull=status` dans `:::list` | close | oui (24/09) — livrée, banc regardé clair + sombre |
| 1 | ~~Qui porte le vocabulaire Vert/Ambre/Rouge~~ → reformulée en 1bis | close | v0.73.0 : le manifeste porte la **déclaration** (`fields`, par type revendiqué). Reste la couleur et la précédence. |
| 1bis | Où vivent la **couleur** et la **règle de précédence** : un mot `health` connu du cœur (`status.ts`, à côté de `isFinished`), ou un mécanisme générique de « champ noté » que n'importe quel plugin allume ? Le fait qui fait basculer : d'autres barèmes en vue (registre de risques, ops) ou cas isolé ? | **vivante** | — |
| 2 | Une pastille ou deux ? Substitution (le cycle de vie parle, sinon la météo) ou les deux côte à côte sur la page du projet ? | en attente | — |
| 3 | Le nom du champ et les MOTS écrits à côté du point (`vert`/`ambre`/`rouge` se lisent mal en français pour un projet ; `nominal` / `à surveiller` / `en danger` disent quelque chose) | en attente | — |
| 4 | La météo repeint-elle les barres de `:::timeline` ? Piège : le rouge y veut déjà dire « en retard » (`classify`), et deux sens pour une couleur sur un même dessin | en attente | — |
| 5 | Le contrôle en édition écrit-il à travers le document ou dans le fichier ? | close | v0.73.0 : par l'API document de `yaml`, comme l'éditeur de config ; ce qui n'est pas touché revient octet pour octet, un YAML illisible est refusé plutôt que « réparé » |
| 6 | Quand le projet quitte « en cours » : la valeur écrite est **gardée** sur le fichier et simplement pas dessinée, ou effacée ? | en attente | — |
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
