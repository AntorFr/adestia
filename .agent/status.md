# Status — Adestia
> MàJ : 2026-08-31

Chantier du 31/08 (soir, 3) — **les réglages coupés en deux**. Une seule
app portait quatre sujets qui, à l'usage, se séparent net : deux **interrupteurs
de session** (le jeton de l'agent est-il bon, clair ou sombre, je me déconnecte)
qu'on règle en une seconde d'où qu'on soit, et deux **contenus** (les serveurs
que l'instance atteint, la prose qu'on lui a dite) qui se parcourent, se
cherchent et s'éditent. Les premiers sur le canvas faisaient de chaque bascule
une navigation loin de ce qu'on lisait ; les seconds en RANGÉES faisaient
passer deux domaines de l'instance pour des options de boîte de dialogue.
Donc : **la roue crantée redevient un menu** (jetons — flux d'armement compris,
sur place —, apparence en trois choix nommés, déconnexion) et **l'app garde le
canvas**, en tuiles comme toute autre porte d'entrée. Ça a débloqué les deux
vrais manques : les **serveurs MCP deviennent éditables** (une tuile chacun, la
déclaration derrière, un bouton pour en ajouter) — ce qui a demandé une 4e
couche ÉCRIVABLE (`mcp-store.ts`, `<dataDir>/mcp-servers.json` en 0600, grammaire
du YAML réutilisée, secrets masqués dans les deux sens, collision de nom refusée)
et de passer aux drivers une FONCTION au lieu d'une liste (serveur branché au
tour suivant, pas au reboot suivant) ; et les **instructions fournies par le
produit deviennent visibles**, badgées, sans Enregistrer — les cacher répondait
à « que lit cet agent ? » avec la moitié de la vérité. Les instructions passent
en cartes + moteur de recherche (la colonne de noms était taillée pour quatre
fichiers, il y en a trente). 1178 + 179 verts, typecheck/build OK, **banc
constaté** (`bench/scenarios/settings-split.mjs`, 12 captures) — il a attrapé
deux défauts invisibles aux tests : deux boutons retour empilés (il n'en reste
qu'un, qui remonte d'UN niveau) et le menu qui restait ouvert par-dessus un
écran qu'on n'avait pas ouvert depuis lui.

Chantier du 31/08 (soir, 2) — **les chemins d'un plugin, ancrés par qui sait
où il est**. Le plugin ignore où l'opérateur l'a monté (`extensions.pluginsDir`)
et l'agent ne tourne pas dedans (son cwd est le workspace) : tout chemin écrit
par un plugin était vrai chez lui, faux à l'usage. La skill d'atelier disait
`node plugins/atelier/tools/atelier.mjs` → `Cannot find module`, et Alfred en a
conclu PAR ÉCRIT, dans deux fiches projet, que le validateur était « hors de
portée de cet environnement ». Il était installé et fonctionnel. Corrigé aux
deux endroits : `{{plugin_dir}}` dans une skill (substitué à la livraison, à
côté de `nameForFolder` — même moment, même raison) et les entrées `./` des
`mcpServers` d'un manifeste (résolues au câblage ; les serveurs de l'OPÉRATEUR
ne sont jamais touchés, et un mot nu comme `node` reste un lookup PATH). Ce
second volet était latent mais l'exemple de `plugin-author` enseignait
exactement le geste qui casse — et c'est le mécanisme du futur plugin outil.
5 tests neufs, 1170 + 190 verts, typecheck/build OK. Pas de banc : rien de ce
qui est dessiné ne change. **Côté cockpit d'Alfred** (hors dépôt) : les deux
fiches corrigées avec le VRAI verdict — dressing `✓ valide`, meuble à tiroirs
`✗ 14 erreurs` dont 4 pièces jamais débitées (NE PAS COUPER) — et sa skill
`menuiserie` recalée (annonçait le schéma 2.0, l'image livre le 3.0 ; ses trois
`.mjs` locaux sont des reliques 2.0 signalées à ne plus exécuter).

