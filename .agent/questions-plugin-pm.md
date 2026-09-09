# Questions en vol — chantier plugin-pm

## 1. Fusion de `blocs-en-tete` (title=/ico= sur content)
- **État : posée, en attente.** Posée une première fois à la fin du chantier,
  reposée à l'ouverture de celui-ci (09/09).
- Reco donnée : fusionner et pousser sans tag ; le commit montera dans la
  prochaine version. Les deux chantiers sont indépendants (le plugin n'est que
  des fichiers neufs + une extension du contrat des blocs contribués).
- Réponse : —

## 2. Lot 2 de la timeline — portée requête (`depth=children|subtree`)
- **État : pas encore posée.** Sera présentée à la fin du lot 1.
- Le filtre d'éligibilité de la lettre (« les types qui ont un workflow
  déclaré ») exige `pm-config` (racines + workflows par type), qui reste à
  concevoir — question ouverte nº 1 de la lettre.
- Décision prise en attendant (annoncée, pas demandée) : lot 1 sans attribut
  `depth` du tout — pas d'attribut déclaré qui ne dessine rien.

## 3. `kind` du plugin — feature ou app (dormante)
- **État : non posée, ne bloque pas le lot 1.** `timeline` est un nom NEUF :
  la résolution des features suffit. La question ne mord que le jour des
  surcharges (`table{type=risques}`, contributeurs) : une app surcharge
  implicitement dans son domaine, une feature exige `from=` sur chaque page.
  Or le plugin n'a pas de domaine statique (les racines viendront de
  `pm-config`). À arbitrer avec le lot 2.
