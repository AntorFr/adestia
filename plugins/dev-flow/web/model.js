/**
 * What the screen asks of the graph, and the words it says it in.
 *
 * The derivations themselves live server-side (`graph.mjs`): blocked,
 * actionable, who has the hand, the order. What is left here is presentation
 * — which items go in which band, and which band goes first — because that is
 * a question about a reader rather than about a dependency.
 *
 * The one opinion worth defending: an open question that freezes a chain comes
 * before everything, sorted by how much it freezes. Sorted by id, the question
 * holding up four lots sits between two that hold up none, and the screen's
 * whole reason to exist — "what should I decide first" — is buried in a list.
 */

/**
 * The plugin's own words. Keyed by the ENGLISH SENTENCE, so a missing
 * translation degrades to correct English rather than to an identifier.
 */
export const WORDS = {
  fr: {
    'to decide first': 'à trancher en premier',
    'yours to specify': 'à vous de spécifier',
    'under way': 'en chantier',
    'everything, in order': 'tout, dans l’ordre',
    finished: 'terminés',
    'freezes %n': 'gèle %n',
    'freezes nothing yet': 'ne gèle rien pour l’instant',
    'blocked by': 'bloqué par',
    'waiting on': 'en attente de',
    'ready to go': 'prêt',
    you: 'vous',
    'coding agent': 'agent coder',
    'integrating agent': 'agent intégrateur',
    nobody: 'personne',
    idea: 'idée',
    design: 'conception',
    code: 'code',
    integrate: 'intégration',
    done: 'fini',
    open: 'ouverte',
    decided: 'tranchée',
    lot: 'lot',
    question: 'question',
    'read at %s': 'lu à %s',
    refresh: 'relire',
    'no repository is configured': 'aucun dépôt configuré',
    'Name the repositories to scan in the instance configuration:':
      'Nommez les dépôts à scanner dans la configuration de l’instance :',
    'nothing to read': 'rien à lire',
    'Every scanned repository came back empty.':
      'Tous les dépôts scannés sont revenus vides.',
    'on branch %s': 'sur la branche %s',
    'read from %s': 'lu depuis %s',
    'the branch tip': 'la pointe de branche',
    'spec:': 'spec :',
    'updated %s': 'màj %s',
    history: 'historique',
    'no history for this fiche': 'pas d’historique pour cette fiche',
    'depends on': 'dépend de',
    'holds up': 'retient',
    'Draft a decision': 'Rédiger la décision',
    'Ask about this lot': 'Demander pour ce lot',
    'this fiche is unreadable': 'fiche illisible',
    'what the scan could not read': 'ce que le scan n’a pas pu lire',
    'unknown item': 'item inconnu',
    'git is not installed here, and every fiche is read through it':
      'git n’est pas installé ici, et toute fiche est lue à travers lui',
    '%s is not a git repository': '%s n’est pas un dépôt git',
    '%s has no local main branch to read': '%s n’a pas de branche main locale à lire',
    '%s carries no .agent/lots/ on main': '%s ne porte pas de .agent/lots/ sur main',
    '%s has no .agent/lots/ on the main that reached the forge — committed elsewhere, perhaps':
      '%s n’a pas de .agent/lots/ sur le main arrivé à la forge — commité ailleurs, peut-être',
    '%s is in flight on a branch the forge never saw — what is shown is main’s':
      '%s est en chantier sur une branche que la forge n’a jamais vue — ce qui est montré vient de main',
    '%s names a branch that no longer exists here':
      '%s nomme une branche qui n’existe plus ici',
    '%s names a branch git would read as an option':
      '%s nomme une branche que git lirait comme une option',
    '%s has no frontmatter': '%s n’a pas de frontmatter',
    '%s declares no id': '%s ne déclare pas d’id',
    '%s and its file name disagree': '%s et le nom de son fichier ne concordent pas',
    '%s declares a type that is neither lot nor question':
      '%s déclare un type qui n’est ni lot ni question',
    '%s has a status its type does not have': '%s a un statut que son type n’a pas',
    '%s depends on something no scanned repository holds':
      '%s dépend de quelque chose qu’aucun dépôt scanné ne porte',
    'two fiches claim the id %s': 'deux fiches revendiquent l’id %s',
    'these fiches depend on each other in a circle: %s':
      'ces fiches dépendent l’une de l’autre en cercle : %s',
    'priority %n': 'priorité %n',
    'faulty status': 'statut inconnu',
    'in a dependency circle': 'dans un cycle de dépendances',
    '%n items': '%n items',
    '%n yours': '%n à vous',
    '%n frozen': '%n gelés',
  },
}

/** A translator for one locale — see the shell's plugin contract. */
export function words(locale) {
  const table = WORDS[String(locale ?? '').slice(0, 2)] ?? {}
  return (key) => table[key] ?? key
}

/** `%n`/`%s` filled in, so a translated sentence keeps its own word order. */
export const fill = (sentence, value) => sentence.replace(/%[ns]/, String(value))

/**
 * A status's tone — what the pill is coloured by.
 *
 * Four tones rather than one per status: a screen where every state has its
 * own colour is a screen where no colour means anything. `waiting` is the one
 * that matters (somebody must act and that somebody is usually the reader),
 * `underway` is in hand, `settled` is over, `fault` is a fiche to repair.
 */
export function toneOf(item) {
  if (item.badStatus || item.cycle) return 'fault'
  if (item.finished) return 'settled'
  if (item.type === 'question') return 'waiting'
  return item.status === 'idea' || item.status === 'design' ? 'waiting' : 'underway'
}

