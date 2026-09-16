# Chantier « concepts » — le code rapproché de ce que la conception dit aujourd'hui

> Suite de la refonte structurelle (v0.58.0), qui a déplacé sans changer. Ici on
> change : la logique doit coller aux concepts tels qu'ils sont, pas tels qu'ils
> étaient quand chaque bout a été écrit. Chaque pas est une décision du
> propriétaire, vérifiée au banc.

## Le glossaire : la conception d'un côté, le code de l'autre

| Concept | Ce que dit la conception (et depuis quand) | Ce que dit le code | Écart |
|---|---|---|---|
| **Tour** | Un JOB détaché de la requête HTTP, tenu par le bureau des tours du serveur ; le flux SSE n'est qu'un abonné (27/08). Un tour a des PARTIES, une partie = un message stocké (28/08). Un message posté pendant un tour est retenu côté serveur et part en UN tour fusionné (27/08). | `TurnDesk`, `TurnJob`, `TurnSpec`, `TurnOutcome`, `TurnPart` — cohérent. | Aucun côté serveur. |
| **Un seul point de lancement** | « Chaque tour — chat, planifié, délégué — passe par un seul point de lancement » (en-tête du serveur, contrat pilote). | Un chemin depuis le pas 2 (15/09) : `runUnattended` admet un job LIBRE au bureau (`unattended: true`, refus si la maison est pleine) ; l'ancre n'est posée qu'une fois, par le bureau. | Résolu. |
| **Fil et session moteur** | La session moteur est celle du FIL : le bureau la lit dans le fichier du fil au moment de lancer, et ignore celle que le navigateur nomme (14/09). Le brouillon crée son fil avant le premier message (27/08). | Depuis le pas 2 (15/09) : le chemin « tour sans fil » de `/api/turn` est NOMMÉ — la question éphémère, mode « éphémère » de la barre de parité, que la coque n'offre pas encore ; le repli `sessionId` de `turnKey`/`stop` est l'adresse de ce tour-là. Le web n'envoie plus de session moteur et ne part plus sans fil : un fil impossible à créer est dit sous le message. | Résolu. |
| **Le client, projection du serveur** | « Le front ne PORTE plus la file, il l'AFFICHE » (27/08) ; quand un flux meurt, le navigateur relit le fil depuis le magasin, qui tient ce qui a fini (14/09). | Depuis le pas 1 (15/09) : une seule règle dans `useSessions` — après tout tour, fini ou perdu, relire le fil au magasin, puis se rattacher s'il en court un (les retenus partent en tour de suite). Plus de classement local ni de promotion des bulles retenues ; quand le magasin ne répond pas, l'onglet garde ce qu'il a dessiné, avec l'erreur. | Résolu. |
| **Session** (le mot) | Un seul sens dans la conception : la session moteur du fil. | Depuis le pas 3 (15/09) : la session moteur (`sessionId`, la ligne `session` du fil) ; ce qu'un onglet porte s'appelle `OpenConversation` (`useConversations`) ; le flux d'armement `ArmingFlow` ; la session de connexion garde le mot du web (`SESSION_COOKIE`, `sessionSecret` — un contrat, pas un concept d'Adestia). | Résolu — une exception nommée, la session de connexion. |
| **Fil** (le mot) | « thread » dans la conception ; « conversation » dans l'API. | Depuis le pas 3 (15/09) : « conversation » partout — code, commentaires, classes CSS, conception (`DESIGN.md`) ; « thread » ne reste que là où c'est le mot d'un moteur (Codex) ou de l'outillage du banc. | Résolu. |
| **Posture** | `open` / `ask` ; Adestia ne juge rien, elle relaie la question du moteur (26/08 v2) ; la couche de permissions a été retirée (26/08 v1), le bloc `permissions:` de config est toléré. | `permissions.mode` (config), `AskDesk`/`PendingAsk` (guichet), `permission-request` (événement), `interactivePermissions` (capacité), `/api/permission` (route), `scrubAsk`. | Trois familles de mots (permission, ask, posture) pour un concept. Acceptable si chacune garde un sens précis ; à vérifier au cas par cas, et retirer la tolérance du vieux bloc `permissions:` si plus aucune instance ne le porte. |
| **Domaine** | Une seule espèce de chose ; où il se matérialise et qui le dessine sont des propriétés (01/09). Un plugin existe quand il apporte un affichage que le cœur n'a pas. `collections` ne devrait pas être un plugin : « devient un type rendu par le cœur, avec `into:` » (01/09). | Depuis le pas 5 (16/09) : `type: collection` est dessiné par le cœur (`app/Collection.tsx`, habits de la section), `into:` demande un membre à l'agent, la skill est celle du cœur ; `plugins/collections` est retiré. | Résolu. |
| **Propriété d'un dossier** | Échelle (10/09, validée dans un fichier de questions) : dossier revendiqué par `app:` à la racine, héréditaire ; sinon la page d'index dit quelque chose ; sinon l'étagère. « Une déclaration bat un nom : `absorbs` survit, `holds` devient inutile sur un dossier déclaré. » | `owners.ts` : `declaredApp` + `claim` par route + `absorbs` + `holds?()` du contrat (`HoldsFolder`) + `routeFor` du plugin, empilés en échelle. | Depuis le pas 4 (15/09) : la règle `app:` est écrite dans `DESIGN.md` à côté d'`absorbs` et `holds`, telle que le code la fait (niveau 0, héréditaire, écart signalé par `strayApp`, échelle déclaré > nom > page unique > étagère). `holds` reste : deux plugins l'implémentent encore pour leurs dossiers revendiqués par nom ; il n'est pas lu sur un dossier déclaré, et la conception le dit. | Résolu. |
| **Magasins** | Une mémoire composée de plusieurs endroits ; le magasin est un qualificatif d'adresse, jamais une partie du nom (05/09). | `resolveStores`, `pagesService`, `?store=` — cohérent. | Aucun. |
| **Délégation** | Un canal : même bureau, même magasin, sa propre famille de clés et son espace par appelant (06/09). Le rappel n'est pas un ask. | `DelegationChannel`, `registerMcp`, `registerCallback` — cohérent. | Aucun. |

