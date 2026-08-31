/**
 * The view's own vocabulary: what a kept item is, how it is addressed, and
 * the handful of words this plugin ships.
 *
 * Pure on purpose — everything here is tested without a DOM, and the screen
 * next door is left with rendering. The one rule that matters: what the
 * LIBRARY is comes from the shell's page index, never from a second listing
 * of our own. `finished` in particular is the core's verdict and is read,
 * never re-derived — an app that kept its own table of statuses is exactly
 * how one screen ends up archiving what the screen next door still shows.
 */

/** The frontmatter `type:` an item carries. Declared in the manifest too. */
export const TYPE = 'ecoute'

export const ROUTE = '/listening-post'

const WORDS = {
  fr: {
    'Loading…': 'Chargement…',
    'to watch': 'À voir',
    // Lowercase: this one lands mid-sentence, on the tile's chip.
    'waiting': 'à voir',
    'in your sources': 'Dans tes flux',
    'kept': 'gardés',
    'archive': 'Archive',
    'search what was said': 'chercher dans ce qui a été dit',
    'search': 'Chercher',
    'no transcript yet': 'pas encore de transcript',
    'transcript': 'Transcript',
    'open': 'ouvrir',
    'extract': 'extraire',
    'dismiss': 'écarter',
    'drop a link': 'coller un lien — vidéo, épisode, article',
    'add': 'Ajouter',
    'refresh': 'rafraîchir',
    "what's new?": 'quoi de neuf ?',
    'nothing waiting': 'rien en attente',
    'nothing kept yet': 'rien de gardé pour le moment',
    'no result': 'aucun passage',
    'source': 'source',
    'sources': 'sources',
    'silent': 'muette',
    'no source declared yet': 'aucune source déclarée',
    'searched': 'cherché dans',
    'items': 'fiches',
    'passages': 'passages',
    'sheet': 'fiche',
    'sheets': 'fiches',
    'no transcriber on this instance': 'pas de transcripteur local ici',
  },
}

export const words = (locale) => {
  const table = WORDS[String(locale ?? '').slice(0, 2)] ?? {}
  return (key) => table[key] ?? key
}

/** `veille/underscore-ia.md` → `underscore-ia`. */
export const slugOf = (path) => String(path ?? '').split('/').at(-1).replace(/\.md$/i, '')

/**
 * The kept items, read out of the shell's page index.
 *
 * Everything a card shows is frontmatter, which is what makes an item a page
 * anybody can open, edit and grep rather than a row in a store of ours.
 */
export function buildLibrary(entries) {
  return (entries ?? [])
    .filter((entry) => entry?.fields?.type === TYPE)
    .map((entry) => ({
      path: entry.path,
      slug: slugOf(entry.path),
      titre: entry.title ?? slugOf(entry.path),
      url: entry.fields.url ?? null,
      media: entry.fields.media === 'audio' ? 'audio' : 'video',
      source: entry.fields.source ?? null,
      publie: entry.fields.publie ?? null,
      duree: entry.fields.duree ?? null,
      ico: entry.fields.ico ?? null,
      tags: toList(entry.fields.tags),
      // The core's own verdict on whether this page's life is over.
      finished: entry.finished === true,
    }))
    .sort((a, b) => String(b.publie ?? '').localeCompare(String(a.publie ?? '')))
}

const toList = (value) =>
  Array.isArray(value) ? value.map(String) : typeof value === 'string' && value ? [value] : []

/**
 * An item's address: its NAME where that resolves, its path otherwise.
 *
 * A reader should see `#/listening-post/underscore-ia`, not the path of the
 * file that happens to hold it. Two items sharing a slug fall back to the
 * full path — a pretty link that opens the wrong thing is worse than an ugly
 * one.
 */
export function routeOf(items, path) {
  const item = (items ?? []).find((candidate) => candidate.path === path)
  if (!item) return `${ROUTE}/${path.split('/').map(encodeURIComponent).join('/')}`
  const twice = items.filter((candidate) => candidate.slug === item.slug).length > 1
  return twice
    ? `${ROUTE}/${item.path.split('/').map(encodeURIComponent).join('/')}`
    : `${ROUTE}/${encodeURIComponent(item.slug)}`
}