/** Who has the hand, in the reader's language. */
export const ownerWord = (item, t) =>
  ({ monsieur: t('you'), coder: t('coding agent'), integrateur: t('integrating agent') })[
    item.owner
  ] ?? t('nobody')

/**
 * The bands of the hub, in the order they are drawn.
 *
 * `mine` is the contract's own "à traiter par Monsieur" — open questions and
 * lots still being specified. `frozen` is the subset of those questions that
 * hold something up; they appear twice on purpose, once as the alarm and once
 * in their place in the list, because a band that hides its members elsewhere
 * makes the second list wrong.
 */
export function sections(items) {
  const live = items.filter((item) => !item.finished)
  return {
    frozen: live
      .filter((item) => item.type === 'question' && item.status === 'open' && item.blocks > 0)
      .sort((a, b) => b.blocks - a.blocks || a.rank - b.rank),
    mine: live.filter(
      (item) =>
        (item.type === 'question' && item.status === 'open') ||
        (item.type === 'lot' && (item.status === 'idea' || item.status === 'design')),
    ),
    underway: live.filter(
      (item) => item.type === 'lot' && (item.status === 'code' || item.status === 'integrate'),
    ),
    live,
    // Folded away rather than dropped: what is done is what somebody looks for
    // when they want to know how the last one went.
    finished: items.filter((item) => item.finished),
  }
}

/**
 * What the tile says before anyone opens it.
 *
 * The frozen count runs hot and nothing else does. A tile where every figure
 * is an alarm says exactly as much as a tile with no figures at all.
 */
export function tileInfo(graph, t) {
  const items = graph.items ?? []
  if (items.length === 0) return undefined
  const bands = sections(items)
  const mine = bands.mine.length
  const frozen = bands.live.filter((item) => item.blocked).length

  const first = bands.frozen[0] ?? bands.mine.find((item) => !item.blocked) ?? bands.mine[0]
  return {
    ...(first ? { subtitle: first.title } : {}),
    chips: [
      { text: fill(t('%n items'), bands.live.length) },
      ...(mine > 0 ? [{ text: fill(t('%n yours'), mine), hot: true }] : []),
      ...(frozen > 0 ? [{ text: fill(t('%n frozen'), frozen) }] : []),
    ],
  }
}

/**
 * A diagnostic, in the reader's language.
 *
 * The API sends a CODE and the facts around it, never a rendered sentence: an
 * API is handed paths, not words, and the instance's language is the front's
 * business. `message` travels with it anyway, in English, as the answer for
 * anyone reading the JSON — and as the fallback here, so a code added
 * server-side degrades to a correct English line rather than to a blank.
 */
export function problemWords(problem, t) {
  const short = (path) => String(path ?? '').replace(/\/+$/, '').split('/').pop()
  const who = problem.id ?? short(problem.path) ?? short(problem.repo)

  switch (problem.code) {
    case 'no-git':
      return t('git is not installed here, and every fiche is read through it')
    case 'not-a-repo':
      return fill(t('%s is not a git repository'), short(problem.repo))
    case 'no-main':
      return fill(t('%s has no local main branch to read'), short(problem.repo))
    case 'no-lots':
      return fill(t('%s carries no .agent/lots/ on main'), short(problem.repo))
    case 'no-lots-pushed':
      return fill(
        t('%s has no .agent/lots/ on the main that reached the forge — committed elsewhere, perhaps'),
        short(problem.repo),
      )
    case 'branch-not-pushed':
      return `${fill(t('%s is in flight on a branch the forge never saw — what is shown is main’s'), who)} (${problem.branch})`
    case 'branch-gone':
      return `${fill(t('%s names a branch that no longer exists here'), who)} (${problem.branch})`
    case 'bad-branch':
      return `${fill(t('%s names a branch git would read as an option'), who)} (${problem.branch})`
    case 'no-frontmatter':
      return fill(t('%s has no frontmatter'), who)
    case 'no-id':
      return fill(t('%s declares no id'), who)
    case 'id-mismatch':
      return `${fill(t('%s and its file name disagree'), who)} (${problem.path})`
    case 'bad-type':
      return fill(t('%s declares a type that is neither lot nor question'), who)
    case 'bad-status':
      return fill(t('%s has a status its type does not have'), who)
    case 'unknown-dep':
      return `${fill(t('%s depends on something no scanned repository holds'), who)} (${problem.dep})`
    case 'duplicate-id':
      return fill(t('two fiches claim the id %s'), problem.id)
    case 'cycle':
      return fill(t('these fiches depend on each other in a circle: %s'), problem.ids.join(', '))
    default:
      return problem.message
  }
}

/**
 * The sentence a decision starts from, deposited in the composer.
 *
 * `compose`, never `ask`: this plugin does not send. A question is decided by
 * Monsieur, in the body of its fiche, by an agent he told — and a button that
 * fired that off on a click would be this window growing a pen after all.
 */
export function draftFor(item, t) {
  const head =
    item.type === 'question'
      ? `${t('Draft a decision')} — ${item.id} : ${item.title}`
      : `${t('Ask about this lot')} — ${item.id} : ${item.title}`
  const frozen = item.blocks > 0 ? `\n(${fill(t('freezes %n'), item.blocks)})` : ''
  return `${head}\n${item.repo}/${item.path}${frozen}\n\n`
}