Chantier du 31/08 (soir) — **l'issue des appels d'outils, enfin écrite**.
Depuis toujours `ok` n'était jamais renseigné : le driver claude-code lisait
le nom d'un outil sur le bloc `tool_result`, qui n'en porte pas (seulement
`tool_use_id`), donc il annonçait « tool » ; serveur et coque cherchaient
ensuite l'appel en attente PAR NOM et ne trouvaient rien ; et la fixture du
test inventait le champ `name` que le SDK n'envoie pas, donc la suite
validait le bug. Conséquence visible : tous les appels d'outils de tous les
fils, même vieux de dix jours, dessinés « en cours » (le style `--done` /
`--failed` existait et n'était jamais atteint), et un JSONL incapable de dire
quel appel avait échoué. Corrigé sur les 3 étages : `id` optionnel au contrat
(`tool-use` / `tool-result`), les DEUX drivers le portent (copilot avait déjà
l'id en interne et le jetait — son test s'appelait pourtant « pairs a tool
call with its result by id »), et les deux consommateurs (turns.ts, stream.ts)
apparient dessus, le nom ne restant qu'un repli pour un driver sans id. L'id
ne va PAS au stockage : c'est de la plomberie, pas ce que la coque a dessiné.
7 tests neufs, 1165 + 179 verts, typecheck/build OK, **banc constaté**
(`bench/scenarios/tool-outcomes.mjs`) : deux Read en vol, le PREMIER échoue —
losange rouge sur la bonne ligne, la seconde encore pâle, puis rouge+vert au
règlement, et un fil rechargé qui porte ses issues, clair et sombre.

Chantier du 31/08 — **transport « shell » pour les outils d'instance** (revue
et fusion de la proposition de l'instance copilote). Le besoin : une org
verrouillée valide chaque serveur MCP du CLI contre son registre maison, donc
le serveur shell-tools est jeté et l'agent perd `rename_conversation` /
`new_id` sans que le tour le dise. Livré : `driver.shellToolsTransport`
(`mcp` par défaut, `shell` en échappatoire), le driver copilot écrit un petit
CLI sous son home et arme `ADESTIA_TOOLS_SOCKET` / `ADESTIA_TOOLS_TOKEN` /
`ADESTIA_TOOL_BIN` dans l'env de l'enfant — les outils passent par l'outil
execute ordinaire, plus rien à filtrer. Socket, dispatch unique et jeton par
tour inchangés : c'est le dernier saut qui bouge, pas la doctrine. Ajouté à
la revue : la doc qui manquait (DESIGN.md « Shell tools » + journal du 31/08,
`adestia.config.example.yaml`) et le scénario de banc `editor-bullets.mjs`
qui constate l'autre commit de la branche (la puce de l'éditeur ne double
plus son interligne, clair et sombre). **Coût assumé et écrit : la
DÉCOUVERTE.** Sous `shell` aucun moteur n'énumère les outils — c'est aux
instructions du workspace (AGENTS.md) de dire que le CLI existe. Le cœur
n'écrit pas de prose d'instruction, et on n'a pas commencé pour une
échappatoire.

Chantier du 31/08 — **dev-flow lit sans cloner** (faute de conception
corrigée avant déploiement). Le premier lecteur supposait un clone local :
vrai sur le Mac où il a été écrit, faux dans le pod, qui ne détient que les
repos où il CODE. Monsieur a tranché : « les fiches doivent être rendues sans
répliquer tous les repos et les branches en local, sinon notre mode de
stockage est le mauvais ». Verdict : le **stockage est bon** (fiches dans le
repo, commitées avec le travail) — c'était le **chemin d'accès** qui était
faux. La règle de lecture est donc extraite dans `read.mjs` (`scanSource`) et
ne connaît plus que quatre primitives ; deux sources l'implémentent :
`git.mjs` (dépôt sur ce disque) et `forge.mjs` (API GitHub, **zéro clone,
zéro fetch programmé**). Les deux suites de tests posent les MÊMES assertions
sur la règle — deux lecteurs qui divergeraient sur ce que veut dire `main`
seraient deux produits.

⚠️ **Les deux ne voient pas la même chose, et l'écran le dit** (`⌁` forge,
`▪` disque). Sur la forge, `main` = ce qui a été POUSSÉ, et les branches de
chantier ne sont jamais poussées (doctrine de la galaxie) → un lot en `code`
y montre l'état que sa branche périme. D'où deux diagnostics distincts :
`no-lots-pushed` (≠ « pas de fiches ») et `branch-not-pushed` (≠ « branche
disparue ») — annoncer une fin à quelqu'un dont le coder est en pleine phrase
serait un mensonge. Constaté sur le réel : **ostia** remonte ses 8 fiches par
l'API, graphe et timeline compris ; **tessera** revient vide parce que son
`main` local est **9 commits en avance sur origin** — les fiches sont
commitées, jamais poussées. L'outil a dit vrai du premier coup.

Reste : le jeton GitHub lecture seule dans OpenBao, et le déploiement
(v0.18.0 — `v0.17.0` est un tag local mort posé 8 commits en arrière ; les
DEUX coques `golem` et `golem-skippy` épinglent la même image et se bumpent
ensemble). Passerelle vers les clones de `skippy.berard.me` **abandonnée** :
`adestia-skippy` est le futur coder, pas une vitrine sur l'ancien pod.

