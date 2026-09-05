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

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

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

/**
 * Le service de mémoire, adossé à des DOSSIERS plutôt qu'au noyau.
 *
 * Le serveur en reçoit un du noyau, qui compose les magasins. L'outil en ligne
 * de commande, lui, tourne hors du serveur : il n'a que des chemins, donc il
 * s'en fabrique un. La liste est ordonnée comme une précédence — le premier
 * dossier qui porte un nom gagne — pour que l'agent en ligne de commande voie
 * exactement ce que l'interface voit.
 */
export function pagesOverDirs(dirs) {
  const roots = (Array.isArray(dirs) ? dirs : [dirs]).filter(Boolean)
  const walk = async (root, prefix = '', out = []) => {
    for (const entry of await readdir(join(root, prefix), { withFileTypes: true }).catch(() => [])) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(root, path, out)
      else out.push(path)
    }
    return out
  }
  const find = async (path) => {
    for (const root of roots) {
      if (await exists(join(root, path))) return join(root, path)
    }
    return undefined
  }
  return {
    async list({ keep } = {}) {
      const seen = []
      for (const root of roots) {
        for (const path of await walk(root)) {
          if (keep && !keep(path.split('/').at(-1))) continue
          seen.push({ path, store: root })
        }
      }
      return seen
    },
    async read(path) {
      const file = await find(path)
      return file ? readFile(file, 'utf8').catch(() => undefined) : undefined
    },
    exists: async (path) => (await find(path)) !== undefined,
    async write(path, contents) {
      const target = join(roots[0], path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, contents)
      return { store: roots[0] }
    },
  }
}

async function exists(file) {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

/**
 * Tout ce que la mémoire porte, en chemins LOGIQUES.
 *
 * Le parcours du disque vivait ici ; il vit maintenant dans le noyau, qui sait
 * de combien de magasins la mémoire est composée, dans quel ordre ils
 * priment, et où s'applique la garde. Ce plugin n'a plus de racine à explorer.
 */
const walk = async (pages, keep) =>
  (await pages.list(keep ? { keep } : {})).map((entry) => entry.path)

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
export async function readSources(pages) {
  const files = (await walk(pages, (name) => name === 'veille.json')).filter((path) =>
    path.endsWith('assets/veille.json'),
  )
  const sources = []
  const seen = new Set()
  const problems = []

  for (const file of files.sort()) {
    let data
    try {
      data = JSON.parse((await pages.read(file)) ?? '')
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
export async function readLibrary(pages, keyOf) {
  const items = []
  for (const path of await walk(pages, (name) => name.endsWith('.md'))) {
    let fields
    try {
      // Only the head of the file: a transcript-adjacent page can be long and
      // nothing below the frontmatter is read here.
      fields = frontmatterOf(((await pages.read(path)) ?? '').slice(0, 4096))
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
      transcript: (await pages.exists(assets.transcript)) ? assets.transcript : null,
    })
  }
  return items.sort((a, b) => String(b.publie ?? '').localeCompare(String(a.publie ?? '')))
}

/**
 * Le NOM d'une page, validé sans toucher au disque.
 *
 * Un chemin venu d'une requête reste une entrée utilisateur : le suffixe est
 * vérifié ici, la localisation est l'affaire du noyau.
 */
export function safePath(requested, { suffix } = {}) {
  if (typeof requested !== 'string' || requested === '' || requested.includes('\0')) return undefined
  const path = requested.replace(/^\/+/, '')
  if (path === '') return undefined
  if (path.split('/').some((segment) => segment === '..' || segment.startsWith('.'))) {
    return undefined
  }
  if (suffix && !path.toLowerCase().endsWith(suffix)) return undefined
  return path
}