## Ce qui n'est pas dans ce chantier

Les plugins (26 000 lignes de JS sans lint ni typecheck), les pilotes (flux de
connexion à mutualiser), les commentaires menteurs hors des zones ci-dessus.
Chacun est un chantier à part.

## Les pas, dans l'ordre — un pas, une décision, un banc

1. **Le chat, projection du serveur** — fait (15/09). Réécrire `useSessions` autour d'une règle :
   le fil affiché est ce que le magasin tient, plus le tour en cours reçu en
   direct. Fin ou perte d'un tour → relire le fil, se rattacher si un tour
   court. Les bulles retenues restent un affichage (le magasin les a déjà). Le
   classement local des parties disparaît sauf hors ligne. Comportement visible
   à décider : ce qu'on montre quand le magasin ne répond pas.
2. **Un seul point de lancement.** Les tours sans surveillance (horloge,
   rappel) passent par le bureau avec `unattended: true`, en jobs libres ;
   l'ancre n'est posée qu'une fois. Le tour sans fil est gardé et nommé (la
   question éphémère) ; le web ne l'emprunte plus. — fait (15/09).
3. **Les mots.** Un seul sens pour « session », un seul mot pour le fil ; les
   renommages sont sûrs (le compilateur les tient), l'API HTTP ne bouge pas.
   — fait (15/09).
4. **Le journal de conception rattrapé** : la règle `app:` du 10/09, écrite là
   où elle manque ; le sort de `holds`. — fait (15/09), avec l'entrée du
   journal qui raconte le chantier.
5. **`collections` rendu par le cœur** — d'abord laissé hors chantier, puis
   ouvert sur le mot du propriétaire (16/09) et fait : mise en page du cœur
   pour `type: collection`, `into:`, skill du cœur, plugin retiré.

## Questions en vol
Voir `questions-concepts.md`.
