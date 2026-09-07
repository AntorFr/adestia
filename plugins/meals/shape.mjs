/**
 * A period's SHAPE, read from the page that declares it.
 *
 * The page is the authority here, and that is the whole architecture in one
 * sentence: `sante/septembre.md` typed `meals` carries the dates, the sections
 * and where its cards are filed; the JSON beside it carries only the cards.
 * Nothing is stated twice, so nothing can drift — and correcting a date is
 * editing a page, in the editor everybody already knows.
 *
 * It follows that the data file is reachable ONLY through a page that names
 * it. A route taking a JSON path directly would be a way to read and write any
 * `.json` in the memory; taking a page and following its declaration is a
 * boundary that closes itself.
 *
 * The frontmatter is parsed here rather than borrowed from the core. The
 * core's own parser lives in TypeScript inside the server package, which a
 * plugin does not import — the same wall the trips plugin met with the status
 * tones. So this reads the handful of fields a period declares, and nothing
 * else: a plugin that started parsing arbitrary YAML would be a second, worse
 * copy of something that already exists upstream.
 */

const SUFFIX = '.meals.json'

/** The three every period gets when it declares none. */
export const SECTIONS = ['matin', 'midi', 'soir']

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** `sante/septembre.md` → `sante/assets/septembre.meals.json`. */
export function conventionalData(page) {
  const parts = String(page ?? '').split('/')
  const file = (parts.pop() ?? '').replace(/\.md$/i, '')
  return [...parts, 'assets', `${file}${SUFFIX}`].join('/')
}

/** Strip one layer of quotes, the way a YAML scalar wears them. */
const unquote = (raw) => {
  const value = String(raw ?? '').trim()
  if (value.length > 1 && /^(".*"|'.*')$/s.test(value)) return value.slice(1, -1)
  return value
}

/**
 * The frontmatter block of a markdown document, or nothing.
 *
 * Three dashes on their own line, the fields, three dashes again — exactly
 * what `page-author` specifies, and exactly what the core recognises.
 */
function frontmatterOf(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(String(markdown ?? ''))
  return match?.[1]
}

/**
 * A list written either way YAML allows it, because both reach real files:
 *
 *     sections: [matin, midi, soir]
 *     sections:
 *       - matin
 */
function listAfter(lines, index) {
  const inline = /^[^:]+:\s*\[(.*)\]\s*$/.exec(lines[index] ?? '')
  if (inline) {
    return inline[1]
      .split(',')
      .map((entry) => unquote(entry))
      .filter((entry) => entry !== '')
  }
  const items = []
  for (let line = index + 1; line < lines.length; line += 1) {
    const bullet = /^\s+-\s+(.*)$/.exec(lines[line] ?? '')
    if (!bullet) break
    const entry = unquote(bullet[1])
    if (entry !== '') items.push(entry)
  }
  return items
}

/**
 * What a page says it is, as far as this plugin is concerned.
 *
 * Every field is optional except the type: a period framed with no dates yet
 * is a legitimate state — a tray of ideas — and the screen says so rather than
 * drawing an empty calendar.
 */
export function shapeOf(page, markdown) {
  const block = frontmatterOf(markdown)
  if (block === undefined) return undefined
  const lines = block.split(/\r?\n/)

  const shape = { page, sections: SECTIONS, data: conventionalData(page) }
  for (const [index, line] of lines.entries()) {
    const field = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!field) continue
    const [, key, rest] = field
    const value = unquote(rest)
    if (key === 'type') shape.type = value
    else if (key === 'title' || key === 'titre') shape.titre = value
    else if (key === 'ico') shape.ico = value
    else if (key === 'debut' && ISO.test(value)) shape.debut = value
    else if (key === 'fin' && ISO.test(value)) shape.fin = value
    else if (key === 'sections') {
      const names = listAfter(lines, index)
      if (names.length > 0) shape.sections = names
    } else if (key === 'data' && value !== '') shape.data = resolveData(page, value)
  }
  return shape
}

/**
 * The data path a page declares, anchored to the page's own folder.
 *
 * Relative like an image is relative — `assets/x.meals.json` means "beside this
 * page" — and a declaration that would climb out of the folder is refused
 * rather than folded back: it is not a typo to repair, it is a request not to
 * serve.
 */
export function resolveData(page, declared) {
  const folder = String(page ?? '').split('/').slice(0, -1)
  const segments = []
  for (const segment of String(declared ?? '').replace(/^\/+/, '').split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..' || segment.startsWith('.')) return undefined
    segments.push(segment)
  }
  if (segments.length === 0) return undefined
  const path = [...folder, ...segments].join('/')
  return path.endsWith(SUFFIX) ? path : undefined
}

/** A page path from a request stays user input until this says otherwise. */
export function safePagePath(requested) {
  if (typeof requested !== 'string' || requested.includes('\0')) return undefined
  const path = requested.replace(/^\/+/, '')
  if (!/\.md$/i.test(path)) return undefined
  if (path.split('/').some((segment) => segment === '..' || segment.startsWith('.'))) {
    return undefined
  }
  return path
}
