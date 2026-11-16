# Inventaire — bench-pages

Statut : complet

Les fichiers de cette grappe sont des `node --test` que la suite attestée ne joue pas : les tests hors écran sont des tests vitest qu'elle joue. Deux sont nouveaux : `packages/server/test/pages-hors-ecran.test.ts` (la route des pages : ce qu'une sauvegarde laisse sur le disque, le refus quand l'agent a écrit dessous, la lecture après réécriture, suppression ou déplacement, le second magasin) et `packages/web/test/besoin-pages-code.test.ts` (les règles de jetons des cinq feuilles, une seule définition de `prettify` et `folderOf`, pas de `fetchImpl(`, fonctions courtes). Les autres sont des tests déjà présents.

`À l'écran` dit `gardé` partout : le codeur ne modifie ni ne retire un test existant. L'allègement ou le retrait des lignes `effet` et `scindé` revient au testeur, une fois le test hors écran rejoué.

Aucune ligne `sans-porte` : ce qui reste à l'écran (bandeau, placement, langue, icônes, contrastes, 360 px, focus, états de chargement, glisser des tuiles) est de l'affichage.

| Test | Classe | Hors écran | À l'écran | Raison |
|---|---|---|---|---|
| bench/tests/pages-besoin.test.mjs > B-8 · home: no word of the other language on a en instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · home: no browser-native control and no glyph used as an icon | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · section: no word of the other language on a en instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · section: no browser-native control and no glyph used as an icon | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · reader: no word of the other language on a en instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · reader: no browser-native control and no glyph used as an icon | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · readonly: no word of the other language on a en instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · readonly: no browser-native control and no glyph used as an icon | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · collection: no word of the other language on a en instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · collection: no browser-native control and no glyph used as an icon | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · missing: no word of the other language on a en instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · missing: no browser-native control and no glyph used as an icon | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · inactive: no word of the other language on a en instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · inactive: no browser-native control and no glyph used as an icon | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · editor: no word of the other language on a en instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · editor: no browser-native control and no glyph used as an icon | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · properties: no word of the other language on a en instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · properties: no browser-native control and no glyph used as an icon | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · blocksettings: no word of the other language on a en instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · blocksettings: no browser-native control and no glyph used as an icon | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · slash: no word of the other language on a en instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · slash: no browser-native control and no glyph used as an icon | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · home: a tile without an authored icon shows a sprite icon, not a character | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · home: every control reached by Tab shows a focus indicator | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · section: every control reached by Tab shows a focus indicator | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-7 · collection: every control reached by Tab shows a focus indicator | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-4 · home: Ctrl K and Meta K and a click on the ask bar put the cursor in the composer | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-4 · home: the brief shows its four entries under its heading, and an entry opens its target | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-4 · home: the refresh control asks the agent for a fresh brief in the instance language | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > Q-23 · home: while the first index request is pending, a status row says Loading and the greeting stays | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > Q-23 · home: when the index request fails the loading ends and the Settings tile is drawn | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-4 · home: Arrange switches the mosaic to arranging and the same control ends it | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-11 · an address whose app is not active falls through to Home | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-4 · section: exactly five pages show no search field; facet chips filter by state and toggle back | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-4 · section: past five pages a search field appears; a miss shows the shared empty state | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-4 · section: finished pages are folded, closed, under a summary | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-4 · the breadcrumb walks back up and Home leads to the landing canvas | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-5 · reader: typed blocks are drawn with their titles and content, and a wikilink opens its page | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-5 · reader: a lost wikilink is not a link | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-5 · reader: a block that asks for an absent plugin says so in an inline note with the shared form | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-5 · reader: a page the vocabulary refuses opens read-only with a lock, its raw source and its diagnostics | scindé | packages/server/test/pages.test.ts > opens a broken page read-only with its diagnostics | gardé | cadenas, source brute et diagnostics restent à l'écran |
| bench/tests/pages-besoin.test.mjs > P-5 · reader: the attachments strip lists files the body does not show | scindé | packages/server/test/files.test.ts > lists what is attached to a page | gardé | la bande reste à l'écran |
| bench/tests/pages-besoin.test.mjs > P-5 · reader: when the agent writes the page the open text is refreshed in place, without a reload | scindé | packages/web/test/page-follows-feed.test.tsx > a batch naming the path rereads and replaces the page without loading | gardé | le texte vu à l'écran sans rechargement reste |
| bench/tests/pages-besoin.test.mjs > P-5 · missing page: a 404 names the path, uses file-question, and the link leads to the folder above | scindé | packages/server/test/pages.test.ts > 404s a page that does not exist | gardé | le chemin nommé, l'icône et le lien restent à l'écran |
| bench/tests/pages-besoin.test.mjs > P-5 · missing page: a 403 (out of reach) shows lock and does not say the page does not exist | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-5 · missing page: a 401 (session) shows lock and does not say the page does not exist | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-5 · missing page: a 500 (server error) shows circle-alert and does not say the page does not exist | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-5 · missing page: the three failures say three different things | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-11 · inactive app: the shared empty state with a plug icon says the app is not active, and Home leads home | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-5 · collection: members are grouped in facet cards with count chips; the page counts them | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-5 · collection: the ask button (plus icon) sends the agent a request; absent when the collection has no into: | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-5 · collection: a facet whose members are all finished shows the shared empty state with a check | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-6 · editor: typing saves by itself after a pause, to the file, and Done returns to reading | scindé | packages/server/test/pages-hors-ecran.test.ts > leaves on disk the text it sent, and lets the next save follow on the revision it got back | gardé | le statut « Saved » et le retour à la lecture restent à l'écran |
| bench/tests/pages-besoin.test.mjs > P-6 · editor: when the agent wrote the file meanwhile, a warning says so, the editor keeps the text and nothing more is saved | scindé | packages/server/test/pages-hors-ecran.test.ts > refuses when the agent wrote meanwhile, and keeps the agent’s file whole | gardé | l'avertissement reste à l'écran |
| bench/tests/pages-besoin.test.mjs > P-6 · editor: the slash menu offers the blocks that have a body, and not app | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-6 · page properties: a popover over the frontmatter; Escape closes it and returns focus to its settings control | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-6 · page properties: editing the title rewrites the frontmatter and keeps the lines it does not know | scindé | packages/content/test/frontmatter.test.ts > leaves every line it was not asked about BYTE for byte | gardé | la fenêtre de propriétés reste à l'écran |
| bench/tests/pages-besoin.test.mjs > P-6 · block settings: Escape closes the popover and focus returns to the block's settings control; the form edits the block | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-6 · E-5 and E-6 on a 360 px phone stay inside the viewport with 8 px margins | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-4 · on a phone the canvas header returns to the conversation | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > P-4 · on a desk the canvas header has no Chat return | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · home: no word of the other language on a fr instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · section: no word of the other language on a fr instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · reader: no word of the other language on a fr instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · readonly: no word of the other language on a fr instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · collection: no word of the other language on a fr instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · missing: no word of the other language on a fr instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · inactive: no word of the other language on a fr instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · editor: no word of the other language on a fr instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · properties: no word of the other language on a fr instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · blocksettings: no word of the other language on a fr instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-8 · slash: no word of the other language on a fr instance | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > Q-23 · home: nothing held, loading has ended: the Settings tile and the shared empty state with a folder-open icon show | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-9 · the back above a plugin says Home with a chevron, and goes to the landing canvas | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > B-9 · opening a task keeps the shell back (Home) beside the plugin's own back, which names where it leads | affichage |  |  |  |
| bench/tests/pages-besoin.test.mjs > reader.css: no colour outside a var() fallback | effet | packages/web/test/besoin-pages-code.test.ts > write no colour outside a var() fallback in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > reader.css: no literal font size | effet | packages/web/test/besoin-pages-code.test.ts > write no literal font size in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > reader.css: no literal radius | effet | packages/web/test/besoin-pages-code.test.ts > write no literal radius in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > reader.css: no outline: none without a replacement ring in the same rule | effet | packages/web/test/besoin-pages-code.test.ts > write no outline: none without a replacement ring in the same rule in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > editor.css: no colour outside a var() fallback | effet | packages/web/test/besoin-pages-code.test.ts > write no colour outside a var() fallback in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > editor.css: no literal font size | effet | packages/web/test/besoin-pages-code.test.ts > write no literal font size in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > editor.css: no literal radius | effet | packages/web/test/besoin-pages-code.test.ts > write no literal radius in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > editor.css: no outline: none without a replacement ring in the same rule | effet | packages/web/test/besoin-pages-code.test.ts > write no outline: none without a replacement ring in the same rule in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > home.css: no colour outside a var() fallback | effet | packages/web/test/besoin-pages-code.test.ts > write no colour outside a var() fallback in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > home.css: no literal font size | effet | packages/web/test/besoin-pages-code.test.ts > write no literal font size in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > home.css: no literal radius | effet | packages/web/test/besoin-pages-code.test.ts > write no literal radius in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > home.css: no outline: none without a replacement ring in the same rule | effet | packages/web/test/besoin-pages-code.test.ts > write no outline: none without a replacement ring in the same rule in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > mobile.css: no colour outside a var() fallback | effet | packages/web/test/besoin-pages-code.test.ts > write no colour outside a var() fallback in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > mobile.css: no literal font size | effet | packages/web/test/besoin-pages-code.test.ts > write no literal font size in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > mobile.css: no literal radius | effet | packages/web/test/besoin-pages-code.test.ts > write no literal radius in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > mobile.css: no outline: none without a replacement ring in the same rule | effet | packages/web/test/besoin-pages-code.test.ts > write no outline: none without a replacement ring in the same rule in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > missing-page.css: no colour outside a var() fallback | effet | packages/web/test/besoin-pages-code.test.ts > write no colour outside a var() fallback in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > missing-page.css: no literal font size | effet | packages/web/test/besoin-pages-code.test.ts > write no literal font size in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > missing-page.css: no literal radius | effet | packages/web/test/besoin-pages-code.test.ts > write no literal radius in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > missing-page.css: no outline: none without a replacement ring in the same rule | effet | packages/web/test/besoin-pages-code.test.ts > write no outline: none without a replacement ring in the same rule in the five pages sheets | gardé |  |
| bench/tests/pages-besoin.test.mjs > prettify and folderOf are defined once in packages/web/src | effet | packages/web/test/besoin-pages-code.test.ts > defines prettify and folderOf once in packages/web/src | gardé |  |
| bench/tests/pages-besoin.test.mjs > no fetchImpl( call in the pages files outside the shared request helper | effet | packages/web/test/besoin-pages-code.test.ts > calls fetchImpl( in no pages file outside the shared request helper | gardé |  |
| bench/tests/pages-besoin.test.mjs > Reader.tsx, Editor.tsx, App.tsx and Home.tsx hold no function longer than 250 lines | scindé | packages/web/test/besoin-pages-code.test.ts > holds no function longer than 250 lines in Reader, Editor and Home | gardé | Reader, Editor et Home sont portés ; App.tsx a une fonction de 267 lignes, donc la ligne est déjà rouge pour lui à l'écran : non reporté (un test rouge n'entre pas dans la suite), le test d'écran reste entier |
| bench/tests/pages-verify.test.mjs > P-4 · home shows &quot;Loading…&quot; in a status row and keeps the greeting while the index is pending, then the content | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-4 · home leaves the loading state when the index request fails, and still draws a Settings tile | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-4 · Ctrl+K puts the cursor in the composer; the ask bar says Ctrl K off Apple platforms | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-4 · the ask bar labels its shortcut ⌘K on a Mac and Meta+K focuses the composer | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-4 · the brief is headed &quot;Highlights&quot;, shows at most four entries, and its refresh sends &quot;Refresh my highlights&quot; | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-4 · Domains leaves the home/ folder out and always ends with the Settings tile | scindé | packages/web/test/home.test.tsx > always closes the mosaic with the shell’s own tile | gardé | les tuiles vues restent à l'écran |
| bench/tests/pages-verify.test.mjs > P-4 · Arrange then Done keep the tiles and leave arranging mode | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-4 · a section of five pages has no search field, a sixth page makes it appear, and a miss shows an empty state | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-5 · a page answered 404 shows the missing-page state, names its path, uses file-question and links to the folder above | scindé | packages/server/test/pages.test.ts > 404s a page that does not exist | gardé | le chemin nommé, l'icône et le lien restent à l'écran |
| bench/tests/pages-verify.test.mjs > P-5 · a page answered 403 shows the missing-page state, names its path, uses lock and links to the folder above | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-5 · a page answered 401 shows the missing-page state, names its path, uses lock and links to the folder above | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-5 · a page answered 500 shows the missing-page state, names its path, uses circle-alert and links to the folder above | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-11 · an app without a view says it is not active, offers Home, and Home leads to the landing canvas | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-11 · a route no plugin owns falls through to the landing canvas | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-6 · typing saves after a pause, the status goes Saving… then Saved, and the file holds the text | scindé | packages/server/test/pages-hors-ecran.test.ts > leaves on disk the text it sent, and lets the next save follow on the revision it got back | gardé | le statut « Saving… » puis « Saved » reste à l'écran |
| bench/tests/pages-verify.test.mjs > P-6 · when the agent wrote the file meanwhile, the editor stays open, says &quot;The agent changed this page. Reload to see its version.&quot; and the user's text is not saved | scindé | packages/server/test/pages-hors-ecran.test.ts > refuses when the agent wrote meanwhile, and keeps the agent’s file whole | gardé | le message reste à l'écran |
| bench/tests/pages-verify.test.mjs > P-6 · Escape and an outside click close page properties and block settings, and focus returns to the settings control | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-6 · Done returns to the reading mode of the same page | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-4 · home shows &quot;Chargement…&quot; in a status row and keeps the greeting while the index is pending, then the content | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-4 · the brief is headed &quot;À la une&quot;, shows at most four entries, and its refresh sends &quot;Rafraîchis ma une&quot; | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-6 · when the agent wrote the file meanwhile, the editor stays open, says &quot;(fr)&quot; and the user's text is not saved | scindé | packages/server/test/pages-hors-ecran.test.ts > refuses when the agent wrote meanwhile, and keeps the agent’s file whole | gardé | le message reste à l'écran |
| bench/tests/pages-verify.test.mjs > B-8 · home: the chrome speaks en only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-7 · home: no browser-grey control and no typographic glyph standing for an icon | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-8 · section: the chrome speaks en only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-7 · section: no browser-grey control and no typographic glyph standing for an icon | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-8 · reader: the chrome speaks en only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-7 · reader: no browser-grey control and no typographic glyph standing for an icon | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-8 · collection: the chrome speaks en only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-7 · collection: no browser-grey control and no typographic glyph standing for an icon | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-8 · missing: the chrome speaks en only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-7 · missing: no browser-grey control and no typographic glyph standing for an icon | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-8 · inactive: the chrome speaks en only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-7 · inactive: no browser-grey control and no typographic glyph standing for an icon | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-8 · editor: the chrome speaks en only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-7 · editor: no browser-grey control and no typographic glyph standing for an icon | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-7 · keyboard focus is visible on every control Tab reaches in the home, a section and the reader | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-8 · home: the chrome speaks fr only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-8 · section: the chrome speaks fr only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-8 · reader: the chrome speaks fr only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-8 · collection: the chrome speaks fr only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-8 · missing: the chrome speaks fr only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-8 · inactive: the chrome speaks fr only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-8 · editor: the chrome speaks fr only | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-10 · home does not scroll sideways at 360 px | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-10 · section does not scroll sideways at 360 px | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-10 · reader does not scroll sideways at 360 px | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > B-10 · missing does not scroll sideways at 360 px | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-4 · on a phone the canvas header says Chat, named &quot;Back to the chat&quot;, and returns to the conversation | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > P-6 · at 360 px the page-properties popover stays inside the viewport with an 8 px margin | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > the shell's back above the todo plugin says Home, has a chevron, and leads home | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > the shell's back above the todo plugin says Accueil, has a chevron, and leads home | affichage |  |  |  |
| bench/tests/pages-verify.test.mjs > reader.css: no colour outside a var() fallback, no literal font size, no literal radius, no bare outline: none | effet | packages/web/test/besoin-pages-code.test.ts > write no colour outside a var() fallback in the five pages sheets | gardé | les trois autres règles de la ligne ont chacune leur test dans le même fichier |
| bench/tests/pages-verify.test.mjs > editor.css: no colour outside a var() fallback, no literal font size, no literal radius, no bare outline: none | effet | packages/web/test/besoin-pages-code.test.ts > write no colour outside a var() fallback in the five pages sheets | gardé | les trois autres règles de la ligne ont chacune leur test dans le même fichier |
| bench/tests/pages-verify.test.mjs > home.css: no colour outside a var() fallback, no literal font size, no literal radius, no bare outline: none | effet | packages/web/test/besoin-pages-code.test.ts > write no colour outside a var() fallback in the five pages sheets | gardé | les trois autres règles de la ligne ont chacune leur test dans le même fichier |
| bench/tests/pages-verify.test.mjs > mobile.css: no colour outside a var() fallback, no literal font size, no literal radius, no bare outline: none | effet | packages/web/test/besoin-pages-code.test.ts > write no colour outside a var() fallback in the five pages sheets | gardé | les trois autres règles de la ligne ont chacune leur test dans le même fichier |
| bench/tests/pages-verify.test.mjs > missing-page.css: no colour outside a var() fallback, no literal font size, no literal radius, no bare outline: none | effet | packages/web/test/besoin-pages-code.test.ts > write no colour outside a var() fallback in the five pages sheets | gardé | les trois autres règles de la ligne ont chacune leur test dans le même fichier |
| bench/tests/pages-verify.test.mjs > prettify and folderOf are defined once in packages/web/src | effet | packages/web/test/besoin-pages-code.test.ts > defines prettify and folderOf once in packages/web/src | gardé |  |
| bench/tests/pages-verify.test.mjs > no fetchImpl( call in the pages files outside the shared request helper | effet | packages/web/test/besoin-pages-code.test.ts > calls fetchImpl( in no pages file outside the shared request helper | gardé |  |
| bench/tests/pages-verify.test.mjs > Reader.tsx, Editor.tsx, App.tsx and Home.tsx hold no function longer than 250 lines | scindé | packages/web/test/besoin-pages-code.test.ts > holds no function longer than 250 lines in Reader, Editor and Home | gardé | Reader, Editor et Home sont portés ; App.tsx a une fonction de 267 lignes, donc la ligne est déjà rouge pour lui à l'écran : non reporté (un test rouge n'entre pas dans la suite), le test d'écran reste entier |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · reading: when the agent rewrites the page, the new text appears with no action and the old one is gone | scindé | packages/server/test/pages-hors-ecran.test.ts > reads the last text written, with a revision that changed each time, and leaves a neighbour alone | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · reading: the agent rewrites twice in a row, the last text is the one shown | scindé | packages/server/test/pages-hors-ecran.test.ts > reads the last text written, with a revision that changed each time, and leaves a neighbour alone | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · reading: a write to another page does not change the open one | scindé | packages/server/test/pages-hors-ecran.test.ts > reads the last text written, with a revision that changed each time, and leaves a neighbour alone | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · reading a page of the second store: it is refreshed too | scindé | packages/server/test/pages-hors-ecran.test.ts > reads a page of the second store only with its store named | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · reading: the agent deletes the page, E-8 shows and names the path | scindé | packages/server/test/pages-hors-ecran.test.ts > answers 404 for a page deleted and for a page moved away, and finds it at its new path | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · reading: the agent moves the page away, E-8 shows | scindé | packages/server/test/pages-hors-ecran.test.ts > answers 404 for a page deleted and for a page moved away, and finds it at its new path | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · editing: the agent writes, the banner rises, the typed text stays, no refresh replaces it | scindé | packages/web/test/editor-banner.test.tsx > a different revision raises it and leaves the typed text alone | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · editing: the banner has role status, comes before the editor text and sits below the title | affichage |  |  |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · editing: Reload shows the agent’s version, the banner goes, the typed text is replaced | scindé | packages/web/test/editor-banner.test.tsx > Reload calls onReload once; once the page is reloaded the banner is gone and the editor holds the new text | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · editing: the user’s own save raises no banner | scindé | packages/web/test/editor-banner.test.tsx > the editor’s own revision raises nothing | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · editing: with the banner up, a save the server refuses leaves the typed text, the editor and the banner | scindé | packages/web/test/editor.test.tsx > stays open when the server refuses, rather than closing over the refusal | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · editing: the agent writes three times, there is still one banner | affichage |  |  |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · editing: Done with the banner up and nothing typed closes the editor and shows the agent’s version | scindé | packages/web/test/page-follows-feed.test.tsx > closing the editor applies the pending incoming; gone gives E-8 | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · editing: the agent deletes the page, the banner rises and the text stays; Reload leads to E-8 | scindé | packages/web/test/page-follows-feed.test.tsx > 404 gives gone; reload() shows E-8 | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · editing: the banner says exactly « The page changed. » with « Reload » | affichage |  |  |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · phone: the banner keeps the page column width and Reload stays reachable under the sentence | affichage |  |  |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · editing: the banner says « La page a changé. » with « Recharger », no English left | affichage |  |  |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · watch off, reading: the agent rewrites, nothing moves | scindé | packages/server/test/watch.test.ts > is a fact, not an error, when the operator disabled the feed | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · watch off, reading: the agent deletes the page, nothing moves | scindé | packages/server/test/watch.test.ts > is a fact, not an error, when the operator disabled the feed | gardé |  |
| bench/tests/page-suivie-besoin.test.mjs > B-17 · watch off, editing: the agent writes, no banner | scindé | packages/server/test/watch.test.ts > is a fact, not an error, when the operator disabled the feed | gardé |  |
| bench/tests/page-suivie-complement-besoin.test.mjs > B-17 · editing a page of the second store: the agent writes, the banner rises, the typed text stays | scindé | packages/server/test/pages-hors-ecran.test.ts > reads a page of the second store only with its store named | gardé |  |
| bench/tests/page-suivie-complement-besoin.test.mjs > B-17 · editing: the agent moves the page, the banner rises first and the text stays; Reload leads to E-8 | scindé | packages/server/test/pages-hors-ecran.test.ts > answers 404 for a page deleted and for a page moved away, and finds it at its new path | gardé |  |
| bench/tests/page-suivie-complement-besoin.test.mjs > B-17 · editing: Done with the banner up and a refused save keeps the editor open, the typed text and the banner | scindé | packages/web/test/editor.test.tsx > stays open when the server refuses, rather than closing over the refusal | gardé |  |
| bench/tests/page-suivie-suites-besoin.test.mjs > B-17 · editing: after the user’s own save, the agent writes and the banner rises, the typed text stays | scindé | packages/web/test/editor-banner.test.tsx > a later agent write after a save raises the banner again | gardé |  |
| bench/tests/page-suivie-suites-besoin.test.mjs > B-17 · editing: after Reload, a second write by the agent raises the banner again | scindé | packages/web/test/editor-banner.test.tsx > a later agent write after a save raises the banner again | gardé |  |
