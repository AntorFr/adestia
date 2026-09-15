# Chantier « concepts » — le code rapproché de ce que la conception dit aujourd'hui

> Suite de la refonte structurelle (v0.58.0), qui a déplacé sans changer. Ici on
> change : la logique doit coller aux concepts tels qu'ils sont, pas tels qu'ils
> étaient quand chaque bout a été écrit. Chaque pas est une décision du
> propriétaire, vérifiée au banc.

## Le glossaire : la conception d'un côté, le code de l'autre

| Concept | Ce que dit la conception (et depuis quand) | Ce que dit le code | Écart |
|---|---|---|---|
| **Tour** | Un JOB détaché de la requête HTTP, tenu par le bureau des tours du serveur ; le flux SSE n'est qu'un abonné (27/08). Un tour a des PARTIES, une partie = un message stocké (28/08). Un message posté pendant un tour est retenu côté serveur et part en UN tour fusionné (27/08). | `TurnDesk`, `TurnJob`, `TurnSpec`, `TurnOutcome`, `TurnPart` — cohérent. | Aucun côté serveur. |
| **Un seul point de lancement** | « Chaque tour — chat, planifié, délégué — passe par un seul point de lancement » (en-tête du serveur, contrat pilote). | Deux chemins : le bureau (`desk.admit`) et `runUnattended` (l'horloge, le rappel MCP) qui appelle le pilote directement. L'ancre « la coque se présente » a dû être posée aux deux endroits (07/09). | **Le code contredit la phrase.** Soit les tours sans surveillance passent par le bureau, soit la phrase dit « deux ». |
| **Fil et session moteur** | La session moteur est celle du FIL : le bureau la lit dans le fichier du fil au moment de lancer, et ignore celle que le navigateur nomme (14/09). Le brouillon crée son fil avant le premier message (27/08). | La route `/api/turn` garde un chemin « tour sans fil » qui prend la session de la requête ; `turnKey` a un repli sur `sessionId` ; `/api/turn/stop` aussi. Le web ne l'emprunte que si la CRÉATION du fil a échoué (magasin muet) : il envoie alors le tour sans fil, avec la session du navigateur. | **Un mode dégradé sans nom.** Soit un tour exige un fil (et l'échec de création est une erreur affichée), soit le mode dégradé est nommé et voulu. À trancher : un tour exige un fil, ou le chemin sans fil est une affordance d'API à garder et à nommer. |
| **Le client, projection du serveur** | « Le front ne PORTE plus la file, il l'AFFICHE » (27/08) ; quand un flux meurt, le navigateur relit le fil depuis le magasin, qui tient ce qui a fini (14/09). | `useSessions` : une pompe par onglet avec trois replis (flux perdu → relire ; retenus sans rien à rejoindre → relire ; sinon classer localement les parties du tour en messages), des bulles retenues promues à la main, des refs qui doublent l'état. | **La logique locale de classement duplique ce que le magasin fait déjà.** Cible : après tout tour (fini ou perdu), relire le fil et se rattacher s'il court ; ne classer localement que hors ligne. |
| **Session** (le mot) | Un seul sens dans la conception : la session moteur du fil. | Cinq sens dans le code : session moteur (`sessionId`), session d'onglet (`TabSession`, `useSessions`), session d'armement (`ArmingSession`), session OIDC (`SESSION_COOKIE`), session de connexion MCP. | **Un mot pour cinq choses.** Renommer ce qui n'est pas la session moteur : `TabView`/`useThreads`, `ArmingFlow`, `SignInCookie`… |
| **Fil** (le mot) | « thread » dans la conception ; « conversation » dans l'API. | `ConversationStore`, `/api/conversations`, `openThread`, `DelegationThread`, `threads`… | Deux mots pour une chose. Choisir, et renommer l'autre (l'API reste, c'est un contrat). |
| **Posture** | `open` / `ask` ; Adestia ne juge rien, elle relaie la question du moteur (26/08 v2) ; la couche de permissions a été retirée (26/08 v1), le bloc `permissions:` de config est toléré. | `permissions.mode` (config), `AskDesk`/`PendingAsk` (guichet), `permission-request` (événement), `interactivePermissions` (capacité), `/api/permission` (route), `scrubAsk`. | Trois familles de mots (permission, ask, posture) pour un concept. Acceptable si chacune garde un sens précis ; à vérifier au cas par cas, et retirer la tolérance du vieux bloc `permissions:` si plus aucune instance ne le porte. |
| **Domaine** | Une seule espèce de chose ; où il se matérialise et qui le dessine sont des propriétés (01/09). Un plugin existe quand il apporte un affichage que le cœur n'a pas. `collections` ne devrait pas être un plugin : « devient un type rendu par le cœur, avec `into:` » (01/09). | `plugins/collections` existe toujours, kind `app`, avec sa vue. | **Conséquence écrite et non faite.** Chantier produit à part entière. |
| **Propriété d'un dossier** | Échelle (10/09, validée dans un fichier de questions) : dossier revendiqué par `app:` à la racine, héréditaire ; sinon la page d'index dit quelque chose ; sinon l'étagère. « Une déclaration bat un nom : `absorbs` survit, `holds` devient inutile sur un dossier déclaré. » | `owners.ts` : `declaredApp` + `claim` par route + `absorbs` + `holds?()` du contrat (`HoldsFolder`) + `routeFor` du plugin, empilés en échelle. | **La règle du 10/09 n'est pas dans le journal de conception** (seul `holds` y est, 07/09). Et `holds` n'est plus utile qu'aux dossiers non déclarés — à documenter ou à retirer. |
| **Magasins** | Une mémoire composée de plusieurs endroits ; le magasin est un qualificatif d'adresse, jamais une partie du nom (05/09). | `resolveStores`, `pagesService`, `?store=` — cohérent. | Aucun. |
| **Délégation** | Un canal : même bureau, même magasin, sa propre famille de clés et son espace par appelant (06/09). Le rappel n'est pas un ask. | `DelegationChannel`, `registerMcp`, `registerCallback` — cohérent. | Aucun. |

## Ce qui n'est pas dans ce chantier

Les plugins (26 000 lignes de JS sans lint ni typecheck), les pilotes (flux de
connexion à mutualiser), les commentaires menteurs hors des zones ci-dessus.
Chacun est un chantier à part.

## Les pas, dans l'ordre — un pas, une décision, un banc

1. **Le chat, projection du serveur.** Réécrire `useSessions` autour d'une règle :
   le fil affiché est ce que le magasin tient, plus le tour en cours reçu en
   direct. Fin ou perte d'un tour → relire le fil, se rattacher si un tour
   court. Les bulles retenues restent un affichage (le magasin les a déjà). Le
   classement local des parties disparaît sauf hors ligne. Comportement visible
   à décider : ce qu'on montre quand le magasin ne répond pas.
2. **Un seul point de lancement.** Les tours sans surveillance (horloge,
   rappel) passent par le bureau avec `unattended: true`, dans leur propre
   famille de clés ; `runUnattended` disparaît, l'ancre n'est posée qu'une fois.
   Puis trancher le tour sans fil.
3. **Les mots.** Un seul sens pour « session », un seul mot pour le fil ; les
   renommages sont sûrs (le compilateur les tient), l'API HTTP ne bouge pas.
4. **Le journal de conception rattrapé** : la règle `app:` du 10/09, écrite là
   où elle manque ; le sort de `holds`.
5. **`collections` rendu par le cœur** — chantier produit, à cadrer avec le
   propriétaire, pas décidé ici.

## Questions en vol
Voir `questions-concepts.md`.
