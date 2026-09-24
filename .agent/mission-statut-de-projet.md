# Chantier « statut de projet » — un second état, qui n'appartient qu'aux projets

> Un projet porte déjà un statut de cycle de vie (`en cours`, `bloqué`, `clos`)
> que le cœur lit pour tout le monde. Il lui manque une appréciation : est-ce
> que ça se passe bien. C'est un mot de projet, et il reste chez le plugin.
>
> Décidé avec le propriétaire, 24/09. Les questions et leurs réponses sont dans
> `questions-statut-de-projet.md`, à côté.

## Ce que le cœur donne déjà, et qu'on ne redemande pas

| Acquis | D'où | Ce que ça évite d'écrire |
|---|---|---|
| Un champ déclaré par le plugin, pour un type qu'il revendique, avec son contrôle dans le panneau des propriétés | `fields` du manifeste, v0.73.0 | tout le geste d'édition graphique : le contrôle, l'écriture sûre par l'API document de `yaml`, le refus si le type n'est pas revendiqué |
| Un nom de bloc que le cœur ne définit pas résout chez le plugin, partout dans l'instance, sans `from=` | `resolveBlock` | une mention `from=project-management` sur chaque page |
| La puce de statut colorée dans une ligne de `:::list` | livré ce matin (`f57db61`) | le cas du cycle de vie, déjà réglé |

## La forme retenue : un bloc dédié, pas une prise dans le dessin du cœur

Une prise où le cœur demanderait au plugin la part qu'il est seul à savoir a
été **écartée par le propriétaire**, et l'argument est le bon : une prise est
un contrat, et un contrat qui traverse le dessin d'une carte oblige à tester
l'évolution de cette carte contre tous les plugins — y compris ceux qu'on ne
maîtrise pas. On veut un rendu propre à un plugin : on fait un bloc à lui.

```markdown
:::subproject{depth=children}
:::
```

**Ce que le bloc mutualise avec `:::timeline`**, et c'est ce qui rend le bloc
dédié bon marché ici — le plugin possède déjà la moitié du travail, écrite et
testée dans `web/model.js` :

- `under(path, base, depth)` — la même marche que `:::list{source=children}`,
  donc un planning, une liste de sous-chantiers et le cœur ne se disputent
  jamais sur ce que « en dessous » veut dire ;
- `fromPages(pages, base, depth)` — l'éligibilité et les entrées, lues dans
  l'index que la coque tient déjà ;
- `classify(entry, today)` — l'état d'une entrée, et surtout la règle « le
  workflow gagne quand il a parlé », qui est déjà la forme de la précédence
  qu'on cherche.

Ce que le bloc n'hérite pas de `:::list` — `pull` de champs libres, digests
`content:`, `source=files`, les trois `view` — il n'en a pas besoin : une
ligne de sous-projet est une ligne de sous-projet, pas une ligne de page.

## Le champ

`project-status`, déclaré dans le manifeste pour le type `project-management`,
valeurs `Green` · `Amber` · `Red`, `closed: true` — les termes du métier,
choisis par le propriétaire contre une proposition écrite en toutes lettres.
La règle de la maison n'est pas enfreinte : ce qu'elle interdit, c'est une
teinte SANS mot à côté. Ici le mot est écrit ; il se trouve simplement que le
mot de ce métier pour cet état est un nom de couleur.

**La précédence, et c'est la règle du plugin, écrite dans son code** : le
cycle de vie parle d'abord. Un projet en attente ou clos montre son statut de
cycle de vie ; un projet en cours montre son `project-status` s'il en porte
un, et son statut sinon. Une seule puce par ligne : deux obligeraient le
lecteur à se demander laquelle gagne.

Les deux vocabulaires restent **disjoints** — aucun mot ne peut être écrit
dans les deux champs — pour que la règle soit lisible dans le fichier sans la
connaître.

## La couleur : les tokens SÉMANTIQUES, jamais les teintes décoratives

Vérifié plutôt que supposé, et ça renverse le réflexe : les teintes nommées
(`--adestia-hue-rouge`, `--adestia-hue-ambre`, `--adestia-hue-vert`) sont
**décoratives**, et un skin a le droit de les aplatir — Skippy écrase les dix
teintes sur un seul ambre, parce que c'est son identité de HUD monochrome. Un
vert, un ambre et un rouge posés là-dessus seraient **trois fois la même
couleur** sur cette instance.

