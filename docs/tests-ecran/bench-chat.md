# Inventaire — bench-chat

Statut : complet

Les fichiers de cette grappe sont des `node --test` que la suite attestée ne joue pas (elle ne joue que `doc-besoin` et `bench-once`) : les tests hors écran sont des `.test.ts` vitest, joués par elle. Le test hors écran nouveau est `packages/server/test/chat-hors-ecran.test.ts` (la route : plafond de tours, message retenu, arrêt, archivage ; l'outil de longueur des fonctions). Les autres sont des tests déjà présents.

`À l'écran` dit `gardé` partout : le codeur ne modifie ni ne retire un test existant. L'allègement ou le retrait des lignes `effet` et `scindé` revient au testeur, une fois le test hors écran rejoué.

| Test | Classe | Hors écran | À l'écran | Raison |
|---|---|---|---|---|
| bench/tests/chat-besoin.test.mjs > a finished turn, a tool trace, an error and a question all show in full | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > the tool trace opens on its toggle and names the two tools it ran | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > E-17: the question offers the three answers as drawn buttons, only « always » in accent, with the alert icon | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > E-17: while the question waits, a typed message cannot be sent | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > no Unicode glyph or emoji stands for an icon in the rail, the question, the cards or the sheet | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > every icon-only control of the rail has an accessible name and a tooltip | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > the rail speaks one language: no word of the other one in text, labels, tooltips or alt | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > the new-conversation control and the three answers speak the instance language | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > every close control of the rail and of the sheet is the same x icon | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > the tab archive control carries the archive icon, the tab close control the x | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > at 360 px the rail stays inside the screen with every control at least 24 px, in both themes | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > the header carries the skin's own name | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > the question, the trace and the bubbles are legible in both themes (4.5:1) | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > P-3: a thread of signatures shows pending, signed, denied, expired and standing cards with icon and words | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > P-3: the pending card says « until » in the instance language and a grant says it is a standing authorisation | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > the signature cards speak one language in both themes and both sizes | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > the signature cards and the Sign button are legible in both themes (4.5:1) | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > E-18: Sign opens the sheet (origin with lock, Open in a tab, one close x), Escape closes it and returns the focus to Sign | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > E-18: the close control closes the sheet; on a phone it is a bottom sheet | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > E-17: answering « Refuse » closes the question and frees the composer | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > an archived conversation leaves the list | scindé | packages/server/test/chat-hors-ecran.test.ts > takes the conversation out of the list and keeps it readable | gardé |  |
| bench/tests/chat-besoin.test.mjs > E-16: with no conversation the list says so, in the instance language, through the shared empty state | affichage |  |  |  |
| bench/tests/chat-besoin.test.mjs > E-13: an opened delegation shows its words and its tool trace, and no signature card | scindé | packages/web/test/besoin-chat-statique.test.ts > keeps the signature cards for the chat by default and drops them for a delegated conversation | gardé |  |
| bench/tests/chat-besoin.test.mjs > no token is used in chat.css, conversations.css or attachments.css without being defined | effet | packages/web/test/besoin-chat-statique.test.ts > use no token that nothing defines (--text-xs and --radius-md were two) | gardé |  |
| bench/tests/chat-besoin.test.mjs > no colour is written outside a var() fallback in the three sheets | effet | packages/web/test/besoin-chat-statique.test.ts > write no colour outside a var() fallback | gardé |  |
| bench/tests/chat-besoin.test.mjs > no font size or radius is written as a literal in the three sheets | effet | packages/web/test/besoin-chat-statique.test.ts > write no literal font size | gardé | le même fichier porte aussi « write no literal radius » |
| bench/tests/chat-besoin.test.mjs > no chat source calls fetchImpl( directly | effet | packages/web/test/besoin-chat-statique.test.ts > calls fetchImpl( nowhere under packages/web/src/chat | gardé |  |
| bench/tests/chat-besoin.test.mjs > toMessage is defined once in packages/web/src | effet | packages/web/test/besoin-chat-statique.test.ts > defines toMessage once in packages/web/src | gardé |  |
| bench/tests/chat-besoin.test.mjs > Chat, useConversations and Composer hold no function longer than 250 lines | effet | packages/server/test/chat-hors-ecran.test.ts > finds no function over 250 lines in Chat, useConversations and Composer | gardé |  |
| bench/tests/chat-besoin.test.mjs > a real Claude turn | sans-porte |  |  | Joue le vrai moteur Claude et son jeton, absent de la suite : le test est sauté sans secret, et le moteur réel n'a aucune porte déterministe. |
| bench/tests/chat-chargements-besoin.test.mjs > B-18 nominal: while the list has not answered it shows Loading, never the empty sentence, and the rows come after | affichage |  |  |  |
| bench/tests/chat-chargements-besoin.test.mjs > B-18 failure: a 500 on the list says the server's error with Retry; Retry shows Loading alone, then the rows | affichage |  |  |  |
| bench/tests/chat-chargements-besoin.test.mjs > B-18 failure bords: without a server message the locale sentence with the status; a Retry that fails again brings the failure back; one press, one fetch | affichage |  |  |  |
| bench/tests/chat-chargements-besoin.test.mjs > B-18 bords: a list that answered empty shows the empty sentence and neither Loading nor Retry | affichage |  |  |  |
| bench/tests/chat-chargements-besoin.test.mjs > B-18 exclusion: a 403 on the list draws no Failure and no Retry in the chat | affichage |  |  |  |
| bench/tests/chat-chargements-besoin.test.mjs > B-18 nominal thread: opening a stored conversation shows Loading in the thread, not the welcome nor bubbles, then the messages | affichage |  |  |  |
| bench/tests/chat-chargements-besoin.test.mjs > B-18 thread failure: a 500 on the thread says it with Retry and leaves the composer unable to send; Retry reads again and frees it | affichage |  |  |  |
| bench/tests/chat-chargements-besoin.test.mjs > B-18 thread failure bords: the locale sentence without a server message; a 403 draws no Retry | affichage |  |  |  |
| bench/tests/chat-chargements-besoin.test.mjs > B-22 nominal: each message carrying the mark gets one note line directly above it, with the locale text, and nothing else does | affichage |  |  |  |
| bench/tests/chat-chargements-besoin.test.mjs > B-22 bords: a reload draws the same lines; a conversation with no mark draws none | scindé | packages/server/test/context-lost-mark.test.ts > keeps the mark on a reread of the conversation | gardé |  |
| bench/tests/chat-chargements-besoin.test.mjs > B-22 exclusion: a plain turn in an unmarked conversation draws no line, live or after the thread is read again | scindé | packages/server/test/context-lost-mark.test.ts > marks only the first agent message of the turn, not the first turn nor a same-session turn | gardé |  |
| bench/tests/chat-chargements-besoin.test.mjs > B-22 extreme content: on a phone the line wraps and its text is never cut, the page does not scroll sideways | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > desk light: the limit is said in en under the refused message, readable | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > desk dark: the limit is said in en under the refused message, readable | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > phone light: the limit is said in en under the refused message, readable | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > phone dark: the limit is said in en under the refused message, readable | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > desk light: the limit is said in fr under the refused message, readable | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > desk dark: the limit is said in fr under the refused message, readable | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > phone light: the limit is said in fr under the refused message, readable | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > phone dark: the limit is said in fr under the refused message, readable | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > it survives the reread, and a second send at once is refused the same way, one line, both messages kept | scindé | packages/server/test/chat-hors-ecran.test.ts > answers 429 naming the limit, files nothing, and accepts the next send once a seat is free | gardé |  |
| bench/tests/chat-correctifs-besoin.test.mjs > it goes when another conversation opens, and at the next send that is accepted | scindé | packages/server/test/chat-hors-ecran.test.ts > answers 429 naming the limit, files nothing, and accepts the next send once a seat is free | gardé |  |
| bench/tests/chat-correctifs-besoin.test.mjs > another HTTP refusal keeps the server's own text, and says nothing about the turn limit | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > no answer from the server leaves an error line under the sent message and keeps the message | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > with maxConcurrentTurns 2 the line says 2 | scindé | packages/server/test/chat-hors-ecran.test.ts > names the server’s limit, not a constant: with 2 the answer says 2 | gardé |  |
| bench/tests/chat-correctifs-besoin.test.mjs > while its turn runs, the sent bubble names the file with a paperclip icon and carries no 📎 character | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > a 500 with a JSON body and no message: the tray says it in en, with no English or browser wording left | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > a 500 with an empty body: the tray says it in en, with no English or browser wording left | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > a 500 with a JSON body and no message: the tray says it in fr, with no English or browser wording left | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > a 500 with an empty body: the tray says it in fr, with no English or browser wording left | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > the transcript opens, its text is there, and no signature card nor Sign button is drawn | scindé | packages/web/test/besoin-chat-statique.test.ts > keeps the signature cards for the chat by default and drops them for a delegated conversation | gardé |  |
| bench/tests/chat-correctifs-besoin.test.mjs > control: the chat of the instance's own user still draws its signature cards | affichage |  |  |  |
| bench/tests/chat-correctifs-besoin.test.mjs > the home's ask bar puts the cursor in the chat field and keeps the draft | sans-porte |  |  | Le focus du champ du composeur est un état du DOM d'un vrai navigateur : aucune route ni API ne le porte. |
| bench/tests/chat-correctifs-besoin.test.mjs > adestia-composer--busy is either absent from the sources or has a style rule | effet | packages/web/test/chat-repaired-defects.test.ts > keeps the obsolete busy and close classes out of source and styles | gardé |  |
| bench/tests/chat-correctifs-besoin.test.mjs > adestia-sheet__close is either absent from the sources or has a style rule | effet | packages/web/test/chat-repaired-defects.test.ts > keeps the obsolete busy and close classes out of source and styles | gardé |  |
| bench/tests/chat-correctifs-besoin.test.mjs > adestia-sheet__origin is either absent from the sources or has a style rule | effet | packages/web/test/chat-repaired-defects.test.ts > defines the origin base rule once and uses it in the signature sheet | gardé |  |
| bench/tests/chat-correctifs-besoin.test.mjs > the unreleased section names the race of the chat, the refused turn and the sent attachment | sans-porte |  |  | Ne pilote aucun navigateur et lit le CHANGELOG : une copie vitest rougirait à la première version suivante sans qu'aucun défaut ne soit revenu (la section lue est la plus haute) ; il reste tel quel. |
| bench/tests/chat-correctifs-course.test.mjs > with the first POST still pending, the second message shows held and is not posted as a turn | sans-porte |  |  | Le garde porte sur une requête POST encore en vol dans le navigateur (le client retient le message tant que le tour n'est pas lancé) : l'attente est dans le client, le serveur ne la voit pas. |
| bench/tests/chat-p2-besoin.test.mjs > the measuring tool refuses a 300-line function (control) | effet | packages/server/test/chat-hors-ecran.test.ts > refuses a 300-line function (control: the tool can say no) | gardé |  |
| bench/tests/chat-p2-besoin.test.mjs > Chat, useConversations and Composer hold no function over 250 lines | effet | packages/server/test/chat-hors-ecran.test.ts > finds no function over 250 lines in Chat, useConversations and Composer | gardé |  |
| bench/tests/chat-p2-besoin.test.mjs > the first message of a draft creates the conversation, then posts the turn | sans-porte |  |  | L'ordre des deux requêtes (création puis tour) est celui que le client émet ; le serveur ne le voit qu'à travers son trafic de navigateur. |
| bench/tests/chat-p2-besoin.test.mjs > while a turn runs Stop replaces Send, a second message is held, and after Stop it is sent | scindé | packages/server/test/chat-hors-ecran.test.ts > is held (202), filed in the thread at once, and run after a stop | gardé |  |
| bench/tests/chat-p2-besoin.test.mjs > the model picked in the header is kept in this browser as adestia.model | sans-porte |  |  | Le choix du modèle est gardé dans le localStorage du navigateur sous adestia.model : aucune porte hors du navigateur. |
| bench/tests/chat-p2-besoin.test.mjs > the context pill shows 150k after a turn that weighs 150k tokens | affichage |  |  |  |
| bench/tests/chat-p2-besoin.test.mjs > a reply that ends while another draft is open leaves an Unread dot on its tab | sans-porte |  |  | Le point « non lu » naît dans l'état de l'onglet du client quand une réponse s'achève ailleurs : aucune route ne le porte. |
| bench/tests/chat-p2-gestes-besoin.test.mjs > step 7: a picked file shows in the tray by name and its remove control takes it away | affichage |  |  |  |
| bench/tests/chat-p2-gestes-besoin.test.mjs > step 7: two files make two chips, and sending empties the tray | affichage |  |  |  |
| bench/tests/chat-p2-gestes-besoin.test.mjs > step 7: a refused upload says so in the tray and attaches nothing | affichage |  |  |  |
| bench/tests/chat-p2-gestes-besoin.test.mjs > step 9: closing a tab keeps the conversation in the list, and plus opens a new draft | sans-porte |  |  | L'onglet et sa mémoire (localStorage adestia.tabs) sont de l'état de navigateur ; la fermeture d'un onglet n'appelle aucune route. |
| bench/tests/chat-p2-gestes-besoin.test.mjs > step 9: dragging a tab before another reorders them and the order is remembered | sans-porte |  |  | Le glisser d'un onglet et l'ordre retenu dans le localStorage sont de l'état de navigateur : aucune porte hors du navigateur. |
| bench/tests/chat-p2-gestes-besoin.test.mjs > the refused turn answers 429, says why under its message, and the composer is free again | scindé | packages/server/test/chat-hors-ecran.test.ts > answers 429 naming the limit, files nothing, and accepts the next send once a seat is free | gardé |  |
| bench/tests/chat-p2-gestes-besoin.test.mjs > there is no tab strip, and the list icon opens the conversations and a pick opens one | affichage |  |  |  |
| bench/tests/chat-session-perdue-besoin.test.mjs > B-22 real Claude, sessions gone: the next turn succeeds on the same conversation and the line sits above its reply | scindé | packages/server/test/context-lost-mark.test.ts > reruns once with no session, same conversation, and marks the reply | gardé |  |
| bench/tests/chat-session-perdue-besoin.test.mjs > B-22 real Claude, sessions kept: a plain restart draws no line | scindé | packages/server/test/context-lost-mark.test.ts > marks only the first agent message of the turn, not the first turn nor a same-session turn | gardé |  |
| bench/tests/diagnostics-phone-besoin.test.mjs > E-4 · a diagnostic reads « line N » on one row, with its message beside it | affichage |  |  |  |
| bench/tests/diagnostics-phone-besoin.test.mjs > E-4 · bord: a three-digit line number stays on one row too | affichage |  |  |  |
