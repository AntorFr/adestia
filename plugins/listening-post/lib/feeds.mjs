/**
 * Reading what the sources published, without a parser dependency.
 *
 * Two shapes cover everything this plugin follows: YouTube's Atom feed (a
 * channel is `videos.xml?channel_id=…`, no key, no quota) and podcast RSS.
 * They disagree about every field name and agree about nothing except that a
 * feed is a list of things with a title, a link and a date — so this module
 * flattens both into ONE entry shape and the rest of the plugin never learns
 * which dialect an item came from.
 *
 * Hand-written on purpose. A real XML parser would be a production dependency
 * for the sake of eight tags, and this file's job is narrow enough to be read
 * in one sitting: find the blocks, pull the tags, normalise the dates.
 *
 * ⚠️ Nothing here fetches. Parsing is pure and testable; the network lives in
 * `api.mjs` and in the tool, which are the two places that can honestly say
 * "the feed did not answer".
 */

import { createHash } from 'node:crypto'

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Text as a feed writes it — entities, CDATA and all — as text. */
export function decode(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every `<tag>…</tag>` block of a document, self-closing ones ignored. */
export function blocksOf(xml, tag) {
  const found = []
  const open = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'gi')
  for (let match = open.exec(xml); match; match = open.exec(xml)) {
    const from = match.index + match[0].length
    const close = xml.indexOf(`</${tag}`, from)
    if (close === -1) continue
    found.push(xml.slice(from, close))
    open.lastIndex = close
  }
  return found
}

/** The first `<tag>` of a block, as text. */
export function textOf(block, tag) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}\\s*>`, 'i').exec(block)
  return match ? decode(match[1]) : ''
}

/** One attribute of the first `<tag …>` of a block. */
export function attrOf(block, tag, attribute) {
  const open = new RegExp(`<${tag}(\\s[^>]*)?/?>`, 'i').exec(block)
  if (!open?.[1]) return ''
  const value = new RegExp(`\\s${attribute}\\s*=\\s*"([^"]*)"`, 'i').exec(open[1])
  return value ? decode(value[1]) : ''
}

/**
 * A date, whatever dialect wrote it, as an ISO instant — or `null`.
 *
 * `null` rather than "now": an entry with an unreadable date is an entry
 * nobody can place, and dating it today would put it at the top of a queue
 * sorted by freshness. Absence sorts last and says so on screen.
 */
export function whenOf(value) {
  const text = decode(value)
  if (!text) return null
  const stamp = Date.parse(text)
  return Number.isNaN(stamp) ? null : new Date(stamp).toISOString()
}

/** `01:02:03`, `62:03` or a count of seconds → seconds. */
export function secondsOf(value) {
  const text = decode(value)
  if (!text) return null
  if (/^\d+$/.test(text)) return Number(text)
  const parts = text.split(':').map((piece) => Number(piece))
  if (parts.some((piece) => !Number.isFinite(piece))) return null
  return parts.reduce((total, piece) => total * 60 + piece, 0)
}

/** `4213` → `1:10:13`. What a card shows, never what a file stores. */
export function clockOf(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const whole = Math.round(seconds)
  const parts = [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60]
  return (parts[0] ? parts : parts.slice(1))
    .map((piece, index) => (index === 0 ? String(piece) : String(piece).padStart(2, '0')))
    .join(':')
}

/**
 * The same video, addressed four ways, is one entry.
 *
 * A link travels: a share sheet adds `si=`, a newsletter adds `utm_*`, the
 * mobile app writes `youtu.be/…` and the browser writes `watch?v=…`. Keying a
 * queue on the raw string means the thing you dismissed on Monday comes back
 * on Tuesday wearing a different suffix — so the key is what the URL POINTS
 * AT, and `yt:<id>` is the same key for all four spellings above.
 */