Chantier du 30/08 — **plugin « dev-flow » LIVRÉ** (9e plugin embarqué) : les
chantiers de la galaxie Tessera/Ostia dans une fenêtre. D'abord nommé `lots`
(le dossier qu'il lit), renommé **`dev-flow`** sur arbitrage de Monsieur, avec
la règle qui va avec, gravée dans `skills/plugin-author/SKILL.md` : **un id de
plugin est ANGLAIS, PARLANT et DISCRIMINANT** — il vit dans les fichiers de
config, les routes et les greps, bien après l'écran qu'il dessine. « lots »
nommait la donnée, pas le métier ; « chantiers » aurait aussi bien nommé un
suivi de travaux avec des artisans. Les plugins déjà embarqués (atelier,
voyages, journal, parcours, planif) violent la règle et ne sont **pas**
renommés : un id vit dans les configs et les marque-pages des gens. Lecture par **git et
git seul** (`read.mjs`) — `main` est l'index, la pointe de branche fait foi
pour SA fiche, les questions nées à cette pointe sont ramassées, aucune
énumération de branches : un état non commité n'existe pas, donc l'arbre de
travail n'est jamais lu. **Zéro écriture**, y compris pas d'overlay voisin à
la façon d'atelier/voyages : le seul geste sortant est `api.compose`, qui
dépose une phrase dans le composeur et s'arrête là. Dérivations dans
`graph.mjs` (qui a la main, bloqué, actionnable, tri topologique départagé par
`priority` puis id — seules les dépendances NON terminées gatent l'ordre) plus
deux qui font le produit : la **racine** d'un blocage (une question `open` en
amont, pas le lot juste devant) et le **nombre de lots qu'elle gèle**, qui
trie le bandeau « à trancher en premier ». Dépôts scannés = config opérateur
via le secret déclaré `DEV_FLOW_REPOS` (seul canal instance→plugin ; une page
serait une primitive de lecture de fichiers ré-orientable). Dégradations
dites à l'écran, jamais devinées : pas de dépôt configuré, pas de `main`, pas
de `.agent/lots/`, branche disparue (info — c'est la fin normale d'un lot),
frontmatter illisible, id dupliqué, dépendance inconnue, cycle. Deux pièges
payés : `git` **ajouté à l'image** (le plugin ne sert à rien sans, et
node:22-slim n'en a pas), et `safe.directory=*` + `core.fsmonitor=` dans l'env
des appels git — un dépôt bind-monté appartient à l'uid de l'hôte et git
refuse « dubious ownership », ce qui serait arrivé à l'écran en « pas un dépôt
git ». **Aucune skill** : le contrat des fiches vit dans les
`.agent/lots/README.md` des repos scannés, une copie ici dériverait. 29 tests
neufs (1158 + 175 verts), typecheck/build OK, **banc constaté**
(`bench/scenarios/dev-flow.mjs` + son `dev-flow.prep.sh` : run.sh sait désormais
qu'un scénario voisin d'un `<nom>.prep.sh` réclame des montages — deux vrais
dépôts git jetables et une config qui allume le plugin). Lettre de mission
détruite dans le même commit, comme elle le demandait.

Chantier du 30/08 — **outils shell LIVRÉS** (suite immédiate du spike
ci-dessous, décision de Monsieur : in-process pour claude-code + pont pour
copilot, le pont restant un bien commun du serveur). Livré : registre
`server/src/shell-tools.ts` (un outil = nom + schéma string-only + handler +
enjeu ; `rename_conversation` et `new_id` ULID maison), prise **socket Unix**
(MCP en JSON-RPC ligne à ligne, repli tmpdir si le chemin dépasse ~100 octets,
connexions multiples par tour assumées), pont générique **écrit par le
serveur** dans le dataDir (source embarquée — aucun fichier à faire porter au
build), jetons de tour opaques (SANS rotation : un message mis en file
frapperait un jeton neuf et tuerait celui du tour en cours — TTL 6 h + purge à
la frappe, révocation au settle), compaction du JSONL au settle d'un tour qui
a renommé (le `compact()` orphelin enfin branché, hors course avec les appends
du finish). Contrat drivers : `TurnRequest.tools?: ShellToolsHandle`
(socketPath, token, bridgePath, specs, `call()` par closure) +
`shell-tools-config.ts` partagé ; claude-code reçoit un `toolsHost` injecté au
boot (instance `createSdkMcpServer` construite dans start.ts, zod importé
dynamiquement comme le SDK — non déclaré, même précédent) avec repli pont si
absent ; copilot ajoute l'entrée `local` pont dans son `adestia-mcp.json` par
tour. Route `/api/turn` : frappe du handle si conversation, release dans le
`finish` (et sur abort). Front : `refreshThreads()` au settle de chaque pompe
— refetch de la liste ET patch de la copie locale `session(id).title` qui
masquerait le titre frais dans l'onglet. Doctrine gravée dans DESIGN.md
(section « Shell tools » + Decision log 30/08) : trois surfaces jamais
confondues, cible implicite, l'auteur frappe l'id, outils qui répondent,
signal = contingence documentée. 20 tests neufs (15 service + 2 app + 2
drivers + 1 front), 1158 + 146 verts, typecheck/build OK, **banc constaté**
(`bench/scenarios/agent-rename.mjs`, 4 captures : onglet encore périmé
mi-tour, suit au settle sans reload, liste d'accord, sombre OK). Piège de
worktree appris : les symlinks workspace de `node_modules` pointent vers le
checkout primaire → `npm ci` DANS la worktree avant `tsc --build`, sinon le
typecheck lit les d.ts périmés du voisin. Tag **v0.17.0 posé en LOCAL
seulement** (décision de Monsieur : « tag mais release pas ») : le workflow
docker-publish.yml se déclenche sur tout tag `v*` poussé, donc `git push
origin v0.17.0` EST la release — image GHCR publiée. Reste : cette release
quand Monsieur la voudra, et le lecteur « shim exec » du registre si une
instance interdit un jour exec+MCP.

Spike du 30/08 — **transport des outils shell** (`spikes/shell-tools-transport/`) :
conception débattue sur plusieurs sessions pour « l'agent agit sur sa propre
instance » (premier outil : renommer la conversation). Doctrine convergée :
un REGISTRE unique (nom, schéma, handler, `stakes`) ; cible IMPLICITE — l'agent
ne manipule jamais un id, le serveur résout user+conversation via un jeton de
tour opaque ; TROIS surfaces jamais confondues (publique/ingress, MCP externe
`mcp-in`, organes internes agent-only hors listener publié) ; MCP retenu comme
famille de transport (réponse synchrone exigée par Monsieur : l'agent doit
savoir si l'action a échoué pour le raconter ou réessayer — ce qui a éliminé
le transport « signal dans la sortie », gardé en plan de contingence documenté).
Spike EXÉCUTÉ (SDK 0.3.237, 5 tours haiku réels) : (1) un serveur MCP stdio est
respawné À CHAQUE tour, `resume` compris → un jeton par tour dans son `env` est
frais par construction ; (2) le pont générique stdio↔socket Unix (30 lignes,
zéro logique MCP) fonctionne — noter : PLUSIEURS connexions socket par tour, et
un socket mort dégrade proprement (`failed` au status, le tour finit sans
erreur) ; (3) `createSdkMcpServer` tourne bien IN-PROCESS (état d'instance
partagé entre tours — le contexte de tour doit être par closure), mais c'est
asymétrique (copilot exige un vrai transport) et non sérialisable au contrat
drivers. Le choix du transport n'est PAS arrêté — décision de Monsieur au vu
du rapport ; ensuite : graver la doctrine dans DESIGN.md + lettre de mission
(registre + premier outil + `compact()` orphelin à brancher + refetch UI fin
de tour).

Correctif du 30/08 après mise en prod — **trois plugins étaient aveugles hors
layout de référence** (« Aucun workbook » sur le pod alfred). `atelier`,
`voyages` et `parcours` calculaient leur racine en `join(workspaceRoot,
'pages')` alors que le nom du dossier est de la config (`workspace.pages:
memory` chez Alfred). Le contrat `PluginApiContext` expose désormais
`pagesRoot` (résolu par la coque), les trois plugins le consomment, le test
« aware » épingle la clé ET la valeur, et le skill plugin-author dit la règle.
Livré en **v0.16.1**.

Chantier du 30/08 — **le skin alfred reprend le blason de l'agent-pod**
(dégradé accent `#12a7c0 → #075463`, plus évolué que l'aplat de la réécriture),
même geste que le crest skippy en v0.15.0 : SVG repris de
`agent-pods/images/agent-gw/app/static/icon.svg`, rasters re-rendus dans le
Chromium du bench (plein bord, opaques, marque dans les 80 % centraux). Tag
**v0.16.0** = première image publiée sous `ghcr.io/antorfr/adestia` — la mise
en prod d'« Alfred Adestia » sur `alfred.berard.me` se joue côté `k8s-home-lab`
(l'agent-pod alfred migre sur `alfred.homepod.berard.me`).

Chantier du 29/08 — **le produit s'appelle Adestia** (ex-Golem, nom pris par
Golem Network et Golem Cloud). Du latin *adest* — « elle est présente » — et
une sonorité de prénom : l'instance prend le nom de son agent (Alfred,
Skippy…), le produit nomme la classe. Choix du propriétaire en connaissance
d'une homonymie ASSUMÉE : Adestia AB, société suédoise de tech de salles de
réunion (rachetée par Reledo en 2025) — hors IA/agents, risque jugé
acceptable ; registres de code tous libres. Le repo a porté « Demeura »
pendant UN commit (c422f0f, repli proposé pendant la clearance) avant que le
choix Adestia soit confirmé. Renommage intégral : paquets
`@antorfr/adestia-*`, binaire, env `ADESTIA_*`, manifestes de découverte
`adestia-plugin.json`/`adestia-skin.json`, tokens CSS `--adestia-*`, config
`adestia.config.example.yaml`, image `ghcr.io/antorfr/adestia`. Seuls les
relevés bruts `spikes/*/raw/` gardent « golem » (logs capturés, on ne
réécrit pas). Le repo GitHub est renommé ; les versions < 0.14 sur GHCR
restent publiées sous l'ancien nom d'image.

Conception posée le 27–29/08 — **identité et références de fiche**. Une
référence est aujourd'hui un CHEMIN (`refs: [taches/poncer-porte]`), et
`resolveList` laisse tomber en silence celle qui ne résout plus : déplacer un
fichier raccourcit la liste sans un mot. Décidé en trois couches, aucune ne
connaissant le mot « tâche » : un `id:` par fiche (ULID par défaut, ou déclaré
quand un référentiel extérieur le possède), une référence canonique
`<type>/<slug>#<id>` écrite dans le wikilink QUI EXISTE DÉJÀ (mesuré : les trois
formes font l'aller-retour octet pour octet, et `[[task:…]]` résoudrait
faussement — `aliasDivider` vaut `:`), et une puce d'état tirée de `status.ts`,
générique pour n'importe quelle page. Quatre arbitrages rendus par le
propriétaire : pas de passe de scellage (sans id, une fiche est « pas encore
liable », pas en faute) ; l'agent frappe l'id en tour de fond selon la politique
de l'instance ; le même tour répare la référence qu'il vient d'écrire ; pas de
migration de vocabulaire (un sens un mot, les nouveaux types en anglais).
Journal de décisions à jour dans `DESIGN.md`. **Rien n'est codé.**

Mission posée le 29/08 — **plugin « coproj »** (suivi de programme/projets/
sujets, façon comité de projet), en ALPHA : `.agent/mission-coproj-plugin.md`.
Les blocs y sont classés par PROVENANCE de la donnée — rédigé (le texte est dans
la fiche, coût nul), requête (récupéré de l'index), asset voisin — parce que
c'est la provenance qui décide du coût, pas l'apparence. Six blocs sur neuf sont
rédigés, donc de la mécanique qui tourne déjà. Le plugin arrive en QUATRIÈME
position : il présuppose l'identité, l'index côté lecteur et les références
typées. Les données d'exemple sont inventées et Monsieur fournira des cas réels
— ne rien figer dessus.

Chantier du 29/08 — le skin skippy reprend le **blason d'agent-pods**
(halo, double anneau, graduations) à la place du réticule simplifié :
`icon.svg` transplanté (commentaires passés en anglais, repo public) et les
trois rasters (180/192/512) re-rendus via le Chromium du bench — rien
d'installé sur la machine, l'image n'embarque toujours pas de rastériseur.

Chantier du 28/08 — **l'index des pages devient vivant** (le bus d'événements
que DESIGN.md promettait depuis le début, jamais construit). Le bug : l'agent
crée une page → invisible du front sans F5, car `/api/pages/index` n'était
fetché qu'UNE fois au montage. Désormais : chokidar sur l'arbre des pages
(`server/src/watch.ts`), démarré au PREMIER abonné seulement (serveur sans
navigateur = zéro travail FS, avec un linger de 10 s), débounce en lots
(250 ms de calme, plafond 1 s), filtré `.md` hors segments pointés →
endpoint SSE permanent `GET /api/events` (pings 30 s, fermé proprement au
shutdown). Côté front `app/live.ts` suit le flux (reconnexion avec backoff,
resync après une coupure, 404 = feature éteinte → on s'arrête) et refetch
l'index entier — la page OUVERTE n'est PAS rechargée (l'éditeur peut tenir
des mots non sauvés ; son check de révision arbitre déjà au save). Config
`workspace.watch` : `enabled` (défaut true), `polling` + `intervalMs` (défaut
2000) pour les montages que les événements natifs ne traversent pas — le cas
réel de Monsieur : workspace sur /mnt/c (NTFS via WSL, synchro OneDrive) ⇒
`polling: true` recommandé chez lui. Scénario bench auto-vérifiant
(`bench/scenarios/live-pages.mjs`) : la tuile doit apparaître SANS reload.
Resterait un jour : pousser les changements aux plugins (ils refetchent
l'index à leur montage seulement) et rafraîchir la page ouverte quand
l'éditeur est propre.

Chantier du 27/08 — le retour immédiat du chat (2 bugs de la vague 1) :
(1) les « … » n'apparaissaient qu'au PREMIER event SSE du serveur — entre
l'envoi et le spawn du CLI (création de conversation + POST + démarrage),
des secondes d'écran muet qui se lisaient « message avalé ». `setLive` part
maintenant AVANT toute requête (`INITIAL_TURN`), le premier état du stream le
remplace. Au passage, un fetch qui REJETTE (réseau coupé) laissait le tour
sans trace — pire avec les points levés d'entrée, ils auraient pulsé pour
toujours : l'erreur atterrit désormais en bulle d'erreur.
(2) la mise on hold du prédécesseur PORTÉE : un message envoyé pendant qu'un
tour court lançait un DEUXIÈME `runTurn` concurrent — deux streams
entrelaçaient leurs états dans la même bulle live et deux process CLI
reprenaient la même session à la fois. Désormais il est RETENU (bulle à
mi-voix, bord tireté), et la file part en UN SEUL tour fusionné (textes en
paragraphes, pièces jointes concaténées) quand le tour courant se pose —
exactement le contrat d'agent-gw (`flushQueue`). L'id de conversation passe
par une ref : la boucle de vidage survit à sa closure, et lu depuis l'état
elle aurait ouvert un second fil. 3 tests (points immédiats, retenue +
fusion, bulle unique).

Chantier du 27/08 (suite) — **les tours appartiennent au serveur** (`TurnDesk`,
`server/src/turns.ts`). Le constat de Monsieur était juste : la file du matin
vivait en RAM d'onglet — un refresh, un iOS qui endort la PWA, et pouf.
Désormais un tour est un JOB détaché de la requête HTTP ; la réponse SSE n'est
qu'un ABONNÉ (déconnexion = désabonnement, jamais la mort du tour, la
transcription s'écrit même sans spectateur). Un message posté pendant un tour
répond `202 held` : écrit dans le fil À L'ACCEPTATION (la garantie anti-void),
mis en file côté serveur, expédié en UN tour fusionné à la fin du courant —
la session reprise est CHAÎNÉE depuis le result du tour qui vient de finir,
pas depuis le sessionId (périmé) que portaient les POST retenus. Adoption :
`GET /api/turn/attach?conversation=` rejoue le journal d'événements coalescé
(deltas de texte fusionnés) puis suit en direct — même réducteur front, zéro
nouveau type d'événement ; une question déjà répondue est purgée du rejeu
(`scrubAsk` branché sur `/api/permission`). Le front ne PORTE plus la file,
il l'affiche (bulles retenues → promues en messages ordinaires quand leur
tour démarre) et se ré-attache : après chaque tour (le desk installe le
suivant AVANT d'annoncer la fin de l'ancien — c'est la garantie d'adoption,
testée), et à l'ouverture d'un fil (reload en plein tour → on recolle en
vol). Une course réelle attrapée par les tests : la chaîne s'enregistre à
l'ADMISSION (synchrone), pas au start — un `await` d'écriture disque les
sépare, et un POST glissé dans la fenêtre courait en parallèle. Cap global
inchangé (429 pour un tour frais, jamais pour le backlog d'une conversation,
qui tient sous UN slot). La file ne survit PAS à un restart serveur (choix :
les textes sont déjà dans le fil ; rejouer des prompts vieux d'une semaine au
boot serait pire). L'ordre du store est CHRONOLOGIQUE : b et c dits pendant
la réponse à a précèdent cette réponse dans le fil. 8 tests desk + 2 routes +
2 front (retenue serveur, adoption à l'ouverture). Chemins horloge/MCP
inchangés (même limiteur).

Chantier du 27/08 (3e volet) — **onglets de conversations** (demande de
Monsieur ; 2 sous-agents en parallèle sur le serveur et le module pur, la
refonte de Chat.tsx à la main). Le chat tenait UNE conversation en singleton
— au passage, ça corrige le bug rapporté en cours de route : les « … » et la
trace d'outils d'un tour apparaissaient dans TOUTES les conversations, la
pompe écrivait dans un état que tous les fils dessinaient. Désormais chaque
onglet porte sa SESSION (`TabSession` : fil, live, retenus, sessionId, poids
de contexte, unread) dans une ref + redraw — les pompes survivent aux
closures de rendu. Bandeau d'onglets sur DESKTOP (mobile : la liste, mêmes
pastilles) ; pastille à 4 états, UNE précédence (`dotFor` dans `tabs.ts`,
pur, 27 tests) : waiting (ambre, pulse) > working (accent, pulse) > unread
(accent) > idle. Fermer un onglet ≠ archiver : deux icônes, la croix ne
touche pas la conversation (toujours en liste), la boîte archive ET ferme.
Persistance façon navigateur (`adestia.tabs` : ordre + membres + actif) ; un
refresh RESTAURE les onglets (desktop) ou le dernier actif (mobile), chacun
se ré-attachant à son tour en cours via le desk. Drag & drop HTML5 pour
réordonner (souris — pas le rail Pointer Events du mode Ranger, assumé :
surface desktop). Onglet brouillon `draft` renommé EN PLACE vers l'id réel à
la création du fil. Serveur : `TurnJob.waiting` (suivi par id de question),
`TurnDesk.active()`, et `/api/conversations` porte `turn: running|waiting`
calculé par requête — les pastilles de la liste lisent ça + les marques de
lecture locales (`adestia.read`, borné à 200). `createConversation` refuse
désormais un méta sans id (une réponse `{}` devenait un onglet-clé
`undefined`). Piège de test appris : `findByText` DANS un `act()` fige son
polling. 5 tests d'onglets + 27 tabs.ts + 4 serveur.

**Constaté au navigateur** (image Docker locale + Chrome 151 headless piloté
en CDP, `shoot.mjs` de session — banc jetable : conteneur + conf vide, 3
conversations semées par l'API, 13 captures bureau/sombre/mobile). Deux
défauts que SEUL le navigateur montrait, corrigés dans la foulée :
(1) `.adestia-chat` était une grille `auto 1fr auto auto` — la barre d'onglets
insérée devenait la rangée `1fr` et se dessinait en trois colonnes pleine
hauteur qui avalaient le fil. Passé en flex-colonne : les bandeaux optionnels
(onglets, liste, question) prennent leur hauteur naturelle, seul le fil
grandit. (2) Les deux icônes d'onglet (archiver/fermer) réservaient leurs
22 px même invisibles → « Plan du garage » tronquait en « Plan d… ». Largeur
0 au repos, révélées au survol ET au `:focus-within` (clavier). Vu et
validé : barre à 3 onglets titres lisibles, actif fusionné, outils au survol,
drag & drop réordonne (DragEvents natifs), refresh restaure ordre + actif
(`adestia.tabs` constaté), croix ferme sans toucher la liste, pastilles 4 états
(waiting/working forcées pour la CSS — pas de CLI dans le banc), sombre OK,
mobile : pas de bandeau, liste à pastilles, dernier ouvert restauré. Piège de
banc : `docker build .` depuis le checkout primaire reconstruit main, pas la
worktree — builder par CHEMIN explicite.

**Livré en 0.13.0 et déployé** sur homenode (image multi-arch amd64+arm64,
manifeste bumpé dans k8s-home-lab, pod `ghcr.io/antorfr/adestia:0.13.0` ready,
« 8 of 8 plugin(s) active », skin alfred, 12 MCP, OIDC). Emporte les trois
chantiers du 27/08 : indicateur immédiat + hold, tours possédés par le
serveur (file/fusion/adoption), onglets de conversations. NB versions :
0.11.0 → 0.12.2 avaient été livrées par l'autre session (posture ask, puis
retour open) — d'où le saut depuis 0.10.2.

Chantier du 27/08 (4e volet) — **une heure dans une page la passait en lecture
seule.** `micromark-extension-directive` lit aussi `:nom` EN LIGNE : « 19:30:59 »
se parsait en texte « 19:30 » suivi d'une directive nommée `59`, le validateur
la signalait comme bloc inconnu, et la page se verrouillait pour avoir mentionné
une heure. Le vocabulaire de Adestia n'a aucune forme en ligne — tout y est un
conteneur `:::` — donc la construction est retirée de la GRAMMAIRE plutôt
qu'excusée dans le validateur : renderer, éditeur et validateur continuent de
voir le même arbre. `:::` et `::` sont intacts. 3 tests d'épingle.

Chantier du 28/08 — **un tour n'est pas UNE réponse.** Rapporté par Monsieur
(soupçonné spécifique à Copilot ; il ne l'est pas — les deux drivers émettent
le même entrelacement `text-delta`/`tool-use`, le défaut est dans la coque).
Deux défauts d'un même endroit : (1) l'indicateur « … » était l'ALTERNATIVE au
texte (`live.text ? prose : dots`) — la première phrase le tuait, et l'agent
pouvait travailler des minutes derrière une bulle qui avait l'air finie ; il
reste désormais levé tant que le tour court, SOUS ce qui a été dit. (2) tout
le tour s'accumulait dans un seul `text` : la deuxième réponse se collait au
bas de la première et le deuxième paquet d'outils se retrouvait au-dessus des
DEUX. `TurnState` porte maintenant des PARTIES (`TurnPart`) — un outil appelé
après que l'agent a parlé ouvre la suivante, c'est-à-dire exactement la césure
que le lecteur voit. Une partie = une bulle, et une bulle = un `StoredMessage`
(sinon un refresh recollait ce que le direct venait de séparer). La règle est
écrite deux fois, coque et serveur, comme `TurnEvent` l'est déjà : le paquet
web ne dépend pas du serveur ; deux tests, un de chaque côté, mangent le même
entrelacement et attendent la même césure. Fin du tour (interruption, erreur,
usage) portée par la DERNIÈRE partie — c'est là que la pastille de contexte
lit `usage`. 12 tests remis au nouveau contrat, 5 nouveaux.

Chantier du 28/08 (suite) — **le banc graphique n'est plus jetable.** Il était
réinventé à chaque session (`shoot.mjs` de session, cf. le 27/08) ; il vit
maintenant dans `bench/`, en une commande : `bench/run.sh [scénario]` construit
l'image PAR CHEMIN, la démarre sur un `dataDir` jetable, pilote Chromium
headless en conteneur, et démonte tout. Rien ne s'installe sur la machine.
Ce qui est réel : l'image, le serveur, la coque, son réducteur, ses composants.
Ce qui est faux : le MOTEUR seul — l'image n'embarque aucun CLI, donc un proxy
répond aux deux routes de tour avec un flux SSE que le scénario cadence à la
main. L'état que le STORE possède (fil rechargé) se sème en écrivant le JSONL
dans le volume monté. `CLAUDE.md` porte désormais la consigne : si ça dessine,
on le regarde avant de fusionner — et si Docker manque, on le DIT plutôt que de
faire passer du vert pour du vu. Le chantier « parties de tour » est le premier
constaté ainsi (7 captures : indicateur sous la première réponse, deuxième
bulle avec sa trace, posé, depuis le store en clair/sombre/mobile).

**État :** Migration Alfred. Faits et vérifiés en navigateur : `todo`,
`planif`, `collections`, `scan`, skin `alfred`. 1119 tests + 146 de plugins.
Facette `blocks` CÂBLÉE : elle était chargée et narrowée depuis le début, et
personne ne lisait le résultat. Un bloc se déclare en deux moitiés — le
manifeste (`vocabulary`) dit ce qu'il EST, pour que le SERVEUR le valide sans
exécuter de code navigateur ; le module dit à quoi il ressemble. Le pont `{% %}`
suit le vocabulaire, donc une fiche partagée rend un bloc de plugin sans être
réécrite. Premier client : `parcours` porté (carte sans biblio, profil, mode
balade, GPX octet-pour-octet identique au prédécesseur) — sauf le hors-ligne,
qui demande un service worker que Adestia n'a pas. **Livré en 0.5.0 et déployé**
sur homenode, `features: [scan, parcours]` : 7 plugins sur 7 actifs.
Missions ajoutées à planif (`until:` → la note se termine seule, `done:` par
l'agent, `expired:` par le produit), avec porte d'écriture par contenu sur la
zone planif — non couverte côté driver Copilot, qui n'a pas de broker.
Login Copilot : device-code relayé, sous pty (la question « stocker en clair ? »
n'est posée que sur un terminal), consentement explicite de l'utilisateur par
case à cocher. Vérifié de bout en bout contre un vrai compte, en conteneur sans
keychain — capture dans `spikes/copilot-cli/raw/login-device-code-plaintext.txt`.
Chrome d'édition Crepe réparée : Adestia n'importait que la STRUCTURE du thème,
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
pod `ghcr.io/antorfr/adestia:0.6.0` ready, 7 plugins sur 7 actifs au boot).
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
Décompte du Dockerfile passé à huit plugins ; le `adestia.config.example.yaml`,
lui, ne nomme aucun plugin (listes vides par conception : « la présence est la
découverte, jamais l'activation »), il n'y avait donc rien à y déclarer. Et
`plugins/README.md` annonçait encore UNE skin alors que trois sont livrées
depuis le portage de Nestor et Skippy — corrigé, les deux ont leur ligne.
**Livré en 0.8.0 et déployé** sur homenode (image multi-arch, manifeste bumpé,
pod `ghcr.io/antorfr/adestia:0.8.0` ready, « 8 of 8 plugin(s) active » au boot,
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
manifeste bumpé, pod `ghcr.io/antorfr/adestia:0.10.0` ready, « 8 of 8 plugin(s)
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


Chantier UX du 26/08 (backlog dicté par Monsieur, fiche `adestia-evolutions`)
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
(1 bis) CommonMark replie un saut de ligne SIMPLE en espace — juste pour un
FICHIER, faux pour un message : personne ne coupe ses lignes à la main dans un
chat, et la bulle les montrait déjà (le texte brut tournait sous
`white-space: pre-wrap`). Les replier aurait été une régression payée par le
correctif, et le prédécesseur rendait avec `breaks: true` pour la même raison.
Fait dans la posture, pas dans la grammaire : celle-ci est partagée avec
l'éditeur et le serveur, où un fichier doit continuer de vouloir dire ce que
CommonMark en dit.
(2) `---` en tête d'un message est du FRONTMATTER pour la grammaire partagée,
et la posture page le mine en pastilles de statut — donc un message qui ouvre
sur une règle perdait son premier bloc, en silence. La posture prose redessine
le texte à la place.
Vérifié au navigateur (Chrome headless, markup réel + CSS réelle), clair et
sombre. 6 tests, dont 5 en échec sans le correctif.

PWA installable (worktree `feat-installable-pwa`) — le dernier point de la
barre de parité qui restait ouvert. Le **manifeste est GÉNÉRÉ** et servi
pré-boot : celui du produit, avec le fragment `web.manifest` de la skin
active fusionné par-dessus. Le champ `manifest` du schéma de skin existait,
était validé, et **personne ne le lisait** depuis le début. La fusion est une
liste blanche de NOM et de COULEUR (`name`, `short_name`, `description`,
`theme_color`, `background_color`, `lang`, `dir`, `categories`) : `start_url`,
`scope`, `id` et `display` restent au produit — une livrée qui déplace le
point d'entrée change ce que l'app EST, la ligne que `skin.css` ne franchit
déjà pas. Le reste est jeté ET nommé au log de démarrage, lu au BOOT et pas à
la requête. Les icônes sont **refusées** dans le fragment et prises par
CONVENTION (`assets/icon-180/192/512.png`, à côté de l'`icon.svg` que la skin
sert déjà) : le manifeste est servi depuis la RACINE alors que les fichiers de
la skin vivent sous `/skin/`, donc un `src` relatif s'y résoudrait contre le
mauvais dossier — en silence, et visible seulement une fois installé.

Trois faits vérifiés AVANT d'écrire, chacun inversant la reco s'il est faux :
(1) **iOS ignore les icônes du manifeste** et lit `apple-touch-icon` — PNG,
opaque, 180×180 — donc le vecteur seul aurait installé une tuile blanche sur
la plateforme la plus susceptible d'installer ; (2) **le manifeste et le
worker sont récupérés par le NAVIGATEUR, pas par la page**, donc derrière la
porte OIDC ils répondaient 401 et l'offre d'installation n'apparaissait
jamais — ils rejoignent l'ensemble public explicite à côté de `/api/health`,
avec les icônes ; (3) **une coque servie depuis le cache d'abord, c'est le
bundle de la semaine dernière contre l'API de cette semaine**, sans geste
utilisateur qui le répare. D'où la politique : le document et tout ce dont le
nom survit au contenu passent par le RÉSEAU d'abord, seuls les `/assets/*`
adressés par contenu répondent depuis le cache (ils ne peuvent pas changer de
sens sans changer de nom), et `/api/` n'est **jamais** intercepté — un tour
SSE est un corps qui ne finit pas. Le jugement du worker est un module PUR
(`src/sw/policy.ts`, 12 tests) ; `build/sw.mjs` le bundle APRÈS Vite, parce
qu'il lui faut les noms des chunks d'entrée, et nomme le cache d'après un hash
de l'`index.html` bâti — il tourne exactement quand la coque change.

`name:` d'instance ajouté dans la foulée (demande de Monsieur, et elle
comblait un vrai trou) : une livrée règle DEUX instances portant DEUX livrées
et ne règle rien pour deux portant la même — le cas exact d'un opérateur qui
monte un second Adestia. Appliqué EN DERNIER, par-dessus la skin ; réglage de
FICHIER sans surcharge d'environnement, sur la ligne que ce produit trace
déjà (l'environnement dit OÙ une instance tourne, le fichier dit ce qu'elle
EST). Il atteint la coque autant que le manifeste, parce qu'**iOS propose le
TITRE DU DOCUMENT** quand on ajoute la page à l'écran d'accueil : un nom qui
s'arrêtait au manifeste aurait été ignoré sur la plateforme pour laquelle on
le voulait le plus. Le BRAND de l'en-tête reste à la skin — ce que l'OS
appelle cette fenêtre et ce que le corps s'appelle lui-même sont deux phrases
différentes. Vérifié : `document.title: Atelier` sur une instance habillée
skippy, manifeste `name`/`short_name` à « Atelier » et `theme_color` toujours
celui de la livrée.

**Constaté au navigateur** (Chrome 151 headless piloté en CDP) : worker
`activated`, cache `adestia-<hash>` à 11 entrées, `Page.getAppManifest` rend
`errors: []`, puis réseau coupé + rechargement → la coque BOOTE et affiche ses
propres mots (« Adestia could not start / Failed to fetch ») au lieu de la page
d'erreur du navigateur. L'`apple-touch-icon` servi est celui de la skippy,
octet pour octet. Les trois livrées sont habillées (nom, couleurs, rasters
rendus depuis leur `icon.svg`) ; les PNG sont COMMITÉS, pas générés au build —
aucun rasteriseur ajouté à l'image.


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
- [ ] PWA : l'invite d'installation elle-même reste à constater sur un VRAI
      appareil (iOS et Android) — headless ne la déclenche pas. Et le
      hors-ligne de `parcours` (tuiles de carte) est un autre chantier : le
      worker ne met en cache ni `/api/` ni les données d'un plugin.
- [ ] Backlog UX du 26/08, reste à traiter : 2 bugs de la vague 1 (pop-up
      d'autorisation qui ne se ferme pas au clic — posture « ask » encore
      marquée inachevée —, la fiche `adestia-evolutions` absente de la nav) ;
      l'indicateur « … » tardif est corrigé (27/08, avec la mise on hold
      combinatoire portée) ; les outils autorisés par défaut
      (décision de niveau de risque, pas un bug) ; la fusion apps/domaines
      (chantier d'archi, à cadrer — `sections.ts`/`owners.ts` viennent d'être
      refaits en 0.6/0.7 pour DISTINGUER ces deux notions) ; et Withings/mail/
      agenda « connectés mais muets », qui sent le 403 user-data côté rosetta
      plutôt qu'un bug de Adestia
