# Questions en vol — chantier plugin-pm

## 5. Ouvrir un dossier — CLOSE le 10/09, et par une meilleure règle
- Ma question portait sur un SEUIL (« la page dit-elle quelque chose ? »), avec
  une heuristique sur le contenu. Le propriétaire l'a remplacée par un
  **compte**, qui ne demande aucun jugement :

  | fiches `type: projet` **directement** dans le dossier | ce qui s'ouvre |
  |---|---|
  | 0 | la vue classique, en cartes |
  | 1 | **la vue projet** — cette fiche |
  | plus d'une | la vue classique : c'est une étagère DE projets, pas un projet |

- Ce que ça achète : rien à déclarer sur le dossier, rien à juger sur le
  contenu, et la distinction « un projet » / « un dossier de projets » tombe
  toute seule.
- Conséquence : le plugin déclare **un** type, `projet`, et **rien d'autre** —
  pas de `layouts`. Son seul rôle est de décider la vue par défaut ; la fiche
  reste dessinée par le lecteur du cœur avec ses blocs.
- Reste `app:` (point 4b) pour la PROPRIÉTÉ du domaine — c'est ce qui fait
  résoudre les blocs du plugin sans `from=`. Les deux ne font pas le même
  travail et se composent.

## 4b. Spec validée le 10/09 — à coder d'un bloc (les deux ensemble)
Échelle de résolution à l'ouverture d'un dossier :
1. dossier revendiqué par un plugin → l'écran du plugin ;
2. sinon, sa page d'index dit quelque chose → cette page ;
3. sinon → l'étagère, comme aujourd'hui.

La revendication : `app: <id>` dans l'entête de l'index du dossier.
- **niveau 0 seulement** (enfant direct de la racine mémoire), **héréditaire** ;
- une déclaration plus profonde → **avis visible**, jamais un silence ;
- un `app:` nommant un plugin absent/éteint → avis visible + étagère ;
- une déclaration **bat** un nom : `absorbs` survit pour les plugins qui
  possèdent leur mot, et `holds` devient inutile sur un dossier déclaré.
- Risque « niveau 0 » **écarté par le propriétaire** : `domaines/voyages`
  n'était pas une imbrication mais une racine mal placée, depuis corrigée.

Quel fichier lire : **ne rien réinventer** — `INDEX.md` ou la page homonyme,
la réponse que `sections.ts` porte déjà (sa première version, plus
principielle, cachait douze dossiers d'un vrai corpus).

## 1. Fusion de `blocs-en-tete` (title=/ico= sur content)
- **État : posée, en attente.** Posée une première fois à la fin du chantier,
  reposée à l'ouverture de celui-ci (09/09).
- Reco donnée : fusionner et pousser sans tag ; le commit montera dans la
  prochaine version. Les deux chantiers sont indépendants (le plugin n'est que
  des fichiers neufs + une extension du contrat des blocs contribués).
- **Réponse : fusionné, tagué v0.53.0 et poussé le 10/09**, branche rebasée.

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
