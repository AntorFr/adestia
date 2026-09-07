/**
 * The server side of a period of meals: one frontier, one overlay.
 *
 * Two kinds of data live here and the whole design is about keeping them
 * apart — the same frontier the trips and the workbench draw, for the same
 * reason:
 *
 * - the DATA (`<name>.meals.json`) is written by the agent and reviewed like
 *   any other file. Nothing in this module ever writes it.
 * - the GESTURES of the frise (confirm, move, set aside) land in a SIBLING
 *   `<name>.meals-state.json`. A drag is not an edit of your week;
 *   consolidating the overlay back into the file is a decision somebody makes.
 *
 * There is nothing else. No nutrition database, no totals, no unit
 * conversion — the file's `props` are free keys the agent writes and reads
 * back, and a plugin that started summing them would be inventing a
 * vocabulary the contract deliberately leaves open.
 */

import { SECTIONS, STATUTS } from './web/model.js'

const SUFFIX = '.meals.json'
const ISO = /^\d{4}-\d{2}-\d{2}$/
/** An overlay is a handful of gestures; anything larger is not one. */
const MAX_BYTES = 256_000

/**
 * The name of a period, validated without touching the disk.
 *
 * Convention rather than declaration, like the workbooks: a period is a file
 * beside the page that speaks of it, so creating one is writing a file. No
 * registry to keep, nothing to forget.
 *
 * A path from a request stays user input, hence the suffix checked here. But
 * WHERE the file lives is the core's business: the memory may be composed of
 * several stores.
 */
export function safeMealsPath(requested) {
  if (typeof requested !== 'string' || requested.includes('\0')) return undefined
  const path = requested.replace(/^\/+/, '')
  if (!path.endsWith(SUFFIX) || path === SUFFIX) return undefined
  if (path.split('/').some((segment) => segment === '..' || segment.startsWith('.'))) {
    return undefined
  }
  return path
}

/** `…/x.meals.json` → `…/x.meals-state.json`. Beside it, never inside it. */
export const overlayPath = (path) => `${path.slice(0, -SUFFIX.length)}.meals-state.json`

/**
 * One gesture, narrowed to what an overlay is allowed to say.
 *
 * `sections` comes from the file itself rather than from a table here: they
 * are declared per period, so the only honest source is the period. A gesture
 * naming a section the file does not declare is refused — an overlay cannot
 * invent a word — and `null` is kept as the way to say "back to the tray",
 * distinct from an absent key, which says nothing about placement.
 */
export function cleanGesture(body, sections = SECTIONS) {
  if (!body || typeof body !== 'object') return undefined
  const { id } = body
  if (typeof id !== 'string' || id === '' || id.length > 200) return undefined

  const fields = {}
  if ('statut' in body) {
    if (!STATUTS.includes(body.statut)) return undefined
    fields.statut = body.statut
  }
  if ('jour' in body) {
    if (body.jour === null) fields.jour = null
    else if (typeof body.jour === 'string' && ISO.test(body.jour)) fields.jour = body.jour
    else return undefined
  }
  if ('section' in body) {
    if (body.section === null) fields.section = null
    else if (sections.includes(body.section)) fields.section = body.section
    else return undefined
  }
  if ('ordre' in body) {
    if (body.ordre === null) fields.ordre = null
    else if (typeof body.ordre === 'number' && Number.isFinite(body.ordre)) fields.ordre = body.ordre
    else return undefined
  }
  if (Object.keys(fields).length === 0) return undefined
  return { id, fields }
}

/** The overlay as it is on disk, or an empty one — a period nobody touched has none. */
async function readOverlay(pages, path) {
  const raw = await pages.read(overlayPath(path))
  if (typeof raw !== 'string' || raw.length > MAX_BYTES) return { items: {} }
  try {
    const parsed = JSON.parse(raw)
    return { items: parsed?.items && typeof parsed.items === 'object' ? parsed.items : {} }
  } catch {
    // A corrupted overlay is not a reason to lose the screen: the file is the
    // truth, and the gestures over it are the part that can be rebuilt.
    return { items: {} }
  }
}

/** The sections the period declares, read for validation only. */
async function sectionsOfFile(pages, path) {
  try {
    const raw = await pages.read(path)
    if (typeof raw !== 'string') return SECTIONS
    const declared = JSON.parse(raw)?.sections
    if (!Array.isArray(declared)) return SECTIONS
    const names = declared.filter((name) => typeof name === 'string' && name !== '')
    return names.length > 0 ? names : SECTIONS
  } catch {
    return SECTIONS
  }
}

export default async function api(app, { pages }) {
  app.get('/state', async (request, reply) => {
    const path = safeMealsPath(request.query?.f)
    if (!path) return reply.code(400).send({ error: 'bad path' })
    return readOverlay(pages, path)
  })

  app.post('/state', async (request, reply) => {
    const path = safeMealsPath(request.query?.f)
    if (!path) return reply.code(400).send({ error: 'bad path' })
    // The period has to exist before it can be gestured over: an overlay
    // written beside nothing is a file nobody will ever read or clean up.
    if (!(await pages.exists(path))) return reply.code(404).send({ error: 'no such period' })

    const gesture = cleanGesture(request.body, await sectionsOfFile(pages, path))
    if (!gesture) return reply.code(400).send({ error: 'bad gesture' })

    const overlay = await readOverlay(pages, path)
    const items = {
      ...overlay.items,
      [gesture.id]: { ...overlay.items[gesture.id], ...gesture.fields },
    }
    await pages.write(overlayPath(path), JSON.stringify({ items }, null, 1))
    return { items }
  })
}
