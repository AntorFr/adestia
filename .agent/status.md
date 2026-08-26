# Status — Golem
> MàJ : 2026-08-26

**État :** Migration Alfred. Faits et vérifiés en navigateur : `todo`,
`planif`, `collections`, `scan`, skin `alfred`. 1029 tests + 146 de plugins.
Facette `blocks` CÂBLÉE : elle était chargée et narrowée depuis le début, et
personne ne lisait le résultat. Un bloc se déclare en deux moitiés — le
manifeste (`vocabulary`) dit ce qu'il EST, pour que le SERVEUR le valide sans
exécuter de code navigateur ; le module dit à quoi il ressemble. Le pont `{% %}`
suit le vocabulaire, donc une fiche partagée rend un bloc de plugin sans être
réécrite. Premier client : `parcours` porté (carte sans biblio, profil, mode
balade, GPX octet-pour-octet identique au prédécesseur) — sauf le hors-ligne,
qui demande un service worker que Golem n'a pas. **Livré en 0.5.0 et déployé**
sur homenode, `features: [scan, parcours]` : 7 plugins sur 7 actifs.
Missions ajoutées à planif (`until:` → la note se termine seule, `done:` par
l'agent, `expired:` par le produit), avec porte d'écriture par contenu sur la
zone planif — non couverte côté driver Copilot, qui n'a pas de broker.
Login Copilot : device-code relayé, sous pty (la question « stocker en clair ? »
n'est posée que sur un terminal), consentement explicite de l'utilisateur par
case à cocher. Vérifié de bout en bout contre un vrai compte, en conteneur sans
keychain — capture dans `spikes/copilot-cli/raw/login-device-code-plaintext.txt`.
Chrome d'édition Crepe réparée : Golem n'importait que la STRUCTURE du thème,
donc aucun `--crepe-*` n'était déclaré → barre d'outils, menu slash et poignée
de bloc invisibles (transparents, sans ombre). Le jeu complet est maintenant
dérivé des tokens dans `shell.css`, avec la gouttière que la poignée réclame ;
un test l'ancre au contrat de Crepe. Vérifié au navigateur, clair et sombre.
Contexte d'écran porté d'agent-gw (oublié par l'audit de parité) : chaque
message emporte `view: {route, title}`, le serveur préfixe le prompt d'une
ligne — route et fil d'Ariane seulement, jamais le rendu de la page, rien
depuis l'accueil ni depuis un mobile replié sur le chat. Encadrement fait
côté serveur, donc le fil stocke le prompt brut (pas de dé-préfixage au
rejeu, contrairement au prédécesseur). Route/titre aplatis sur une ligne et
bornés : un `#` est pilotable par un lien.
Propriété d'un dossier = règle de ROUTAGE (`app/owners.ts`) : `absorbs` ne
servait qu'à retrancher une tuile de l'accueil, donc le fil d'Ariane d'une
fiche de voyage repartait sur `#/section/…` (la liste générique) au lieu du
voyage. La coque sait QUI possède le dossier, le plugin dit OÙ par un
`routeFor(dossier)` optionnel — appliqué aux liens dessinés ET à la route
`/section/` elle-même (marque-pages, cibles écrites par l'agent). Sans réponse
du plugin : section générique, aucune devinette. Le fil remonte maintenant
TOUS les dossiers-lieux d'une fiche (`Accueil / Voyages / Brocéliande 2026 /
…`), les dossiers de regroupement (`domaines/`) exceptés, et il est dérivé une
seule fois — l'en-tête le dessine, le contexte d'écran l'emporte.
Adresses refaites : un voyage/workbook s'écrit par son NOM
(`#/voyages/baden-2026`, `#/atelier/rangement-garage`), résolu contre le
listing du plugin — repli sur le chemin si le nom est pris deux fois, et
TOUTES les anciennes formes restent lues (aucun favori ni lien de fiche ne
meurt). Les routes de la coque (`#/page/…`, `#/section/…`) et `parcours`
encodent désormais segment par segment : plus de `%2F`. Règle par plugin dans
son `web/address.js`, pure et testée.
Répondre, C'EST revendiquer : `routeFor` n'exige plus d'`absorbs` — l'atelier
(dont les établis vivent dans n'importe quel dossier de projet, donc aucun NOM
ne les couvre) revendique un chemin en le connaissant, via son listing. Le
déclaré l'emporte sur le su. La une s'en sert : une cible qui porte un chemin
va à qui le possède, et la coque a cessé d'épeler `workbook` avec la route de
l'atelier en dur.
**Livré en 0.6.0 et déployé** sur homenode (image multi-arch, manifeste bumpé,
pod `ghcr.io/antorfr/golem:0.6.0` ready, 7 plugins sur 7 actifs au boot).
0.7.0 : le fil ne s'arrêtait plus au dossier mais s'arrêtait à l'APP — `#/voyages`
et `#/voyages/baden-2026` écrivaient tous deux « Accueil / Voyages ». Une vue
PUBLIE désormais où elle est (`api.trail`), la coque la dessine, et les deux
apps portées cessent de dessiner leur propre fil sous celui de la coque.
Reste à constater AU NAVIGATEUR — la porte OIDC interdit de le faire sans la
session de l'utilisateur : fil d'Ariane depuis une fiche de voyage, adresses
courtes, et une ancienne URL `%2F` qui doit toujours ouvrir.
0.8.0 : **`api.PageEditor`** — la coque PRÊTE son éditeur de page aux plugins
(par l'`api` injectée, jamais par l'import map : un plugin qui importe la coque
serait un cycle ; Milkdown chargé à la demande, comme sur `#/page/…`). Rendre un
éditeur par entrée EST la fonction « n'éditer que cette section ». Premier
client, le plugin **`journal`** : un journal est un DOSSIER, une entrée est une
page dedans — un fichier markdown par entrée, jamais un fichier-historique
(l'API sauve le fichier entier sous révision optimiste, donc un seul fichier
collisionnerait l'entrée ajoutée par l'agent avec celle qu'on est en train
d'écrire). Écrit le 25/08 dans un worktree, resté à quai pendant 29 commits, et
rebasé sur `main` ici : les deux moitiés se recouvraient sur 9 fichiers. Trou
que ni l'une ni l'autre ne voyait, refermé au passage — l'éditeur prêté ne
recevait pas les blocs des plugins (il est construit AVANT le chargement des
plugins), donc une entrée portant un `{% %}` aurait montré des accolades là où
l'écran page montre le bloc : il les lit maintenant par une ref.
`journal` mis au contrat 0.7.0 dans la foulée : il PUBLIE où il est
(`api.trail` — le nom du journal ouvert, `[]` sur l'étagère) et il répond
`routeFor`, en remontant du chemin vers le journal qui le contient, donc une
entrée renvoie à son journal et un dossier qui n'en est pas ne renvoie à rien.
`absorbs` reste : il dit que le dossier `journal` est l'affaire de l'app, ce
que `routeFor` ne dit pas — les deux moitiés, pas l'une OU l'autre. Adresses
refaites au passage, parce que c'est `routeFor` qui décide le schéma d'URL :
`#/journal/atelier` (le NOM, résolu contre le listing) au lieu de
`#/journal/journal%2Fatelier`, repli sur le chemin si le nom est pris deux
fois, et l'ancienne forme reste lue pour toujours — le décodage se fait
segment par segment, donc un `%2F` d'un vieux favori redevient le chemin qu'il
a toujours été. Règle dans `web/address.js`, pure et testée (15 tests).
Décompte du Dockerfile passé à huit plugins ; le `golem.config.example.yaml`,
lui, ne nomme aucun plugin (listes vides par conception : « la présence est la
découverte, jamais l'activation »), il n'y avait donc rien à y déclarer. Et
`plugins/README.md` annonçait encore UNE skin alors que trois sont livrées
depuis le portage de Nestor et Skippy — corrigé, les deux ont leur ligne.
**Livré en 0.8.0 et déployé** sur homenode (image multi-arch, manifeste bumpé,
pod `ghcr.io/antorfr/golem:0.8.0` ready, « 8 of 8 plugin(s) active » au boot,
`journal` ajouté à la liste `apps:` — la présence n'est pas l'activation).

0.9.0 — MCP en OAuth utilisateur (branche `feat/mcp-user-oauth-and-driver-agent`,
écrite sur l'autre poste, revue et fusionnée ici) : un hub public sans secret
client se joint par le grant `refresh_token`, avec un jeton frappé une fois par
un flux interactif — l'instance agit pour une PERSONNE, à côté de l'identité
machine en `client_credentials` qui reste. Le jeton tourne à chaque échange,
donc il est suivi en mémoire ET persisté (0600, à côté du credential driver) :
sans ça un redémarrage présente un jeton brûlé. `driver.agent` sélectionne au
passage un profil d'agent (copilot-cli passe `--agent`).
Deux défauts trouvés à la revue, prouvés puis corrigés — aucun n'était visible
au test, les six tests de la branche ne couvraient que le chemin heureux :
(1) la file d'écriture du store gardait sa rejection, donc UN échec de write
empoisonnait tous les suivants pour la vie du process — ils rejetaient sans
même s'exécuter, et le symptôme n'apparaissait que des jours plus tard, à un
redémarrage réclamant un login inexplicable ; (2) une panne du store LEVAIT
depuis `McpTokens.for`, dont le contrat écrit trois lignes plus haut promet un
`undefined` — une écriture ratée coûtait le TOUR entier au lieu des seuls
serveurs MCP. Les deux ancrés par 7 tests, dont 4 échouent sans le correctif
(vérifié en restaurant les sources d'origine). Un write raté se dit maintenant
à voix haute par le `log` du serveur.
Réglages devenus une APP de la coque et non un dialogue posé sur la page
(`Modal` retiré) — chantier mené en parallèle sur l'autre poste.
Mineur et non correctif : deux champs de config qui n'existaient pas
(`mcp[].auth.refreshToken`, `driver.agent`) et un écran qui change de nature.
0.9.1 : le store de jetons ne répondait qu'une chose à trois situations —
`#read` renvoyait `{}` sur n'importe quelle erreur. Un fichier ILLISIBLE
(droits, I/O) repartait donc d'une carte vide et le save suivant l'écrasait
avec la seule clé en cours : tous les autres hubs perdaient leur retour, sur
une condition souvent passagère, et le `rename` passait sans broncher puisqu'il
répond aux droits du DOSSIER. Trois réponses distinctes désormais — absent
(`ENOENT`/`ENOTDIR` : aucun fichier ne peut exister là, rien à protéger),
illisible (on REFUSE d'écrire, à voix haute), corrompu (mis de côté en
`.broken`, on repart à neuf). Trois tests, tous les trois en échec sans le
correctif — dont un premier jet qui passait des DEUX côtés : l'ancien code
échouait pour une raison accessoire, pas parce qu'il refusait.
Zone d'instructions de Copilot élargie à `.github/agents` (branche poussée
depuis l'instance GHC) : le CLI y lit ses agents personnalisés — vérifié à la
doc GitHub, les captures du spike ne couvraient que les skills — donc l'écran
d'instructions les montre au lieu d'un dossier invisible. Reprise à la revue :
le dossier est aussi passé en zone d'AUTORITÉ, parce qu'un profil `.agent.md`
ne fait pas que parler — son frontmatter porte `tools` (ce que l'agent peut
atteindre, références MCP comprises) et `mcp-servers`. Même nature que
`.mcp.json`, sous un nom plus avenant : un tour qui réécrirait le profil
sélectionné par `driver.agent` se donnerait des outils que personne n'a
accordés, au tour suivant, dans un fichier qui ressemble à de la prose. Les
skills restent dehors, délibérément : elles disent quoi FAIRE, jamais ce qu'on
peut atteindre.

**Livré en 0.10.0 et déployé** sur homenode (image multi-arch amd64+arm64,
manifeste bumpé, pod `ghcr.io/antorfr/golem:0.10.0` ready, « 8 of 8 plugin(s)
active », skin `alfred`). 0.9.0 avait déjà emporté les réglages-app ; celle-ci
porte le contrat des skins, **cassant** : `home` est hors contrat, `hero` le
remplace. Sans effet sur ce pod — il porte `alfred`, qui n'a pas de slot
`home`, et les trois livrées du repo sont portées dans l'image.

0.10.1 : `.claude/agents` passe en zone d'AUTORITÉ **et** d'instructions pour
le driver claude-code, symétrique de ce qui a été fait pour `.github/agents`.
Le frontmatter d'un sous-agent porte `permissionMode` — `bypassPermissions`
parmi ses valeurs — plus `hooks`, des `mcpServers` inline et `tools` : c'est
la nature des trois chemins déjà gardés à côté, dans un fichier qui ressemble
à de la doc. Deux traits l'aggravaient : le SDK SURVEILLE ces dossiers et
ramasse un fichier neuf ou modifié en quelques SECONDES, sans redémarrage —
donc une écriture peut prendre effet dans la session qui l'a faite ; et un
hook `PreToolUse` déclaré là se résout AVANT `canUseTool`, la porte par
laquelle ce produit pose ses questions. Vérifié contre les types du SDK
installé (0.3.237) et la référence, pas de mémoire — au passage, omettre
`settingSources` charge TOUTES les sources disque (défaut CLI), l'inverse de
ce que faisaient les premières versions du SDK. Ce n'était pas une régression :
le trou précédait tout ce qu'on a livré aujourd'hui. Non couvert, et la porte
le dit déjà d'elle-même : un `sed -i` ou une redirection shell n'est pas une
édition de fichier — sur une instance qui auto-autorise `Bash`, la garde est
une friction, pas un mur.

0.10.2 : le sessionId de Copilot était perdu à chaque tour (branche
`fix/copilot-result-sessionid`, revue et intégrée ici). `result` est le SEUL
event que ce CLI n'emballe pas dans `data` — les captures du repo le montrent
avec `sessionId`, `exitCode` et `usage` en frères de `type`, et AUCUNE clé
`data`, quand tous les autres events en ont une. Le driver lisait `data`
partout : juste ailleurs, faux ici. Coût réel : l'id stocké était la chaîne
vide, donc `--resume` n'était jamais passé et chaque message ouvrait une
session CLI neuve — un fil qui oubliait son passé entre deux tours, sans une
ligne de log pour le dire. Repris à la revue : la branche annonçait « top
level d'abord » mais lisait `data` d'abord (commentaire et code se
contredisaient), et surtout `??` ne saute pas une chaîne VIDE — un CLI
envoyant la clé vide écrasait un id connu et ramenait le bug tel quel. Le
blanc compte désormais pour absent. Les deux formes restent lues, la plate
d'abord : aucune capture ne prouve que l'autre n'a jamais existé.


Chantier UX du 26/08 (backlog dicté par Monsieur, fiche `golem-evolutions`)
— lot 1, le composer : le champ tenait sur une ligne de 34 px sur la surface
dont c'est le métier, il part de 48 px et pousse jusqu'à 200 (`composerHeight`,
plancher ET plafond, la CSS porte les deux mêmes nombres). Le sélecteur de
modèle QUITTE le composer pour le header du chat (`ModelPicker`) : quel moteur
répond est une propriété de la CONVERSATION, pas du message en cours de frappe,
et en bas il prenait sa largeur au champ. Replié sur mobile (`ComposerFold`) :
📎 et les boutons de plugins passent sous un `＋` unique, en menu nommé par des
MOTS — Échap et clic dehors ferment, le menu s'ouvre vers le HAUT (le composer
est en bas de l'écran). Boutons 40 px, 44 sur téléphone.

Lot 2, les réglages : le dialogue empilait le jeton, un lien Instructions et
le relevé MCP dans l'ordre où ils avaient été écrits — armer un jeton poussait
tout le reste vers le bas et la liste MCP dormait sous douze lignes de statut.
Devenu un écran de RANGÉES (`Preferences`, contrôlé), une par sujet, chacune
ouvrant sa page ; le dialogue nomme la page ouverte (`prefsTitle`). La vertu
n'est pas la familiarité iOS mais l'ADRESSAGE : une rangée dit vrai avant
d'être ouverte (« 2 serveurs — 1 à regarder », `mcpLede`). Pas de rangée MCP
quand le driver ne rapporte pas (404) NI quand il rapporte zéro — les deux
ouvriraient une page vide. Instructions reste une PORTE vers l'écran plein.
`useMcpServers` extrait de `McpPanel` : un seul fetch pour la rangée et la page.

Lot 3, la navigation au doigt (`useSwipe`) : chat ↔ canvas au glissé
horizontal quand la coque est repliée, dans le sens du layout de bureau
(chat à gauche, canvas à droite) plutôt qu'une correspondance à mémoriser.
Le bouton du header RESTE — un geste qu'on ne découvre pas ne peut pas être
le seul chemin. Le travail est dans les REFUS : jamais à la souris (glisser
sélectionne du texte), jamais depuis un champ, jamais depuis un conteneur qui
défile latéralement (tableau large, bloc de code — le voler les rend
illisibles). Rien n'est `preventDefault` ni capturé : le verdict se lit à la
FIN du geste, donc le défilement vertical n'est pas touché.

Lot 4, ranger les icônes (`order.ts` pur, `useReorder`) : mode « Ranger » sur
l'accueil — un BOUTON, pas un appui long, parce qu'un geste invisible sur
l'écran qui porte la moitié de la navigation n'est trouvé par personne. Les
deux mosaïques ont leur ordre propre (une app ne se glisse pas chez les
domaines : ce serait déplacer un DOSSIER). C'est une PERMUTATION, pas une
grille : un plugin coupé ne laisse pas de trou, un plugin neuf n'est pas perdu
par une préférence qui ne le connaît pas. Drag au Pointer Event + flèches
‹ › — une mosaïque qui ne se réordonne qu'au glissé ne se réordonne pas du
tout pour certains. En mode ranger la tuile n'ouvre plus rien (`pointer-events:
none` depuis le slot, PAS `disabled` qui avalerait les événements du drag).
Ordre en localStorage, par navigateur, comme le modèle et la largeur du rail.

⚠️ Le drag lui-même n'est pas couvert au test : `getBoundingClientRect` rend
des zéros sous jsdom. Ce sont ses fonctions pures (`indexAt`, `moveItem`,
`applyOrder`) et la route clavier qui le sont — le geste reste à constater au
navigateur, avec le reste de la 0.7.0.

Lot 5, les réglages deviennent une APP. Le lot 2 avait rangé le contenu du
dialogue (une rangée par sujet) sans toucher au dialogue : 460 px flottant
au-dessus de ce qu'on était en train de lire, donc tout ce qu'il porte doit
tenir dans une boîte — c'est POUR ÇA que les Instructions n'étaient qu'une
porte de sortie. Réglages est un domaine de l'instance (le moteur avec lequel
elle répond, les serveurs qu'elle atteint, son aspect, ce qu'on lui a dit) :
c'est donc une app. Sa tuile sur l'accueil, ses adresses (`#/settings`, une
par page dessous), sa place dans le fil d'Ariane, et toute la largeur du
canvas. Instructions devient une page comme les autres (plus de boîte à
quitter) et une page **Apparence** apparaît : trois choix nommés qui DISENT le
thème en vigueur, là où le ◐ de l'en-tête ne peut que se deviner — le ◐ reste,
un aller simple vers le thème est le geste le plus fréquent. L'engrenage reste
aussi, en raccourci vers la même adresse : armer un jeton, c'est ce qu'on fait
quand quelque chose vient de casser, pas le moment de chercher une tuile.
La tuile de la coque est épinglée EN DERNIER, hors de la permutation : c'est du
mobilier, pas une des apps qu'on a données à ce workspace. `#/instructions`
(l'adresse de la zone d'instructions du temps du dialogue) passe la main à
`#/settings/instructions` — un favori ne cesse pas d'en être un parce qu'un
écran a déménagé. Les deux skins qui remplacent l'accueil (`skippy`, `nestor`) ont dû suivre : un
slot `home` remplace la mosaïque de la coque, donc la tuile Réglages n'y
existait pas et l'engrenage redevenait le seul chemin. Chacune a la sienne,
dans sa voix (rangée « Système » sur le HUD, tuile sous les modules chez
Nestor), et `skin-author` dit désormais que remplacer l'accueil, c'est aussi
remplacer cette tuile-là. `alfred` n'a pas de slot `home` : rien à faire. Côté
couleurs, rien non plus — `ardoise` et `violet` sont dans `tokens.css`, une
skin qui ne les redéfinit pas hérite du défaut.
Le `Modal` de la coque est SUPPRIMÉ : plus personne ne le
rendait (les plugins ont les leurs), et un composant gardé au chaud pour un
dialogue que personne n'a demandé ment sur ce que fait le produit.

Lot 6, le bon découpage de l'accueil (question de Monsieur, et elle était
juste) : le slot `home` donnait TOUT le canvas à la livrée. Les deux qui s'en
servaient reconstruisaient une mosaïque depuis `/api/instance` — qui ne porte
que les plugins — donc une instance habillée perdait en silence ses domaines,
la une, les compteurs de tuiles (inatteignables depuis une skin : ils viennent
de la vue du plugin), le mode Ranger, et Réglages. Pas un défaut des skins :
un point d'extension coupé au mauvais endroit, dont le coût se cumule à chaque
amélioration de l'accueil. Remplacé par **`hero`** — la livrée dessine la TÊTE
(salutation, mascotte, invite), la coque garde tout ce qui est dessous.
`home` devient hors contrat plutôt que déprécié : le loader nomme déjà les
champs ignorés dans le bandeau des problèmes, donc une livrée tierce dégrade
vers l'accueil de la coque AVEC la raison affichée. `hero` reçoit `instance`
comme `console` — le HUD garde son décompte de modules sans fetch.
Contrepartie obligatoire : la mosaïque doit pouvoir ressembler à la livrée,
et ça se paie en TOKENS. La marque colorée de la tuile devient quatre boutons
(`--tile-mark-inset/-width/-height/-tint`, plus un survol qui la ramène
toujours au plein) et son nom deux (`--tile-label-font/-track`) : la barre au
bord gauche et le pas fixe du HUD sont désormais une déclaration de tokens.
Les CSS orphelines (`.hudtile…`, `.nst-tuile…`) sont parties avec le markup.
Trois retouches que seules les captures pouvaient révéler : le `.hud` de
skippy réservait 40 px de bas de page pour une mosaïque qui n'est plus dedans,
le lapin de nestor (240 px) repoussait les apps sous la ligne de flottaison
maintenant qu'il y a quelque chose dessous, et la page Instructions portait la
teinte accent au lieu du `bleu` de la rangée qui l'ouvre.

Lot 7, le markdown du chat (1er bug de la vague 1) : les réponses de l'agent
s'affichaient en SOURCE — `**gras**`, `[label](url)`. L'agent n'écrit que du
markdown, donc c'est le rendu qui manquait, pas le format. Rendu par le MÊME
fichier qui sert à lire une fiche (`Reader.tsx`), en posture `Prose` : un
message est un FRAGMENT, pas un document — pas de frontmatter, pas de blocs de
plugin, et relatif à la RACINE de l'espace de travail (donc un chemin que
l'agent nomme, `voyages/baden.md`, ouvre la fiche, exactement comme le même
lien écrit DANS une fiche). Zéro dépendance nouvelle, zéro `innerHTML` :
la grammaire était déjà dans le bundle et le rendu passe par React.
La moitié de l'UTILISATEUR reste littérale, délibérément : personne ne lui a
dit qu'une grammaire s'appliquait à son champ de saisie, et il n'a aucun moyen
de l'échapper (le prédécesseur traçait la même ligne).
Deux pièges que seule la mesure/le test montrait :
(1) rendre le markdown à CHAQUE delta est quadratique — il faut re-parser
depuis le haut, un `**` tapé maintenant décidant ce que voulait dire un `**`
tapé avant. Mesuré : 21 s de CPU pour UNE réponse de 20 k caractères (0,7 s
pour 3,4 k — d'où l'invisibilité sur les réponses courtes des tests). D'où
`useCadence` : redessin toutes les 150 ms, coût proportionnel à la DURÉE du
tour et non au carré de sa longueur. Le front descendant est la moitié
porteuse : le dernier delta n'a rien derrière lui pour le pousser à l'écran.
(2) `---` en tête d'un message est du FRONTMATTER pour la grammaire partagée,
et la posture page le mine en pastilles de statut — donc un message qui ouvre
sur une règle perdait son premier bloc, en silence. La posture prose redessine
le texte à la place.
Vérifié au navigateur (Chrome headless, markup réel + CSS réelle), clair et
sombre. 5 tests, dont 4 en échec sans le correctif.

**Reste :**
- [ ] `journal` — pas encore vérifié en navigateur (tests seulement) : le
      fil d'Ariane, une adresse courte, et un vieux lien `%2F` qui doit
      toujours ouvrir
- [ ] `journal` : `api.trail` n'est pas couvert par un test — les tests de
      plugins tournent sous `node --test`, sans rendu React
- [ ] `atelier` — ~1 600 lignes (plan de débit, SVG). EN COURS.
- [x] `parcours` vérifié au navigateur (instance Docker, magasin d'alfred-beta
      copié) : les deux vues, la page `#/parcours/…`, l'éditeur (le bloc monte
      en nœud atomique, zéro erreur console), le GPX servi, la garde de chemin,
      et le refus 422 sur un attribut hors de l'ensemble fermé.
- [ ] `git` — non portable : spécifique au hub rosetta
- [ ] `npm run lint` ne tourne pas : eslint absent des devDependencies
- [ ] driver Copilot : pas de plomberie de permissions → la porte planif ne
      s'y applique pas (missions bornées par `until` malgré tout)
- [x] Réglages-app ET `hero` VÉRIFIÉS AU NAVIGATEUR (Chrome headless en
      conteneur, piloté par CDP depuis `shoot.mjs` — le drapeau
      `--virtual-time-budget` de chromium capture avant la 2e vague de fetchs
      de la coque, il faut une vraie attente après une vraie navigation).
      Vus : l'accueil (Réglages en dernière tuile), les 4 pages de réglages,
      le fil d'Ariane à trois crans, clair ET sombre, l'ancienne adresse
      `#/instructions` (capture pixel-identique à `#/settings/instructions`),
      et les deux livrées — tête de la skin + mosaïques de la coque, avec la
      barre ambre au bord gauche et le label en pas fixe sur skippy
- [ ] Backlog UX du 26/08, reste à traiter : 3 bugs de la vague 1 (pop-up
      d'autorisation qui ne se ferme pas au clic, indicateur « … » tardif
      après envoi, la fiche `golem-evolutions` absente de la nav) ; les outils autorisés par défaut
      (décision de niveau de risque, pas un bug) ; la fusion apps/domaines
      (chantier d'archi, à cadrer — `sections.ts`/`owners.ts` viennent d'être
      refaits en 0.6/0.7 pour DISTINGUER ces deux notions) ; et Withings/mail/
      agenda « connectés mais muets », qui sent le 403 user-data côté rosetta
      plutôt qu'un bug de Golem