Les tokens sémantiques, eux, restent distincts dans les trois skins livrés :

| | base | alfred | nestor | skippy |
|---|---|---|---|---|
| `--danger` | `#d24b3e` | hérité | `#c4402c` | `#e8543f` |
| `--warning` | `#b4771b` | hérité | `#b4771b` | `#f2a93b` |
| `--success` | `#2e9e63` | hérité | `#2e9e63` | `#3fbf86` |

Donc : `red → var(--danger)`, `amber → var(--warning)`, `green →
var(--success)`. Un skin qui voudrait les distinguer autrement surcharge ces
trois tokens — ce qu'il sait déjà faire — et le plugin n'expose pas de
palette à lui. **Un skin ne peut de toute façon pas viser une classe du
plugin** : son contrat est « des tokens et des crochets étroits, jamais de
règle structurelle ».

Et la règle qui ne bouge pas : **la teinte n'est jamais l'étiquette**. La puce
écrit un mot à côté du point.

## Ce qui n'est PAS dans ce chantier

- **Les cartes d'étagère et les puces d'entête d'une page.** Ce ne sont pas des
  blocs ; un bloc dédié ne les atteint pas. Un projet noté rouge sera donc en
  couleur dans un `:::subproject` et en statut de cycle de vie sur la carte qui
  ouvre son dossier. C'est le prix assumé du bloc dédié, et il est réversible :
  le jour où ça gêne, c'est un chantier « prise à puces », pas une reprise de
  celui-ci.
- Aucune nouvelle facette de contribution, aucun registre générique de barèmes.
- Aucun historique du `project-status` (pas de tendance, pas de « rouge depuis
  trois semaines ») : un fichier tient un état, pas une série.
- Aucun pourcentage d'avancement à côté — la skill l'interdit déjà deux fois.

## Les pas, dans l'ordre — un pas, une décision, un banc

1. **Le champ.** `project-status` déclaré dans `adestia-plugin.json`, la skill
   du plugin dit quand l'écrire. Rien à coder : le formulaire des propriétés le
   dessine. Vérifié au banc, panneau ouvert sur une page de projet.
2. **L'état, dans `model.js`.** Une fonction pure qui prend les champs d'une
   page et rend la puce à dessiner — le mot, le ton — en appliquant la
   précédence. Testée par `node --test`, à côté de `classify`.
3. **Le bloc.** `:::subproject`, déclaré dans le `vocabulary` du manifeste,
   dessiné dans `web/blocks.js`, nourri par `under` / `fromPages`. Le CSS dans
   `web/pm.css`, sur les trois tokens sémantiques.
4. **Le banc**, clair et sombre, et sur le skin Skippy — c'est lui qui prouve
   que le choix des tokens tient.
5. **La skill** du plugin : quand écrire `project-status`, et ce que le bloc
   montre.

## Tranché en construisant

- **La timeline repeint**, décidé par le propriétaire : la parole écrite gagne
  sur l'inférence. Un `project-status` déclaré l'emporte sur ce que le
  calendrier déduit ; le calendrier ne colore que ce que personne n'a noté.
  *Correction au passage :* `late` était dessiné en `--warning`, donc en ambre
  et pas en rouge comme je l'ai d'abord écrit. La collision existe quand même —
  ambre contre ambre — et elle reste : le mot du survol distingue « en retard »
  de « Amber », mais deux barres ambre ne se distinguent pas à l'œil.
- **La valeur est gardée** quand le projet se clôt, simplement pas dessinée.
- **Le cycle de vie l'emporte aussi sur la BARRE**, ce qui n'était pas dans le
  plan : le banc a montré un projet bloqué portant « Green » dessiné en barre
  verte sous une ligne disant « bloqué ». Une page qui dit deux choses d'un
  même projet est exactement ce que partager la marche devait empêcher.

## Ajouté au cœur, et pourquoi c'était nécessaire

`/api/pages/index` publie `tone` à côté de `finished`. Même raison que celle
déjà écrite pour `finished` : un plugin peut n'importer que React, et
l'alternative est une copie de la table du moteur dans chaque plugin qui
dessine un état. `finished` ne suffisait pas — « en attente » et « en cours »
sont tous deux non finis, et c'est la distinction dont la précédence a besoin.
