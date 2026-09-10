# Questions en vol — chantier plugin-pm

## 1. Fusion de `blocs-en-tete` (title=/ico= sur content)
- **État : posée, en attente.** Posée une première fois à la fin du chantier,
  reposée à l'ouverture de celui-ci (09/09).
- Reco donnée : fusionner et pousser sans tag ; le commit montera dans la
  prochaine version. Les deux chantiers sont indépendants (le plugin n'est que
  des fichiers neufs + une extension du contrat des blocs contribués).
- Réponse : —

## 2. Portée requête de la timeline — CLOSE le 10/09, et mal ouverte
- **État : close.** Elle n'aurait jamais dû être une question : je l'ai posée
  comme un blocage alors que c'était une décision de produit que j'ai prise
  seul. L'index publiait déjà `fields`, la marche vers les enfants existait,
  et « une page sans date ne dessine rien » suffit comme filtre.
- Livré : `depth=children|subtree`, barres cliquables, clos / en retard /
  échu. Le filtre fin (`pm-config`, les types qui ont un workflow) reste à
  faire et la skill le DIT plutôt que de le taire.

## 4. Rôles et contributeurs — CLOSE le 10/09
- `:::list{view=chips}`, écrite. Le raisonnement qui perdait était le mien :
  j'ai défendu `content` pour du rédigé ; la règle est que `content` veut dire
  texte NON STRUCTURÉ, et des lignes `Rôle: Personne` sont des rangées.
- Reste ouvert et non demandé : il n'y a pas d'annuaire. Les initiales sont
  dérivées du nom ; un vrai visage / une vraie fiche demanderait un
  `type: personne`, que `todo` n'a délibérément pas revendiqué.

## 3. `kind` du plugin — feature ou app (dormante)
- **État : non posée, ne bloque pas le lot 1.** `timeline` est un nom NEUF :
  la résolution des features suffit. La question ne mord que le jour des
  surcharges (`table{type=risques}`, contributeurs) : une app surcharge
  implicitement dans son domaine, une feature exige `from=` sur chaque page.
  Or le plugin n'a pas de domaine statique (les racines viendront de
  `pm-config`). À arbitrer avec le lot 2.
