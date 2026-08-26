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
  Apps: 'Apps',
  Sections: 'Domaines',
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
  'Cards open a page.': 'Chaque carte ouvre une fiche.',
  Finished: 'Terminé',
  'This section holds nothing yet.': 'Ce domaine ne contient rien pour l’instant.',
  'Search…': 'Rechercher…',
  'Search this section': 'Rechercher dans ce domaine',
  All: 'Tout',
  'Nothing matches.': 'Aucun résultat.',

  // Chrome
  Home: 'Accueil',
  Settings: 'Réglages',
  Theme: 'Thème',
  Conversations: 'Conversations',
  'Permission required': 'Autorisation demandée',
  Refuse: 'Refuser',
  'Just this once': 'Cette fois',
  'For this conversation': 'Pour cette conversation',
  'New conversation': 'Nouvelle conversation',
  'Open apps': 'Ouvrir les apps',
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

  // The settings screen
  'What this instance answers with, reaches, looks like and was told':
    'Ce avec quoi cette instance répond, ce qu’elle atteint, son aspect, ce qu’on lui a dit',
  Appearance: 'Apparence',
  'Light or dark, or whatever this device is set to':
    'Clair, sombre, ou ce que demande cet appareil',
  'Follows this device': 'Suit cet appareil',
  System: 'Système',
  Light: 'Clair',
  Dark: 'Sombre',
  'Kept in this browser, like the model choice and the rail width.':
    'Conservé dans ce navigateur, comme le choix du modèle et la largeur du rail.',

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
  'Golem could not start': 'Golem n’a pas pu démarrer',
  'That app is not active on this instance.': 'Cette app n’est pas activée sur cette instance.',
  'Turn interrupted.': 'Tour interrompu.',
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
