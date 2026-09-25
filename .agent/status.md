# Status — Adestia
> MàJ : 2026-09-25

**État :** `main`, **v0.75.0** taguée et non déployée ; **v0.74.0** déployée
sur les trois corps le 24/09 —
8 plugins actifs sur 10 chez Alfred, 9 sur 12 chez Skippy (dont `dev-flow` et
`sdlc-console`, tirés de `homelab-sdlc-core` v0.4.1), 2 sur 10 chez Nestor,
aucun avis au démarrage. Six versions d'un coup : les corps servaient encore
0.68.0 (0.69.0 pour Skippy), et tout ce qui a été taggé depuis le 20/09
attendait dans `k8s-home-lab`. Aucune clé de configuration nouvelle sur le
saut — les trois manifestes n'ont bougé que d'un numéro.

v0.69.0 : **`dev-flow` quitte l'image**. Il vit dans
`AntorFr/homelab-sdlc-core` (tag `v0.1.0`), à côté de l'outillage dont il lit
les fiches, et Skippy le récupère par `extensions.sources` — premier usage réel
du mécanisme, et il valide une forme qui n'était que dessinée : une racine qui
n'est PAS un plugin, dont `bin/`, `cmd/` et `internal/` sont ignorés sans un
mot, et qui porte DEUX plugins (`sdlc-console` arrive avec, non allumé).
L'image livre dix plugins, plus onze. Déployée le 24/09.

