/**
 * The workspace side: what has been kept, and what the person declared they
 * follow.
 *
 * Two reads, one convention. An ITEM is a page typed `ecoute` — so a video
 * somebody kept is a page like any other, editable in the shell, greppable by
 * the agent, and still there the day this plugin is removed. Its transcript is
 * a FILE BESIDE IT, under the page's own `assets/`, because a wall of speech
 * belongs in an attachment rather than in the prose somebody wrote about it.
 *
 * ⚠️ Nothing here writes. The browser has `PUT /api/pages`, the agent has its
 * file tools, and both go through the shell's own validation — a plugin that
 * wrote pages behind them would be a second grammar for the same store.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

/** The `type:` this plugin dispatches on. Declared in the manifest too. */
export const TYPE = 'ecoute'

/** Where a page's transcript and metadata sit, from the page's own path. */
export function assetsFor(pagePath) {
  const folder = dirname(pagePath)
  const slug = basename(pagePath).replace(/\.md$/i, '')
  const under = folder === '.' || folder === '' ? 'assets' : `${folder}/assets`
  return { transcript: `${under}/${slug}.transcript.txt`, media: `${under}/${slug}.media.json` }
}

/**
 * The frontmatter, read shallowly and on purpose.
 *
 * A YAML parser here would be a production dependency for six scalar fields,
 * and would read MORE than this plugin has any business reading. What is
 * supported is what the contract asks for: `key: value`, `key: [a, b]`, and a
 * dash list under a key. Anything else is ignored rather than guessed at.
 *
 * The shell's own `/api/pages/index` remains the truth for a BROWSER — it
 * parses properly and publishes `finished`, which nothing here re-derives.
 * This exists for the server and the CLI, which have no index to call.
 */
export function frontmatterOf(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/.exec(String(markdown ?? ''))
  if (!match) return {}
  const fields = {}
  let list = null
  for (const raw of match[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(raw)
    if (item && list) {
      fields[list].push(unquote(item[1]))
      continue
    }
    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(raw)
    if (!pair) continue
    const [, key, value] = pair
    if (value.trim() === '') {
      list = key
      fields[key] = []
      continue
    }
    list = null
    const inline = /^\[(.*)\]$/.exec(value.trim())
    fields[key] = inline
      ? inline[1]
          .split(',')
          .map((piece) => unquote(piece))
          .filter(Boolean)
      : unquote(value)
  }
  return fields
}

const unquote = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\s+#.*$/, '')
    .replace(/^(['"])([\s\S]*)\1$/, '$2')
    .trim()

/** Every `.md` and every named file under a tree, workspace-relative. */
async function walk(root, prefix = '', depth = 0, out = []) {
  if (depth > 8) return out
  let entries
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) await walk(root, path, depth + 1, out)
    else out.push(path)
  }
  return out
}

/**
 * The declared sources, wherever they were declared.
 *
 * Found by convention (`**\/assets/veille.json`), like a workbook or a trip:
 * declaring a feed is writing a file, and there is no registry to keep in
 * step. Several files MERGE — one per domain is a legitimate way to file
 * things — and a feed URL declared twice is one source, the first spelling
 * winning, because a duplicate would fetch the same feed twice and show every
 * episode twice.
 */
export async function readSources(pagesRoot) {
  const files = (await walk(pagesRoot)).filter((path) => path.endsWith('assets/veille.json'))
  const sources = []
  const seen = new Set()
  const problems = []

  for (const file of files.sort()) {
    let data
    try {
      data = JSON.parse(await readFile(join(pagesRoot, file), 'utf8'))
    } catch (error) {
      problems.push({ file, error: error.message })
      continue
    }
    for (const source of data?.sources ?? []) {
      const feed = String(source?.flux ?? '').trim()
      if (!/^https?:\/\//i.test(feed) || seen.has(feed)) continue
      seen.add(feed)
      sources.push({
        id: String(source.id ?? feed).trim(),
        titre: String(source.titre ?? source.id ?? feed).trim(),
        flux: feed,
        media: source.media === 'audio' ? 'audio' : source.media === 'video' ? 'video' : null,
        tags: Array.isArray(source.tags) ? source.tags.map(String) : [],
        pourquoi: source.pourquoi ? String(source.pourquoi) : null,
        declaredIn: file,
      })
    }
  }
  return { sources, problems, files }
}

/**
 * Everything already kept: one entry per page typed `ecoute`.
 *
 * `key` is computed from the page's `url`, with the same function the feeds
 * use — that shared key is what lets the queue drop an episode somebody
 * already filed, however differently the two links are spelled.
 */
export async function readLibrary(pagesRoot, keyOf) {
  const items = []
  for (const path of await walk(pagesRoot)) {
    if (!path.endsWith('.md')) continue
    let fields
    try {
      // Only the head of the file: a transcript-adjacent page can be long and
      // nothing below the frontmatter is read here.
      fields = frontmatterOf((await readFile(join(pagesRoot, path), 'utf8')).slice(0, 4096))
    } catch {
      continue
    }
    if (fields.type !== TYPE) continue
    const assets = assetsFor(path)
    items.push({
      path,
      titre: fields.title ?? basename(path, '.md'),
      url: fields.url ?? null,
      key: fields.url ? keyOf(fields.url) : null,
      media: fields.media === 'audio' ? 'audio' : 'video',
      source: fields.source ?? null,
      publie: fields.publie ?? null,
      duree: fields.duree ?? null,
      status: fields.status ?? fields.statut ?? null,
      tags: Array.isArray(fields.tags) ? fields.tags : fields.tags ? [fields.tags] : [],
      transcript: (await exists(join(pagesRoot, assets.transcript))) ? assets.transcript : null,
    })
  }
  return items.sort((a, b) => String(b.publie ?? '').localeCompare(String(a.publie ?? '')))
}

export async function exists(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/** A path from a query string is user input, wherever it looks like it came from. */
export function safePath(root, requested, { suffix } = {}) {
  if (typeof requested !== 'string' || requested === '' || requested.includes('\0')) return undefined
  const target = resolve(root, `./${requested.replace(/^\/+/, '')}`)
  const rel = relative(root, target)
  if (rel === '' || rel.startsWith('..') || rel.startsWith(`..${sep}`)) return undefined
  if (suffix && !target.toLowerCase().endsWith(suffix)) return undefined
  return target
}
