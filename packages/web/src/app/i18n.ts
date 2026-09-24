/**
 * The shell's words, in the reader's language.
 *
 * Keyed by the ENGLISH STRING rather than by an identifier, deliberately.
 * `t('Nothing matches.')` reads as what it renders, so the code stays
 * legible and a reviewer sees the actual sentence; and a key with no
 * translation degrades to the key itself, which is a correct English
 * interface rather than a screen of `home.empty.title`.
 *
 * The cost of that choice is real and worth stating: rewording a sentence
 * orphans its translations. At this surface — a few dozen strings — that is
 * a smaller tax than making every label unreadable at its call site.
 *
 * WHO OWNS WHAT: the shell translates the shell. A plugin ships its own
 * words the same way it ships its own skills, and is handed the active
 * locale to do it. A SKIN never translates — a livery is a look, not a
 * language, and letting it carry words would mean the interface changed
 * language when you changed its colours.
 */

export type Locale = 'en' | 'fr'

/**
 * Only what differs from the key. A sentence absent here is served in
 * English, which is the honest failure: visibly untranslated beats
 * mistranslated, and beats a raw identifier by a mile.
 */
const FR: Readonly<Record<string, string>> = {
  // The landing canvas
  // One mosaic now: a plugin's tile and a folder's are both doors on a domain.
  Domains: 'Domaines',
  Pages: 'Fiches',
  'Nothing to show yet.': 'Rien à afficher pour l’instant.',
  Arrange: 'Ranger',
  'Move earlier': 'Déplacer avant',
  'Move later': 'Déplacer après',
  'Turn a plugin on in': 'Activez un plugin dans',
  'or write a page — a folder holding one becomes a section on its own.':
    'ou écrivez une fiche — un dossier qui en contient devient un domaine tout seul.',
  'Good morning.': 'Bonjour.',
  'Good evening.': 'Bonsoir.',
  'Ask…': 'Demander…',
  'chosen by': 'choisi par',
  'the agent': 'l’agent',
  'Ask for a fresh brief': 'Demander une nouvelle une',
  'just now': 'à l’instant',
  '%n h ago': 'il y a %n h',
  '%n d ago': 'il y a %n j',
  page: 'fiche',
  pages: 'fiches',

  // Section screens
  Inside: 'À l’intérieur',
  'Rooms lead to pages.': 'Les sous-domaines mènent aux fiches.',
  'Split across several stores': 'Réparti entre plusieurs magasins',
  'Cards open a page.': 'Chaque carte ouvre une fiche.',
  Finished: 'Terminé',
  'This section holds nothing yet.': 'Ce domaine ne contient rien pour l’instant.',
  'Search…': 'Rechercher…',
  'Search this section': 'Rechercher dans ce domaine',
  All: 'Tout',
  'Nothing matches.': 'Aucun résultat.',

  // A collection page, drawn by the core
  'nothing live': 'rien en cours',
  Uncategorised: 'Sans catégorie',
  '1 archived': '1 archivée',
  '%n archived': '%n archivées',
  'Everything here is finished.': 'Tout est terminé ici.',
  'This collection declares no `of:` and collects nothing.':
    'Cette collection ne déclare pas de `of:` et ne rassemble rien.',
  'Ask for a new page': 'Demander une nouvelle fiche',
  'Create a new page of type “%type” in %into, for this collection.':
    'Crée une nouvelle fiche de type « %type » dans %into, pour cette collection.',

  // Chrome
  Home: 'Accueil',
  Settings: 'Réglages',
  Theme: 'Thème',
  Conversations: 'Conversations',
  'Permission required': 'Autorisation demandée',
  Refuse: 'Refuser',
  'Just this once': 'Cette fois',
  Always: 'Toujours',
  'No lasting rule for this one — the engine proposed none.':
    "Pas d'autorisation durable ici — le moteur n'a proposé aucune règle.",
  'New conversation': 'Nouvelle conversation',
  'Open apps': 'Ouvrir les apps',
  'There is no page at this address.': 'Il n’y a aucune page à cette adresse.',
  'This page is out of reach — the session may have expired.':
    'Cette page est hors de portée — la session a peut-être expiré.',
  'The server could not serve this page.': 'Le serveur n’a pas pu servir cette page.',
  'Open the folder above': 'Ouvrir le dossier au-dessus',
  'Back to the chat': 'Revenir au chat',
  'Sign in': 'Se connecter',
  'Sign out': 'Se déconnecter',
  'No conversation yet.': 'Aucune conversation.',
  Archive: 'Archiver',
  'Extensions refused': 'Extensions refusées',
  'Running with something missing': 'Actives, sans tout ce qu’elles savent faire',
  Save: 'Enregistrer',

  'runs without the secret %name, which this instance does not provide':
    'tourne sans le secret %name, que cette instance ne fournit pas',
  'could not be fetched at %ref, and nothing is cached — what it brings is absent':
    'n’a pas pu être récupéré sur %ref, et rien n’est en cache — ce qu’il apporte est absent',
  'could not be refreshed at %ref — running on the cached copy (%head)':
    'n’a pas pu être rafraîchi sur %ref — on tourne sur la copie en cache (%head)',
  'is declared as an extension source but is not a directory on this instance':
    'est déclaré comme source d’extensions mais n’est pas un dossier sur cette instance',

  // The instruction zone
  Instructions: 'Instructions',
  'Read and correct what you told the agent': 'Relire et corriger ce que vous avez dit à l’agent',
  'What you have told the agent, in your words. Saved exactly as typed.':
    'Ce que vous avez dit à l’agent, dans vos mots. Enregistré tel que tapé.',
  'Nothing here yet — write one, or ask the agent to.':
    'Rien ici pour l’instant — écrivez-en une, ou demandez à l’agent de le faire.',
  'New instruction': 'Nouvelle instruction',
  'What is this instruction about?': 'De quoi parle cette instruction ?',
  'This engine keeps its instructions elsewhere.':
    'Ce moteur garde ses instructions ailleurs.',
  'Search instructions': 'Rechercher une instruction',
  'Nothing matches that.': 'Aucun résultat.',
  delivered: 'fournie',
  'Delivered with the product and rewritten at every start — shown, not edited.':
    'Fournie avec le produit et réécrite à chaque démarrage — affichée, pas modifiable.',

  // The cog menu — what is settled without leaving the page
  Tokens: 'Jetons',
  Appearance: 'Apparence',
  'Follows this device': 'Suit cet appareil',
  System: 'Système',
  Light: 'Clair',
  Dark: 'Sombre',
  'Kept in this browser, like the model choice and the rail width.':
    'Conservé dans ce navigateur, comme le choix du modèle et la largeur du rail.',
  'This engine takes its credentials from the environment; there is nothing to arm here.':
    'Ce moteur prend ses identifiants dans l’environnement ; il n’y a rien à armer ici.',

  // The settings app — the half of settings that is content
  'What this instance reaches, and what it was told':
    'Ce que cette instance atteint, et ce qu’on lui a dit',
  file: 'fichier',
  files: 'fichiers',

  // Delegations, on their settings page
  Delegations: 'Délégations',
  'What other agents asked this one to do': 'Ce que les autres agents lui ont demandé',
  'Read-only — this conversation belongs to': 'Lecture seule — cette conversation appartient à',
  'No delegated task yet — the conversations other agents open here will appear by caller.':
    'Aucune tâche déléguée pour l’instant — les fils ouverts par les autres agents apparaîtront ici, par demandeur.',
  conversation: 'fil',
  conversations: 'fils',
  '%n running': '%n en cours',

  // Signing in to an MCP server (the chat card, and the server page's row)
  'asks you to connect before it can act for you.':
    'demande une connexion avant de pouvoir agir pour vous.',
  Connect: 'Se connecter',
  Reconnect: 'Se reconnecter',
  'Not now': 'Pas maintenant',
  'Connected for you — your turns reach it as you.':
    'Connecté pour vous — vos tours l’atteignent en votre nom.',
  'Not connected for you yet — this server signs each person in.':
    'Pas encore connecté pour vous — ce serveur connecte chaque personne séparément.',

  // The configuration screen: the instance's own settings, as a form.
  Configuration: 'Configuration',
  'Read and change this instance\u2019s own settings':
    'Lire et changer les r\u00e9glages de cette instance',
  'Written straight into': '\u00c9crit directement dans',
  default: 'par d\u00e9faut',
  'not saved yet': 'pas encore enregistr\u00e9',
  'applies after a restart': 'effectif apr\u00e8s red\u00e9marrage',
  'Read-only.': 'Lecture seule.',
  'this instance cannot write its configuration file':
    'cette instance ne peut pas \u00e9crire son fichier de configuration',
  'The values below are what it is running; changing them means changing the mount.':
    'Les valeurs ci-dessous sont celles qu\u2019elle applique ; les changer passe par le montage.',
  Discard: 'Annuler',
  // `Save` and `Saving…` are already in the editor block below, and mean the
  // same thing. Said twice, the second spelling silently won — and the two
  // were not even spelled alike, one escaping its ellipsis.
  'Written to the file': '\u00c9crit dans le fichier',
  'The settings could not be read.': 'Les r\u00e9glages n\u2019ont pas pu \u00eatre lus.',
  'The settings could not be saved.': 'Les r\u00e9glages n\u2019ont pas pu \u00eatre enregistr\u00e9s.',
  'This instance does not expose its configuration.':
    'Cette instance n\u2019expose pas sa configuration.',
  'The file changed on disk since this screen read it. Reload to see it.':
    'Le fichier a chang\u00e9 sur le disque depuis que cet \u00e9cran l\u2019a lu. Rechargez pour le voir.',
  // The restart bar, which only appears once something waits on one.
  'Saved, and waiting for a restart.': 'Enregistré, en attente d’un redémarrage.',
  'The instance is still running the values it booted with.':
    'L’instance applique encore les valeurs de son démarrage.',
  'Restart now': 'Redémarrer',
  'Restart anyway': 'Redémarrer quand même',
  'Coming back…': 'Retour en cours…',
  '%n turn(s) running — restarting now would lose that work.':
    '%n tour(s) en cours — redémarrer maintenant perdrait ce travail.',
  'The instance could not be restarted.': 'L’instance n’a pas pu être redémarrée.',
  'The instance did not come back. Check the logs where it runs.':
    'L’instance n’est pas revenue. Regardez les journaux là où elle tourne.',
  // Its catalogue: the group, then one line per setting.
  'Live refresh': 'Rafra\u00eechissement vivant',
  'The agent writes pages with its own file tools, so the server only learns of them by watching the disk. Native file events cannot cross some mounts \u2014 WSL\u2019s /mnt/c, NFS, SMB, some Docker bind mounts \u2014 and scanning is the way through.':
    'L\u2019agent \u00e9crit les fiches avec ses propres outils de fichiers : le serveur ne l\u2019apprend qu\u2019en surveillant le disque. Les \u00e9v\u00e9nements natifs ne traversent pas certains montages \u2014 le /mnt/c de WSL, NFS, SMB, certains bind mounts Docker \u2014 et le scan est le passage.',
  'Announce changes to open shells': 'Annoncer les changements aux \u00e9crans ouverts',
  'Off, a page the agent just wrote appears only after a reload.':
    'D\u00e9sactiv\u00e9, une fiche que l\u2019agent vient d\u2019\u00e9crire n\u2019appara\u00eet qu\u2019apr\u00e8s un rechargement.',
  'Scan instead of listening': 'Scanner au lieu d\u2019\u00e9couter',
  'Turn on when the pages tree sits on a mount native file events cannot cross. It costs a periodic scan of the tree.':
    '\u00c0 activer quand l\u2019arbre des fiches vit sur un montage que les \u00e9v\u00e9nements natifs ne traversent pas. Co\u00fbte un scan p\u00e9riodique de l\u2019arbre.',
  'Scan period': 'P\u00e9riode du scan',
  'How long between two scans. Ignored unless scanning is on.':
    'D\u00e9lai entre deux scans. Sans effet si le scan est d\u00e9sactiv\u00e9.',

  // MCP servers, on their settings page
  'MCP servers': 'Serveurs MCP',
  'What this instance reaches, and what it is doing about it':
    'Ce que cette instance atteint, et où chacun en est',
  server: 'serveur',
  servers: 'serveurs',
  '%n need attention': '%n à regarder',
  'Arm or renew the token this instance answers with':
    'Armer ou renouveler le jeton avec lequel cette instance répond',
  connected: 'connecté',
  failed: 'en échec',
  'needs a sign-in': 'connexion requise',
  starting: 'démarrage',
  disabled: 'désactivé',
  'not observed yet': 'pas encore observé',
  'Reported when a turn last ran — the CLI loads them with the session.':
    'Relevé au dernier tour — le CLI les charge avec la session.',
  'Add a server': 'Ajouter un serveur',
  'A new server': 'Un nouveau serveur',
  'stdio or HTTP': 'stdio ou HTTP',
  'over HTTP': 'en HTTP',
  'a local process': 'un processus local',
  'read-only': 'lecture seule',
  'Declared in the instance configuration': 'Déclaré dans la configuration de l’instance',
  'Brought by the plugin': 'Apporté par le plugin',
  'Added from here': 'Ajouté depuis ici',
  'Written here, kept beside the instance data — not in the configuration file.':
    'Écrit ici, conservé à côté des données de l’instance — pas dans le fichier de configuration.',
  'Read-only here: this one is declared elsewhere, and an edit would be undone at the next start.':
    'Lecture seule ici : celui-ci est déclaré ailleurs, et une modification serait défaite au prochain démarrage.',
  'The configuration file now declares this name too, and it wins — this one is not wired.':
    'Le fichier de configuration déclare aussi ce nom, et c’est lui qui gagne — celui-ci n’est pas branché.',
  'None wired yet — add one, or declare it in the configuration file.':
    'Aucun branché — ajoutez-en un, ou déclarez-le dans le fichier de configuration.',
  'Server declaration': 'Déclaration du serveur',
  Remove: 'Supprimer',

  // The composer
  Model: 'Modèle',
  Auto: 'Auto',
  'Attach files': 'Joindre des fichiers',
  More: 'Plus',
  Stop: 'Arrêter',
  Send: 'Envoyer',
  'Ask the agent…': 'Demandez à l’agent…',
  Edit: 'Modifier',
  Done: 'Terminé',
  Title: 'Titre',
  Untitled: 'Sans titre',
  'Saving…': 'Enregistrement…',
  Saved: 'Enregistré',
  'Loading…': 'Chargement…',
  'Attached files': 'Pièces jointes',
  'Drop files to attach them to this page':
    'Déposez des fichiers pour les joindre à cette fiche',
  'File the attached files with the page “%title” (%path).':
    'Range les fichiers joints dans les pièces jointes de la fiche « %title » (%path).',

  // Failures, where clarity matters most
  'Not allowed': 'Accès refusé',
  'This instance requires you to sign in.': 'Cette instance demande une connexion.',
  'Adestia could not start': 'Adestia n’a pas pu démarrer',
  'That app is not active on this instance.': 'Cette app n’est pas activée sur cette instance.',
  'Turn interrupted.': 'Tour interrompu.',
  'The conversation could not be created.': 'La conversation n’a pas pu être créée.',
  'Agent credential': 'Jeton de l’agent',
  'Checking…': 'Vérification…',
  Armed: 'Armé',
  'Refused upstream': 'Refusé en amont',
  'Using the CLI’s own credentials': 'Utilise les identifiants propres du CLI',
  'No token stored here': 'Aucun jeton conservé ici',
  Unknown: 'Inconnu',
  'Arm a token': 'Armer un jeton',
  'Renew the token': 'Renouveler le jeton',
  'Forget it': 'L’oublier',
  Cancel: 'Annuler',
  'Paste the code you were given': 'Collez le code qui vous a été donné',
}

const TABLES: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: {},
  fr: FR,
}

export function translator(locale: Locale): (key: string) => string {
  const table = TABLES[locale] ?? {}
  return (key) => table[key] ?? key
}

/**
 * Which language to speak.
 *
 * The instance's configured locale wins — an operator who set one meant it.
 * Absent, the BROWSER decides, so a household in France gets French without
 * anybody configuring anything, and a visitor from elsewhere gets English on
 * the same instance. Anything unrecognised falls to English.
 */
export function resolveLocale(configured: string | undefined, navigatorLanguage?: string): Locale {
  const wanted = (configured ?? navigatorLanguage ?? 'en').slice(0, 2).toLowerCase()
  return wanted === 'fr' ? 'fr' : 'en'
}