v0.70.0 : **le fil d'Ariane ne dit plus deux fois le même nom**. Un dossier
qui ne tient qu'une fiche du type réclamé par son plugin s'ouvre SUR cette
fiche — dossier et page sont un seul écran — et le bandeau dessinait les deux
marches : le titre écrit deux fois, le premier exemplaire étant un lien vers
l'écran déjà ouvert, donc un clic qui ne faisait rien. La marche du dossier
saute (`opensOn`, qui interroge `folderRoute` et relit la réponse par
`pageAddress` plutôt que de recopier la règle : `/page/<dossier>` et
`/page/<page>` s'écrivent différemment et nomment le même fichier). Le cas
jumeau — un dossier que personne ne possède, dont on lit l'aperçu — se corrige
à l'envers : la marche mène à l'étagère, un vrai second écran, donc c'est le
LIBELLÉ qui cède et le dossier porte son propre nom. Signalé par
l'utilisateur sur une fiche `project-management`. Scénario de banc :
`fil-ariane-fiche`. Déployée le 24/09.

v0.71.0 : **les réglages de l'instance s'éditent depuis le navigateur**
(Réglages › Configuration). Le clic écrit `adestia.config.yaml` LUI-MÊME — pas
de surcouche, le fichier reste la seule source de vérité — et garde tous les
commentaires : l'API document de `yaml` réimprime ce qu'on ne lui a pas demandé
de changer, et les `${VAR}` ne sont jamais substitués. Un catalogue dans
`schemas` déclare chaque réglage (sorte de contrôle, libellé, aide, bornes,
à chaud ou au redémarrage) ; le serveur valide contre lui et l'écran s'y
dessine. Le champ dit si la valeur vient du fichier ou du défaut, et la
sauvegarde n'envoie QUE ce qu'on a touché.

Deux choses trouvées en cours de route. Le fichier est bind-monté à l'unité
(compose, ConfigMap) : on ne peut pas lui renommer un frère par-dessus
(EBUSY, mesuré sur `node:22-alpine`), donc écriture atomique quand c'est
possible, en place quand le montage l'interdit, et jamais de repli sur une
autre erreur. Et monté en lecture seule, l'écran le dit avant qu'on remplisse
un formulaire, en continuant d'afficher toutes les valeurs — c'est la moitié
qui manquait : rien ne disait dans quel mode tournait le guetteur de fichiers.

Volontairement absents du catalogue : `driver.command` (un binaire que le
serveur lance), `extensions.sources`/`apps` (cloner un dépôt et exécuter son
script de setup), les secrets et le `clientSecret` OIDC. Sur une instance en
`auth.mode: none`, les offrir reviendrait à les offrir à qui atteint le port.
Premier groupe livré : le rafraîchissement vivant (`workspace.watch`), soit
exactement le réglage qui manquait sur WSL/OneDrive. Scénario de banc :
`editeur-config`. Déployée le 24/09.

v0.72.0 : **un bouton « redémarrer » dans les réglages**, et il ne tue rien.
Le serveur ferme son instance et en démarre une neuve DANS LE MÊME PROCESSUS
(`start()` rendait déjà quelque chose qui se ferme ; c'est le lanceur qui tient
désormais la boucle). Le conteneur ne bouge pas — compteur de redémarrages à
zéro, vérifié — et ça se comporte pareil sous `npm start`, sous Docker et en
k8s. Écarté au passage : le processus enfant supervisé (proposé par
l'utilisateur), qui coûtait le suivi des signaux, un protocole de codes de
sortie et la récolte des zombies en PID 1 — alors que la version en processus
se vérifie dans la suite de tests. La conf est RELUE avant toute démolition :
une conf cassée coûte le redémarrage, jamais l'instance qui sert. Un tour en
cours refuse le redémarrage en disant combien ; `force` passe outre. Le bandeau
n'apparaît que quand un réglage « effectif après redémarrage » vient d'être
écrit, et l'écran attend le retour de la santé plutôt que d'échouer dans le
trou.

**Défaut ANTÉRIEUR trouvé en chemin, et corrigé : le serveur ne pouvait pas
s'arrêter tant qu'une coque le regardait.** Fastify attend les requêtes en vol,
et deux des nôtres ne finissent jamais seules (le flux de changements, un tour
attaché). Mesuré sur l'image : avec un seul `/api/events` ouvert, `docker stop`
n'y arrivait pas et le conteneur sortait en **code 137**, tué ; sans navigateur,
le même stop prenait moins d'une seconde. `forceCloseConnections` règle ça —
au prix d'une requête en vol qui perd sa RÉPONSE, jamais son travail.
Scénario de banc : `editeur-config` (étendu). Déployée le 24/09.

v0.73.0 : **le frontmatter s'édite au formulaire**, par le ⚙ de la bande de
pastilles en haut d'une fiche en écriture (option A, choisie par
l'utilisateur sur maquette). Rien ne se tape en YAML : chaque champ est un
contrôle, et ce que le formulaire ne sait pas modéliser — une structure
imbriquée — est MONTRÉ tel quel et jamais réécrit. Le savoir vient de trois
endroits, et c'est le dessin : le cœur déclare les dix champs qu'il lit
(`content/fields.ts`), un plugin déclare ceux qu'il lit pour les types qu'il
revendique (clé `fields` du manifeste — `todo` ouvre le bal avec `due`,
`start`, `pri`, `assignee`, `dom`, `projet`, `done`), et les VALEURS sortent
de l'index : `domaine: atelier` est un fait sur un espace de travail, pas sur
Adestia, donc la liste propose ce que le corpus écrit déjà, le plus utilisé
d'abord, et accepte un mot qu'elle n'a jamais vu. Un champ « référence »
(`projet`) se choisit parmi les fiches du type visé, écrites par leur `id`.
Aucune requête nouvelle : la coque tient déjà l'index.

L'écriture passe par l'API document de `yaml`, comme l'éditeur de conf — ce
qui règle ce que la chirurgie par expression régulière ne savait pas faire :
les listes, les commentaires, et un titre qui contient un deux-points (`title:
Servante: le retour` n'est pas du YAML, et rien ne l'aurait dit). Un bloc qui
ne PARSE pas n'est jamais écrit : le panneau le dit et refuse, plutôt que de
« réparer » ce qu'il a réussi à lire.

Le second écrivain de frontmatter est retiré au passage : l'éditeur en avait
un à lui, par expression régulière, pour le `title:` des plugins — deux
écrivains qui ne s'accordaient pas, dont un écrivait du YAML invalide sans que
rien ne le dise.

Quatre choses trouvées en chemin. La bande se cachait quand elle était vide,
donc la fiche qu'on vient de créer — celle qu'on veut justement nommer —
n'avait aucun point d'entrée : le nœud est désormais inséré même absent, et un
nœud vide s'écrit comme RIEN (le fichier ne gagne un `---` qu'au premier champ
rempli). Les contrôles natifs ne suivaient pas le thème : `color-scheme`
n'était déclaré qu'en `light dark` sur `:root`, jamais forcé sous
`[data-theme]`, et un sélecteur de date était un bloc blanc sur une carte
noire. La poignée `+ ⠿` de Crepe visait la bande : elle proposait de DÉPLACER
les propriétés au milieu du document (vu au banc, corrigé). Et `main` ne
passait plus son propre `npm run typecheck` (six erreurs,
dont un `Saving…` traduit deux fois avec deux orthographes de points de
suspension) — corrigé dans un commit à part.

Reste ouvert à la livraison, réglé depuis par la v0.74.0 : les libellés
déclarés par un plugin s'affichaient en anglais sur une instance française.
Scénario de banc : `proprietes-fiche`. Déployée le 24/09.

v0.74.0 : **un plugin traduit AUSSI les mots qu'il déclare**. Un facet rend
sa table avec sa contribution (`words: table(api.locale)`), et la coque la
consulte partout où elle dessine un mot venu du manifeste : le nom d'une
tuile, le libellé et l'aide d'un champ, la description d'un bloc, le titre du
groupe dans le formulaire. Trois tables répondent dans cet ordre — celle du
plugin, celle de la coque (donc un champ nommé `Title` hérite d'une
traduction que personne n'a réécrite), puis la phrase anglaise. Celle du
plugin ne touche QUE ses propres déclarations : une app ne renomme pas
« Réglages » pour tout le monde, même raison qu'un skin ne porte aucun mot.

Ce qui l'a rendue possible, et que l'analyse de la veille avait manqué : tout
plugin dont un mot atteint l'écran a déjà son code en mémoire. Le chargeur
importe tous les facets avant de publier `loaded`, et un plugin dont aucun
facet ne répond est jeté en entier — ni tuile, ni champs. Le fichier de
langue à côté du manifeste, envisagé d'abord, aurait ajouté un fichier et une
clé pour un tuyau qui existait déjà.

Le ménage qui allait avec, trouvé au balayage des dix plugins : `meals`
affichait un refus de glisser en anglais (« That move was refused. ») ;
`scan` avait son info-bulle de composeur en dur ; trois tuiles étaient
écrites en FRANÇAIS dans leur manifeste (`Veille`, `Planifications`,
`Voyages`) — le même défaut en miroir, illisible pour un lecteur anglais —
et sont repassées à l'anglais avec leur entrée de table ; quinze entrées que
plus personne ne disait ont été retirées (8 chez `journal`, 5 chez `meals`,
2 chez `voyages`). Les six phrases anglaises de `todo` notées le 23/09
étaient DÉJÀ rentrées : la ligne avait vieilli.

Le test de mots de `todo` devient celui des dix (`plugins/test/words.test.js`)
et lit la table comme la coque la lit — les modules du manifeste, importés et
appelés. Il échoue sur la classe dans les deux sens : une phrase sans
traduction, une traduction que personne ne dit. Le banc ouvre DEUX lecteurs
sur une même instance (elle ne déclare aucune langue, le navigateur tranche) :
« Échéance / Dès le / Portée par » d'un côté, « Due / Not before / Carried
by » de l'autre. Scénario de banc : `mots-de-plugin`. Déployée le 24/09.

v0.75.0 : **un projet dit AUSSI comment il va**. `status:` dit où une fiche en
est dans sa vie ; il ne sait pas dire si un projet qui tourne va bien. Un
second mot, `project-status: Green | Amber | Red`, déclaré par
`project-management` pour le type qu'il revendique — donc il n'existe QUE sur
ces fiches-là, et le déclarer suffit à le rendre modifiable : le formulaire de
propriétés de la 0.73.0 le dessine, la table de mots de la 0.74.0 le nomme
« Statut projet ». Zéro ligne d'interface pour le champ lui-même. Les VALEURS
restent en anglais délibérément : c'est ce que le fichier porte, et un menu
qui proposerait « Vert » en écrivant `Green` mentirait sur ce qu'il s'apprête
à écrire.

**La précédence est une substitution, pas une addition** : la vie de la fiche
parle d'abord. Un projet en attente ou clos montre son statut de cycle de vie,
quelle que soit la note écrite dessus — « Green » à côté de « bloqué » serait
un projet qui se dit bien portant pendant que personne ne peut y toucher. Une
seule pastille par ligne. Sur une BARRE, la même règle plus une : une note
écrite l'emporte sur `late`, parce que `late` est déduit d'une date tandis
qu'une note est la parole de quelqu'un sur la même question, et deux couleurs
disant « ça ne va pas » ne se distingueraient pas.

**`:::subproject`** dessine ça : une ligne par sous-projet, la pastille au
bout, les projets clos derrière un repli. Un bloc À LUI plutôt qu'une prise
dans la ligne du cœur — décision du propriétaire, et l'argument est qu'une
prise est un contrat : un contrat qui traverse le dessin d'une carte oblige à
tester l'évolution de cette carte contre tous les plugins, y compris ceux
qu'on ne maîtrise pas. Le fork est petit ici parce que le plugin possédait
déjà la marche, l'éligibilité et la machine à états de `:::timeline`.

Deux choses mesurées plutôt que supposées. Les couleurs passent par
`--danger` / `--warning` / `--success` et JAMAIS par les teintes nommées : un
skin a le droit d'aplatir celles-ci, et Skippy écrase les dix sur un seul
ambre — vert, ambre et rouge y auraient été la même tache. Et
`/api/pages/index` publie `tone` à côté de `finished`, même raison qu'elle :
un plugin peut n'importer que React, et `finished` ne distingue pas « en
attente » de « en cours », qui est justement ce dont la précédence a besoin.

Au passage, la ligne d'un `:::list{pull=status}` porte enfin la pastille
colorée que la carte d'à côté portait déjà — le seul endroit où la coque se
contredisait sur un même champ lu dans le même index.

Ce qui est assumé : une carte d'étagère et les puces d'entête d'une fiche ne
sont pas des blocs, donc un projet noté Red est en couleur dans son
`:::subproject` et en statut de cycle de vie sur la carte qui ouvre son
dossier. Le jour où ça gêne, c'est un chantier « prise à puces ».

Ambre veut désormais dire deux choses sur un planning — « en retard » (déduit)
et « Amber » (écrit) ; le survol écrit le mot, mais à l'œil deux barres ambre
ne se distinguent pas. Sortie si ça gêne : donner à `late` un dessin plutôt
qu'une teinte. Scénarios de banc : `statut-en-liste`, `statut-projet` (rejoué
sur le skin Skippy, c'est lui qui prouve le choix des tokens). Pas encore
déployée.

v0.76.0 : **chacun sa boîte dans l'inbox des pièces jointes, et le moteur
sait où elle est**. L'inbox garde ce qu'on a déposé dans le chat et dont
personne n'a encore décidé la place — c'est donc exactement ce qui doit se
séparer : un tas indécis ne se range que si on peut dire à qui il est. Chaque
personne a sa boîte, nommée par le hash de son identifiant (un `sub` OIDC
contient des slashes et des deux-points ; « assainir » deux personnes vers un
même dossier est une fuite, pas un choix de format), avec un `owner.txt` d'une
ligne à côté des lots — un hash est illisible PAR CONSTRUCTION, et un tas
illisible est précisément ce que les boîtes empêchent. Le balayage suit la
forme : chaque lot vieillit sur SA propre date, parce que celle d'un dossier
bouge quand on y ajoute un enfant — une boîte vieillie d'un bloc prendrait un
vieux lot des mains d'un actif et garderait pour toujours celui d'un
silencieux. Un lot resté à la racine d'avant les boîtes expire là où il est.

**Et la boîte est déclarée au moteur comme répertoire de travail.** Une CLI
qui vérifie les chemins de lecture refuse un fichier hors de son répertoire
courant : l'agent recevait de l'instance elle-même le chemin d'une pièce
jointe et répondait « Permission denied » dessus, ce qui se lit comme un agent
devenu bête plutôt que comme une déclaration manquante. Le contrat pilote
portait déjà `roots` pour les stores montés hors workspace ; codex et Claude
Code l'honoraient, le pilote Copilot l'ignorait — il déclare désormais chaque
racine en `--add-dir`. Déclarée à CHAQUE tour de chat, pas seulement à ceux
qui portent des fichiers : le navigateur n'envoie les ids qu'avec le message
qui les apporte, alors qu'on revient sur un fichier deux tours plus tard. Et
seulement quand la boîte existe, un root inexistant étant un drapeau de
lancement qui pointe vers rien.

Deux formes écartées en chemin. Déclarer l'inbox ENTIÈRE : une constante, zéro
comptabilité — mais ça défait ce que les boîtes viennent de séparer, et ça
donne à un tour délégué, dont l'appelant est un jeton porteur et pas une
personne, les fichiers non rangés de tout le monde. Et dériver le root des ids
envoyés par le navigateur (la première forme du correctif), qui a l'air
minimale sans l'être : les ids viennent du client, `resolve` vérifie l'évasion
et pas la forme, et un id d'un seul segment nommait l'inbox entière — la
permission maximale, obtenue par le paramètre censé la garder minimale.

**Mesuré plutôt que supposé** (CLI 1.0.80, mock BYOK, sans credentials —
spike §12). Le refus est mot pour mot celui rapporté sur l'instance :
« Permission denied and could not request permission from user », sans
nommer ni le chemin ni le drapeau qui manque. `--allow-all-tools` ne le
couvre PAS : permission d'outil et vérification de chemin sont deux portes.
`--add-dir` l'ouvre, en lecture comme en écriture. Et un `--add-dir` sur un
dossier absent **tue le tour entier** (exit 1, aucune ligne `result`) — ce
qui valide le choix de ne déclarer la boîte que lorsqu'elle existe.

Piège trouvé en mesurant, et consigné pour la prochaine fois : le répertoire
temporaire du système est autorisé PAR DÉFAUT, donc une fixture posée dans
`/tmp` fait croire qu'aucune vérification n'existe. Deux lectures fausses
avant de s'en apercevoir. À arbitrer séparément : le pilote ne passe ni
`--allow-all-paths` ni `--disallow-temp-dir`, donc l'agent lit et écrit
aujourd'hui librement dans le `/tmp` du conteneur.

Pas encore déployée.

v0.61.0 : une page occupe un grand écran. Le canevas
monte à 1400 px (940 avant) ; la prose garde une mesure, relevée à 89ch
(~830 px, choix de l'utilisateur sur son écran, au-delà des 70 classiques),
et tout ce qui se parcourt plutôt qu'il ne se lit — tableaux, bandeaux `w=`,
chiffres, cartes, blocs de plugins — prend la largeur du canevas. Même
partage dans l'éditeur. L'en-tête d'un bloc `:::content` est redessiné
(pastille, titre serif, signature mono à droite, bandeau dans une carte), et
le vide de 35 px en haut des cartes a disparu. Scénario de banc :
`page-width`. Partie dans la 0.68.0, donc déployée le 20/09 — la mention
« pas encore déployée » avait vieilli sur place.

v0.62.0 : `title=` et `ico=` sont RÉSERVÉS, comme `w` — tout
bloc, du cœur ou d'un plugin, peut porter un titre et une icône, et le lecteur
dessine l'en-tête : première ligne de la boîte d'une liste, première ligne d'un
encadré, au-dessus du reste. Signalé à l'usage : un `:::list{title=…}` passait
avec un simple avertissement et s'affichait sans titre. Scénario de banc :
`block-titles`.

v0.63.0 : `:::list{source=files}` liste les fichiers d'une
page (son dossier et son `assets/`, la règle de la bande « Pièces jointes »)
là où l'auteur écrit le bloc ; `type=` filtre par sorte (`image`, `pdf`…),
`view=cards` fait une planche, `depth=subtree` descend sous le dossier. La
bande du bas ne répète plus ce qu'une liste montre. Corrigé en passant : le
lecteur d'une page ordinaire ne recevait pas `vocabulary` (latent, aucune app
ne surcharge un bloc du cœur). Scénario de banc : `list-files`.

v0.64.0 : `view=cards` pour le planning et la checklist — REMPLACÉ avant tout
déploiement par ce qui suit.

v0.65.0 : **`frame=card` encadre n'importe quel bloc**
(réservé, dessiné par le lecteur, le titre en bandeau) ; **`view` ne dit plus
que la disposition de l'intérieur** (liste : `rows`/`cards`/`chips`). Un bloc
est nu par défaut : la liste en lignes a perdu sa bordure, la checklist son
liseré. Sans rétrocompatibilité (choix de l'utilisateur) : `content{view=cards}`
et `checklist{view=…}` ne sont plus que des avertissements sans effet. Le
planning pose ses étiquettes de jalons en rangées mesurées, DANS le graphique
(elles montaient sur le bloc du dessus). Scénario de banc : `block-cards`.

v0.66.0 : **`:::row`**, un saut de ligne entre blocs `w=`
qui ne dessine rien dans la page (l'éditeur le montre « :::row »). Choisi par
l'utilisateur contre un attribut `break` et un `---` détourné. Scénario de
banc : `row-break`.

v0.67.0 : **l'édition dessine les blocs comme la lecture** — cartes,
bandeaux, encadrés, rangées `w=`, vrai rendu des blocs de données (lignes
brutes au clic) ; ⚙ règle chaque bloc (ses attributs + titre, icône, carte,
largeur) ; le menu « / » propose tous les blocs ; la barre de sélection porte
listes, titres et citation ; un bloc se glisse (⠿) là où on le veut, toujours
au premier niveau, ⤴ sort un bloc imbriqué, ✕ le supprime. Corrigé en route :
enregistrement à l'ouverture, `<br />` pour les paragraphes vides, curseur
caché dans les cartes, reset de Crepe (en couche CSS). Construit sur les
retours de l'utilisateur, instance d'essai locale (port 8744).

v0.68.0 : **un plugin peut venir d'un AUTRE dépôt**. `extensions.sources`
déclare une adresse git (`ref` obligatoire — pas de branche par défaut : tirer
un dépôt, c'est exécuter son code) ou un dossier monté ; le clone vit dans
`<dataDir>/extensions`, donc une forge injoignable coûte le rafraîchissement
et jamais le démarrage (on repart du cache, la bande des problèmes dit
laquelle). La découverte lit plusieurs racines, l'image d'abord : un dépôt
ajoute un plugin, il n'en remplace jamais un. Un dépôt dont la RACINE est le
plugin est nommé par son manifeste (le dossier d'un clone porte le nom du
dépôt, pas celui du plugin). Les skins suivent le même chemin.
Scénario de banc : `plugins-externes`. Déployée le 20/09 sur les trois corps.

**Prochaines étapes :**
- [ ] Mode édition, suite (retours du 19/09) : libellés parlants dans ⚙
      (« sujet » pour `type`…), même espacement vertical qu'en lecture sur
      les pages à rangées, formulaires pour les blocs de données (chiffres,
      lignes écrites d'une liste, planning) au lieu des lignes brutes.
- [x] Migration du contenu : CLOSE le 20/09, on ne migre pas — le contenu
      d'avant 0.65 reste en l'état (`view=cards` sans cadre, `checklist`
      sans filtre). Le script attend le jour où la question se repose :
      `.agent/questions-migration-contenu.md`.
- [x] Les trois corps tournent en v0.67.0 depuis le 19/09.
- [ ] Date d'un bloc `:::content` au format de la langue (« 9 sept. 2026 ») :
      demande de passer la locale de l'instance jusqu'au `Reader`, pas fait.
- [ ] (décidé le 15/09 : PAS de kit d'aides porté par le cœur ; les plugins
      gardent leurs copies de `slugOf`, `slugify`, du parseur de frontmatter
      et de `makeCache` — cinq lignes chacune, et un plugin reste un dossier
      autonome qui n'importe que React.)
- [x] (fait le 15/09 : conversations et vue MCP déclarées une fois dans
      `schemas/src/protocol.ts` ; les événements de tour restent ceux du
      contrat pilote, importés en type seulement par le web. Déclaration de
      `@antorfr/adestia-schemas` dans `packages/web/package.json` faite le
      16/09, avec le retrait de `plugin-react`.)
- [x] `@vitejs/plugin-react` retiré de `packages/web` le 16/09 : déclaré,
      jamais chargé — le bundle sort avec la même empreinte qu'avant. Lockfile
      mis à jour par `npm install --package-lock-only` (ne touche pas aux
      paquets installés) : deux entrées changées, le fork du parseur intact.
- [x] Scénario de banc `journal-blocs` réécrit le 16/09 : il passe de bout en
      bout (12 captures). Trois choses avaient vieilli — le bouton
      « Enregistrer » (parti le 10/09), le sélecteur du titre d'une entrée, et
      les attributs des blocs dans ses fiches d'exemple. Il RAPPORTE un défaut
      réel au passage : insérer une table depuis le menu « / » écrit
      `:::table` avec un `<br />` dedans, et un second enregistrement se fait
      refuser en 422. À traiter à part, c'est l'insertion, pas le scénario.
- [x] Fait le 16/09 : `auth.oidc.sessionTtlMs: 2592000000` (30 jours) sur les
      trois, dans le même commit cluster que le bump d'image.
- [x] Fait au déploiement du 16/09 : `collections` retiré d'`extensions.apps`
      chez Alfred et Skippy (Nestor ne le portait pas), dans le même commit
      que le bump d'image — le pod reçoit image et conf d'un coup. Les trois
      démarrent proprement : 8, 2 et 8 plugins actifs sur 11, aucun avis.
- [x] Refonte structurelle fusionnée dans `main` le 15/09, tag `v0.58.0`.

**Restes ouverts des chantiers passés** (relevés au dégraissage de ce fichier,
non revérifiés un par un ; l'historique complet est dans git) :
- [ ] Le fil « tuyau Festool » d'Alfred reste coupé en deux côté moteur.
- [ ] Le banc mesure en pixels ce qu'il photographiait ; à généraliser.
- [x] Éditer les attributs d'un bloc depuis l'interface : fait pour les blocs
      en v0.67.0 (⚙), et pour le frontmatter en v0.73.0 (le ⚙ de la bande).
- [ ] L'éditeur embarqué dans un plugin est amputé : ni `attach`/`compose`,
      ni bandeau de pièces jointes, ni `pages` pour les `[[type#id]]`.
- [ ] La puce `tache` et le crayon de l'éditeur embarqué s'affichent sous le
      titre « Note » d'une fiche.
- [ ] `‹ Back` du shell est en dur en anglais (`App.tsx`).
- [ ] `atelier` n'a AUCUNE i18n : tout son écran est écrit en français en
      dur (« Plaques », « Tronçons », « Colonne à refaire »…). Le même défaut
      que les tuiles françaises, mais à l'échelle d'une app entière — vu au
      balayage du 24/09, laissé de côté : c'est un chantier, pas un oubli.
      Il ne déclare ni tuile ni mot de manifeste, donc rien ne le signale au
      nouveau test.
- [ ] `todo-config` : le raisonnement « premier par ordre de chemin » réparé
      pour `me:` vaudrait aussi pour `folder:`.
- [x] Les six phrases anglaises de `todo/web/app.js` : déjà faites avant le
      24/09 (le test du plugin passait), ligne périmée. Le balayage des dix
      plugins qui l'a constaté a trouvé et corrigé le reste — voir v0.74.0.
- [ ] `journal` : pas encore vérifié en navigateur ; `api.trail` sans test.
- [ ] Pilote Copilot : pas de plomberie de permissions, la porte planif ne
      s'y applique pas.
- [ ] PWA : l'invite d'installation à constater sur un vrai appareil ; le
      hors-ligne des tuiles de carte de `parcours`.
- [ ] Backlog UX du 26/08 : deux bugs de la vague 1 (pop-up d'autorisation
      qui ne se ferme pas, fiche `adestia-evolutions` absente de la nav).
- [ ] Plugin `project-management` : son `kind` (feature ou app) reste à
      arbitrer le jour des surcharges (`table{type=risques}`, contributeurs).