export function keyOf(url) {
  const raw = String(url ?? '').trim()
  if (!raw) return null
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return `url:${createHash('sha1').update(raw).digest('hex').slice(0, 12)}`
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0]
    if (id) return `yt:${id}`
  }
  if (host.endsWith('youtube.com')) {
    const id = parsed.searchParams.get('v') ?? parsed.pathname.split('/').filter(Boolean).at(-1)
    if (id) return `yt:${id}`
  }

  // Everything else: the URL minus the tracking a share added to it. Podcast
  // enclosures carry session parameters that change on every fetch, which is
  // why the query is dropped for the KEY and kept in the link.
  for (const name of [...parsed.searchParams.keys()]) {
    if (/^(utm_|si$|fbclid$|igshid$|ref$|ref_src$)/i.test(name)) parsed.searchParams.delete(name)
  }
  const canonical = `${host}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`
  return `url:${createHash('sha1').update(canonical).digest('hex').slice(0, 12)}`
}

/** Where a media plays from a given second — the whole point of a timestamp. */
export function deepLink(url, seconds) {
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
    // The media fragment the HTML spec defines: an <audio> or <video> served
    // by anybody honours it, and a site that does not simply opens at zero.
    parsed.hash = `t=${at}`
    return parsed.toString()
  } catch {
    return url
  }
}

/** An Atom `<entry>` — YouTube's dialect, and most blogs'. */
function fromAtom(block, source) {
  const url =
    attrOf(block, 'link', 'href') || textOf(block, 'id').replace(/^yt:video:/, '') || ''
  return {
    url,
    titre: textOf(block, 'title') || textOf(block, 'media:title'),
    publie: whenOf(textOf(block, 'published') || textOf(block, 'updated')),
    resume: textOf(block, 'media:description') || textOf(block, 'summary'),
    secondes: secondsOf(textOf(block, 'itunes:duration')),
    media: source.media ?? (/youtu/.test(url) ? 'video' : null),
  }
}

/** An RSS `<item>` — every podcast on earth. */
function fromRss(block, source) {
  const enclosure = attrOf(block, 'enclosure', 'type')
  const link = textOf(block, 'link') || attrOf(block, 'enclosure', 'url')
  return {
    url: link,
    titre: textOf(block, 'title'),
    publie: whenOf(textOf(block, 'pubDate')),
    resume: textOf(block, 'itunes:subtitle') || textOf(block, 'description'),
    secondes: secondsOf(textOf(block, 'itunes:duration')),
    // A feed that ships an audio enclosure is an audio feed, whatever the
    // source declaration guessed; the file is the fact.
    media: enclosure.startsWith('audio/')
      ? 'audio'
      : enclosure.startsWith('video/')
        ? 'video'
        : (source.media ?? null),
    // Podcasting 2.0: some feeds publish the transcript themselves, which is
    // the one case where nothing has to be transcribed at all.
    transcript: attrOf(block, 'podcast:transcript', 'url') || null,
  }
}

/**
 * A feed document → the entries it announces, in this plugin's own shape.
 *
 * `source` is what the workspace DECLARED about the feed (its name, whether
 * it is watched or listened to, its tags); what the feed says about itself is
 * only used to fill the gaps. The declaration is a person's judgement and the
 * feed's title is marketing.
 */
export function parseFeed(xml, source = {}) {
  const document = String(xml ?? '')
  const atom = blocksOf(document, 'entry')
  const rss = blocksOf(document, 'item')
  const raw = atom.length >= rss.length ? atom.map((block) => fromAtom(block, source)) : rss.map((block) => fromRss(block, source))

  const entries = []
  for (const entry of raw) {
    const key = keyOf(entry.url)
    if (!key || !entry.titre) continue
    entries.push({
      key,
      url: entry.url,
      titre: entry.titre,
      publie: entry.publie,
      resume: (entry.resume ?? '').slice(0, 400),
      secondes: entry.secondes ?? null,
      media: entry.media ?? 'video',
      transcript: entry.transcript ?? null,
      sourceId: source.id ?? null,
      source: source.titre ?? textOf(document, 'title') ?? null,
      tags: source.tags ?? [],
    })
  }
  return entries
}

/** Freshest first; an undated entry sorts last rather than to the top. */
export function byFreshness(a, b) {
  return (
    Number(a.publie === null) - Number(b.publie === null) ||
    String(b.publie ?? '').localeCompare(String(a.publie ?? '')) ||
    String(a.titre).localeCompare(String(b.titre), 'fr')
  )
}
