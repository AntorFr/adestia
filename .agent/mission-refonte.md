# Refonte Adestia — synthèse consolidée (reprise de la session d83539f0, morte le 14/09 23h09 sur plafond de dépense)

Base : main @ 064067c, dépôt propre. LOC : server 21k, web 22k, drivers 7.9k, content 2k, schemas 0.7k, plugins ~26k (atelier 9.4k), bench 2.9k.
Référence mesurée : typecheck OK ; lint IMPOSSIBLE (eslint + plugins absents du node_modules, install incomplète, idem @vitejs/plugin-react → build web KO) ;
vitest 1564/1565 (1 test instable : app.test.tsx « a page that will not load > says the page is not there », 3/3 vert en relance) ; node:test plugins 560/560.
tsc --noUnusedLocals/Parameters : 2 seuls : content/src/pipeline.ts:36 `parent`, server/src/files.ts:130 `file`.

## A. Code mort (sûr)
- Fonctions/constantes exportées, 0 référence partout (même in-file) : drivers codex-cli/auth.ts:131 authModeOf ; server mcp-in.ts:77 DEFAULT_MCP ;
  web SettingsMenu.tsx:37 themeLede ; web chat/conversations.ts:83 renameConversation ; web plugins/loader.ts:35 SHARED_SPECIFIERS.