/** The tail of a route, back to the page it names. Every shape ever written. */
export function resolve(items, rest) {
  const tail = String(rest ?? '').replace(/^\/+/, '')
  if (!tail) return null
  const decoded = tail.split('/').map(decodeURIComponent).join('/')
  const byPath = (items ?? []).find((item) => item.path === decoded)
  if (byPath) return byPath.path
  const named = (items ?? []).filter((item) => item.slug === decoded)
  return named.length === 1 ? named[0].path : null
}

/** What is left of the hash once this view's own route is taken off it. */
export const restOf = (hash) => {
  const clean = String(hash ?? '').replace(/^#/, '')
  return clean === ROUTE || clean.startsWith(`${ROUTE}/`) ? clean.slice(ROUTE.length) : ''
}

/** A workspace path this view has a screen for — or nothing, honestly. */
export function routeFor(items, path) {
  const clean = String(path ?? '').replace(/^\/+/, '')
  const item = (items ?? []).find((candidate) => candidate.path === clean)
  if (item) return routeOf(items, item.path)
  // An asset beside a kept item — its transcript, its metadata — belongs to
  // the item's own screen, which is where a link to it should land.
  const asset = /^(.*)\/assets\/(.+?)\.(transcript\.txt|media\.json)$/.exec(clean)
  if (asset) {
    const owner = (items ?? []).find((candidate) => candidate.path === `${asset[1]}/${asset[2]}.md`)
    if (owner) return routeOf(items, owner.path)
  }
  return undefined
}

/** `2026-08-27` → what the instance's locale calls it. Never a guess. */
export function formatWhen(value, locale) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const stamp = Date.parse(text.length === 10 ? `${text}T12:00:00Z` : text)
  if (Number.isNaN(stamp)) return text
  return new Date(stamp).toLocaleDateString(locale ?? 'fr', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** `3723` → `1:02:03`, for a card. */
export function clock(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const whole = Math.round(seconds)
  const parts = [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60]
  return (parts[0] ? parts : parts.slice(1))
    .map((piece, index) => (index === 0 ? String(piece) : String(piece).padStart(2, '0')))
    .join(':')
}

/** `[00:12:31]`, the spelling the transcript file uses. */
export const stampOf = (seconds) =>
  [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, Math.floor(seconds) % 60]
    .map((piece) => String(piece).padStart(2, '0'))
    .join(':')

export const glyphOf = (item) => item?.ico ?? (item?.media === 'audio' ? '🎧' : '🎬')

/**
 * What the agent is asked when a card's ✦ is pressed.
 *
 * Written here rather than at the call site because it is a CONTRACT with the
 * skill: the words name the command the skill teaches, so the turn that
 * follows does the thing the button promised instead of improvising a
 * summary from the title.
 */
export const extractPrompt = (item) =>
  [
    `Ajoute ça à ma veille : ${item.url}`,
    item.titre ? `(« ${item.titre} »${item.source ? ` — ${item.source}` : ''})` : '',
    'Transcris-le avec l’outil de la veille, puis écris la fiche : ce que ça apprend, les passages qui valent le détour avec leur horodatage, et ce que j’en retiens.',
  ]
    .filter(Boolean)
    .join(' ')

/** The other button: no item, a need. */
export const briefPrompt = () =>
  "Fais le point sur ma veille : ce qui vient d'arriver dans mes flux, ce qui attend d'être regardé, et ce que tu me recommandes en premier — dis pourquoi."

/**
 * The same media, at a given second.
 *
 * A twin of the server's `deepLink`, and deliberately a twin rather than an
 * import: the server's module hashes URLs with `node:crypto`, which no
 * browser has. Twelve lines duplicated, tested on both sides, against a
 * plugin whose view fails to load at all — the trade is not close.
 */
export function linkAt(url, seconds) {
  const at = Math.max(0, Math.floor(Number(seconds) || 0))
  if (!url) return null
  if (!at) return url
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
    if (host.endsWith('youtube.com') || host === 'youtu.be') {
      parsed.searchParams.set('t', `${at}s`)
      return parsed.toString()
    }
    parsed.hash = `t=${at}`
    return parsed.toString()
  } catch {
    return url
  }
}
