# Questions — chantier todo v2

> Fichier de travail. Une question par ligne d'état : **ouverte**, **répondue**,
> ou **caduque**. Les maquettes qui les portent :
> https://claude.ai/code/artifact/0b688c46-a21f-46df-8bc4-0c8bd0c3de30

## Ouvertes — sept, dont une bloque l'implémentation

### Q1 — Le store partagé, c'est quoi exactement ?
**Posée le 07/09, toujours sans réponse.** Plusieurs instances Adestia (une par
personne, chacune son agent, un dossier commun) — ou une seule instance que
plusieurs comptes ouvrent ?

Ce qu'elle décide : la clé `me:` de `todo-config`. Sur une instance qui
authentifie vraiment, `/api/instance` sert déjà l'identité et la clé ne sert à
rien ; en `auth: none` l'identité vaut `local` et ne dit rien, donc la clé est
la seule réponse. Les maquettes supposent la première hypothèse.

### Q3 — Les deux mots neufs
`start:` (recommandé — iCal `DTSTART`, MS Graph ; ferme la question ouverte nº 4
de la lettre de mission chantiers) et `assignee:` (recommandé — GitHub, Jira ;
`owner:` écarté parce qu'un store partagé parle déjà de propriétaire POSIX).

### Q4 — Le mot `personne` appartient-il à `todo` ?
Reco : livrer `assignee:` **sans** annuaire (handles découverts comme les
domaines, teinte dérivée). La page `type: personne` attend la couche d'identité
du plugin chantiers plutôt que d'être revendiquée ici.

### Q5 — Les marqueurs 📝 et 📎 dans la liste
L'index publie le frontmatter, pas le corps ni les fichiers voisins. Reco : un
booléen « cette page a un corps » sur l'entrée d'index (coût nul, le markdown y
est déjà lu) ; pas de marqueur 📎 tant que ça coûterait N requêtes.

### Q6 — Qui crée le dossier d'une tâche qui porte des fichiers ?
Reco : l'agent, au moment où il classe le premier fichier. La capture rapide
continue d'écrire un fichier plat.

### Q7 — Une bande de pièces jointes, ou deux ?
Fichiers du dossier et fichiers cités ailleurs. Reco : une seule bande, deux
marques.

### Q8 — Donner sa page au bloc ?
`BlockProps` ne porte ni `path`, ni `store`, ni `fields` ; `LayoutProps` a les
trois. Sans eux la portée par défaut passe par `locate('.')` — qui rend `.`
pour une page à la racine — et le rattrapage par `projet:` est impossible.
Reco : les ajouter, avec les mots du layout.

## Répondues

### R3 — Un bloc dédié, pas `list{from=tasks}` (08/09)
Tranché par le propriétaire : **un rendu porté par `todo`**, qui affiche ET
coche ET ajoute. Nommé par ce qu'on y fait, puisque c'est le critère écrit la
veille — « what separates two renderings is what you can DO in them » :
**`:::checklist`**. Pas `:::todo`, qui nommerait un sujet.

Le prix est accepté d'avance : un bloc contribué disparaît avec son plugin,
donc todo éteint, une page qui en porte un ouvre en lecture seule avec un
diagnostic. C'est ce qui a été mesuré le 06/09 sur trois pages de voyage sans
`parcours`, et c'est pour l'éviter que les rendus génériques sont restés dans
le cœur. Ici il n'y a rien d'honnête à dessiner sans le plugin : une case qui
écrit dans un autre fichier EST un contrat avec lui.

Attributs : `page`, `view`, `assignee`, `dom`, `projet`, plus les deux
transverses du cœur — `depth` (`self` · `children` · `subtree`, défaut
`subtree`) et `w`. Ne pas réinventer `deep` : `depth` existe.

### R1 — La portée du bloc (08/09)
Sans attribut : le dossier de la page qui porte le bloc, et ses sous-dossiers.
Avec une référence de page : la même logique depuis le dossier de la page visée.
**Chemin logique, pas système de fichiers** — donc le multi-store remonte.

Vérifié : c'est gratuit. Un chemin logique ne contient jamais le store, et
`/api/pages/index` rend les chemins logiques de tous les stores ; filtrer sur un
préfixe donne l'union. `ctx.base` vaut déjà le dossier logique de la page. Rien
à étendre de ce côté — l'extension nécessaire est Q8.

### R2 — La langue des clés (08/09)
Une clé de frontmatter suit la langue du contrat de son plugin. La skill de
`todo` est en anglais → `assignee:`, `me:`. Les *valeurs* restent le vocabulaire
du corpus (`type: tache`, `dom: atelier`).