- Types exportés jamais utilisés : drivers contract.ts:466 AuthManagement, :474 ModelSelection, :478 SubscriptionQuotas, :502 McpStatus (à vérifier : capacités optionnelles vestigiales ?) ; server app.ts:250 BuiltApp.
- Test-only : content reference.ts formatReference, isValidId ; content validate.ts isEditable ; drivers conformance.ts assertConformance ; web conversations.ts deleteConversation (le serveur a DELETE /api/conversations/:id ; aucune UI ne l'appelle → décision produit, laisser).
- 149 exports utilisés uniquement dans leur fichier (38 fonctions/consts + 111 types) : `export` inutile.
- CSS shell.css : classes sans aucun émetteur (vérifié contre les noms construits dynamiquement) : adestia-canvas__spacer, adestia-chat__title, adestia-pages__link, adestia-prefs__note ; `.adestia-pages*` = concept retiré (liste plate), les tests en vérifient l'ABSENCE → règles mortes.
  FAUX POSITIFS de l'audit : adestia-stat--*, trace__item--*, pill--*, callout--*, diagnostics__item--*, row__cell--*, dot--*, problems--*, block--*, list--cards (construits par template) ; --crepe-* (consommées par la feuille de Crepe, test editor-chrome le garde) ; --breakpoint-mobile (lue par getPropertyValue).

## B. Doublons (vérifiés, extraits vus)
- server ↔ web, types de fil : StoredMessage / ConversationMeta / Conversation (server conversations.ts:18-45 ↔ web chat/conversations.ts:9-36) ; McpServerView (server mcp-store.ts:50 ↔ web McpServers.tsx:42) ; événements SSE (web chat/events.ts TurnEvent ↔ ce que app.ts sseFrame produit à partir de drivers contract.ts). Le web ne dépend que de content. Foyer naturel : packages/schemas (types de manifeste aujourd'hui) → ajouter les types « wire ».
- server : app.ts:880-900 (persistance de l'issue d'un tour dans la conversation) = delegations.ts:211 #persist. → helper dans conversations.ts.
- drivers : setCredentials + authStatus identiques codex-cli/driver.ts:222 ↔ copilot-cli/driver.ts:235 (claude-code à vérifier) ; mkdir home + écriture 0600 répétées. → helper « managed credential ».
- server : deux parseurs de frontmatter (pages.ts:142 parseFrontmatter typé, schedule.ts:104 frontmatterOf chaînes+corps) → un seul.
- plugins : makeCache (listening-post/api.mjs:38 exporté ↔ voyages/api.mjs:262 copie privée) ; slugOf ×3 (atelier, journal, voyages web/address.js) ; slugify ×2 (journal, todo web/model.js) ; parseFrontmatter/frontmatterOf ×3 (dev-flow/read.mjs, listening-post/lib/library.mjs, meals/shape.mjs) ; motif reload/useEffect ×2 dans todo (app.js:50 / blocks.js:75) et journal/listening-post app.js.
  Les plugins n'importent que react* via l'import map et ne peuvent pas s'importer entre eux → mutualiser = le cœur expose un kit (import map côté navigateur, `opts` côté api.mjs). C'est un changement du contrat plugin (plugin-author SKILL, DESIGN decision log).
- bench : threadsDir/line dupliqués dans agent-rename, arret-du-tour, turn-parts → bench.mjs.

## C. Concepts périmés / dérive doc
- README.md:58 « Two engines — Claude Code and GitHub Copilot CLI » → trois (Codex CLI) ; README.md:145 « 1045 tests » (réel : 1565 vitest + 560 node) → ne plus écrire de nombre.
- plugins/README.md:3 et :159 « eleven » → douze ; la table et l'exemple de config omettent project-management (kind feature) ; § contrats : project-management livre `project-management`.
- DESIGN.md:224 « a plugin must work on both engines » → « on every engine » (1650, 1672 = journal, laisser).
- Golem : plus rien hors .agent/status.md (historique) et spikes raw → RAS. `pagesRoot` : commentaires explicatifs « used to be » (stores.ts:369, plugin-host.ts:114) → garder. `#/instructions` : alias délibéré → garder.
- Local seulement : packages/drivers/dist/test/permissions.test.js (PermissionBroker n'existe plus) = sortie de build périmée, ignorée par git.

## D. Modules à découper
- server/app.ts 1295 : buildApp() = 1040 lignes, 12 familles de routes inline (health/instance/models 327-400, instructions 401-468, mcp 469-688, upload 689, conversations+turn+permission 711-1085, auth driver 1086-1235, delegations 1236-). Le motif existe déjà : mcp-routes.ts registerMcp(app, deps), oidc-routes.ts registerOidc. → routes/*.ts, app.ts = assemblage.
- server/config.ts 1146 : types 17-310, parse 310-929 (auth 501-573, mcp 658-886), parseConfig 929-. → config/types.ts, config/mcp.ts, config/auth.ts.
- server/start.ts 632 : buildDriver 91-212 → drivers.ts ; start() 410 lignes.
- server/shell-tools.ts 622 : une classe cohérente → laisser.
- web/chat/Chat.tsx 1774 : Chat() = 890 lignes, 7 states, 8 refs, 6 effects, 25 fonctions internes en deux groupes nets : onglets/sessions (session, refreshThreads, patchSession, renameSession, read, adopt, reread, openThread, activate, shut, archiveThread, dotOf → useThreads) et tour (turnOptions, ensureThread, promoteHeld, consume, pump, send, stop → useTurn) ; composants déjà séparés en tête (ContextPill, ModelPicker, ToolTrace, Bubble, LiveProse, AskPrompt, ComposerFold, Composer, AttachmentTray) → fichiers.
- web/app/App.tsx 1229 : App() = 1070 lignes, 16 states, 7 effects, JSX à partir de 881 ; section « problems » 1021.
- web/editor/Reader.tsx 1119 : rendu des blocs (TableBlock, ListBlock, Figures, Row, Written, Contributed, ContentBlock) → editor/blocks/*.tsx, render() reste le dispatcher.
- web/app/shell.css 3207 : 23 zones déjà délimitées par des commentaires (Chat 35, Markdown 164, Tool trace 296, Context pill 341, question 357, sign-in 404, Composer 451, Canvas 509, landing 561, search 965, mosaics 1048, cog 1422, settings app 1503, MCP 1540, Pages/editor 1811, Threads 2037, Delegations 2115, Tabs 2161, Settings 2309, Attachments 2426, composer fold 2499, Reading 2552, not-found 3146). Importé une fois par main.tsx (Vite) → découper en fichiers importés DANS LE MÊME ORDRE (la cascade dépend de l'ordre). Bench avant/après obligatoire (Docker dispo).

## E. Plugins vs cœur
- Toutes les routes appelées par les plugins existent (pages/index, pages/:path, files, instance ; /api/plugin/* déclarées par leurs api.mjs). Manifestes tous en contract 1 = IMPORT_MAP_CONTRACT 1.
- planif : seul plugin sans test.
- Reste non vérifié (l'audit est mort avant) : props reçues par chaque vue vs contract.ts ; SKILL.md de chaque plugin vs champs réellement lus.

## F. Hygiène
- .agent/status.md : 1702 lignes, 42 chantiers → la norme dit ultra-light (état + prochaines étapes ; l'historique c'est git). .agent/questions-*.md : closes. mission-project-management-plugin.md : 933 lignes, plugin livré.
- spikes/ : 203 fichiers suivis (2.8 Mo), enregistrements de validation cités par DESIGN.md → laisser. 1 Go sur disque = node_modules/homes non suivis.
- node_modules incomplet → `npm ci` (jamais install) pour lint + build ; réécrit l'install partagée → se demande.
- Test instable app.test.tsx (voir référence) → à corriger en passant si c'est une attente par compteur.
