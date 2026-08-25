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
  Close: 'Fermer',
  Conversations: 'Conversations',
  'New conversation': 'Nouvelle conversation',
  'Open apps': 'Ouvrir les apps',
  'Back to the chat': 'Revenir au chat',
  'Sign in': 'Se connecter',
  'Sign out': 'Se déconnecter',
  'No conversation yet.': 'Aucune conversation.',
  'Extensions refused': 'Extensions refusées',
  Save: 'Enregistrer',
  Edit: 'Modifier',
  Done: 'Terminé',
  'Saving…': 'Enregistrement…',
  Saved: 'Enregistré',
  'Loading…': 'Chargement…',

  // Failures, where clarity matters most
  'Not allowed': 'Accès refusé',
  'This instance requires you to sign in.': 'Cette instance demande une connexion.',
  'Golem could not start': 'Golem n’a pas pu démarrer',
  'That app is not active on this instance.': 'Cette app n’est pas activée sur cette instance.',
  'Turn interrupted.': 'Tour interrompu.',
  'Agent credential': 'Jeton de l’agent',
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
