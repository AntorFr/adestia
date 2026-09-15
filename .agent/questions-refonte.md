# Questions — chantier refonte

> Une question vivante à la fois ; les autres attendent leur tour, dans l'ordre.

| # | Question | État | Réponse |
|---|---|---|---|
| 1 | Créer la worktree `refonte` (branche du même nom) pour tout le chantier ? | close | oui (15/09) |
| 2 | Réparer l'install partagée par `npm ci` à la racine ? Elle est incomplète (eslint et ses plugins, `@vitejs/plugin-react` absents) : sans elle, ni lint ni build web en local. `npm ci` réécrit le `node_modules` que toutes les worktrees partagent — à ne faire qu'à un moment où aucune autre session ne travaille. | close | oui, aucune autre session (15/09) — fait ; lint vert, build web vert |
| 3 | Dégraisser `.agent/status.md` (1702 lignes, 42 chantiers) au format ultra-light de la norme : état + prochaines étapes, l'historique restant dans git. Et le sort des `questions-*.md` closes et de `mission-project-management-plugin.md` (plugin livré). | close | oui (15/09) — fait |
| 4 | Faire porter par le cœur un petit kit d'aides pour les plugins (slug, frontmatter, cache) — côté navigateur via l'import map, côté `api.mjs` via `opts` — pour retirer les copies dans atelier, journal, voyages, todo, dev-flow, listening-post, meals. C'est un changement du contrat plugin (skill `plugin-author`, decision log). | close | non (15/09) : les copies font cinq lignes, un plugin autonome vaut plus ; noté dans `status.md` |
| 5 | Les types du protocole (`TurnEvent`, `TurnUsageView`, `StoredMessage`, `ConversationMeta`, `Conversation`, `McpServerView`) sont écrits deux fois, serveur et web, **délibérément** : le web ne doit dépendre d'aucun paquet serveur, et un test (`protocol.test.ts`) épingle l'égalité des deux déclarations. Les déclarer UNE fois dans `packages/schemas` (le web ne les importerait qu'en `import type`, effacé au build, donc zéro dépendance d'exécution) supprime le doublon et le test de garde. Ça renverse une décision écrite dans le code : je le fais ? | close | oui (15/09) — fait : `packages/schemas/src/protocol.ts`, événements de tour importés du contrat pilote en type seulement |
