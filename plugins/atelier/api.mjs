/**
 * Workbooks: discovery by convention, and the two overlays beside them.
 *
 * The boundary this enforces is the one the contract calls the frontier of
 * gestures: **the front never writes your workbook.** A `workbook.json` is
 * written by the agent, reviewed like any other file, and validated before it
 * is committed. What the bench produces — a tick against a step, a band
 * dragged somewhere better — lands in a SIBLING file, and consolidating the
 * two is a decision somebody makes, not something a click does.
 *
 * Which is why there are three routes and only two of them accept writes.
 */

import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join, relative, resolve, sep } from 'node:path'

const WORKBOOK = 'workbook.json'

/**
 * Walks for `**\/assets/workbook.json`.
 *
 * Convention rather than declaration: a project holds its workbook in its own
 * assets folder and the app finds it. Nothing to register, so a new project is
 * a folder and a file.
 */
async function findWorkbooks(root, prefix = '', depth = 0) {
  if (depth > 6) return []
  let entries
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true })
  } catch {
    return []
  }

  const found = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      found.push(...(await findWorkbooks(root, path, depth + 1)))
    } else if (entry.name === WORKBOOK && prefix.endsWith('/assets')) {
      found.push(path)
    }
  }
  return found
}

/** A path from a query string is user input, wherever it looks like it came from. */
export function safeWorkbookPath(root, requested) {
  if (typeof requested !== 'string' || requested.includes('\0')) return undefined
  const target = resolve(root, `./${requested.replace(/^\/+/, '')}`)
  const rel = relative(root, target)
  if (rel.startsWith('..') || rel.startsWith(`..${sep}`)) return undefined
  if (!target.endsWith(`${sep}${WORKBOOK}`)) return undefined
  return target
}

/** `…/workbook.json` → `…/workbook-state.json`. Beside, never inside. */
export const overlayPath = (workbook, kind) =>
  join(dirname(workbook), `workbook-${kind}.json`)

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  // Atomic: the agent may be reading this while the bench writes it, and a
  // half-written overlay is a workbook that renders wrong rather than one that
  // fails to load.
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2))
  await rename(temporary, path)
}

/**
 * One card's worth of a workbook.
 *
 * Every field here is read by the hub's markup, which is why this is a named
 * function rather than an object literal inside a route: the first version
 * omitted `done` and `total`, and what reached the screen was
 * "undefined/4 étapes" — a shape mismatch that no type and no test would have
 * caught, only a screenshot.
 */
export function summarise(path, data, fait = {}) {
  const timestamps = Object.values(fait).filter((value) => typeof value === 'string')
  return {
    path,
    projet: data.projet ?? null,
    titre: data.titre ?? data.projet ?? path,
    pieces: Array.isArray(data.pieces) ? data.pieces.length : 0,
    // Steps if the workbook plans any, pieces otherwise: a workbook with no
    // cutting plan yet still has progress worth showing, and "0/0" on every
    // card would read as a broken screen rather than an early one.
    total:
      (data.debit ?? []).reduce((sum, sheet) => sum + (sheet.etapes?.length ?? 0), 0) ||
      (Array.isArray(data.pieces) ? data.pieces.length : 0),
    done: Object.keys(fait).length,
    lastActivity: timestamps.sort().at(-1) ?? null,
  }
}

export default async function api(app, opts) {
  // The host says where the pages tree lives; its folder name is
  // configuration, so deriving it from workspaceRoot finds nothing on an
  // instance that names it `memory`.
  const root = opts.pagesRoot

  app.get('/workbooks', async () => {
    const paths = await findWorkbooks(root)
    const workbooks = []
    for (const path of paths.sort()) {
      const file = join(root, path)
      const data = await readJson(file, null)
      if (!data) continue
      const fait = (await readJson(overlayPath(file, 'state'), {})).fait ?? {}
      workbooks.push(summarise(path, data, fait))
    }
    // Most recently worked on first — the bench comes back to what it left.
    workbooks.sort((a, b) => String(b.lastActivity ?? '').localeCompare(String(a.lastActivity ?? '')))
    return { workbooks }
  })

  app.get('/workbook', async (request, reply) => {
    const path = safeWorkbookPath(root, request.query.path)
    if (!path) return reply.code(400).send({ error: 'not a workbook path' })
    try {
      // Returned raw, so the front converts a dormant 2.0 itself — the
      // compatibility path lives in one place, next to the engine that reads
      // it, rather than being duplicated server-side.
      return JSON.parse(await readFile(path, 'utf8'))
    } catch {
      return reply.code(404).send({ error: 'no workbook there' })
    }
  })

  for (const kind of ['state', 'layout']) {
    app.get(`/${kind}`, async (request, reply) => {
      const path = safeWorkbookPath(root, request.query.wb)
      if (!path) return reply.code(400).send({ error: 'not a workbook path' })
      return readJson(overlayPath(path, kind), kind === 'state' ? { fait: {} } : {})
    })

    app.post(`/${kind}`, async (request, reply) => {
      const body = request.body ?? {}
      const path = safeWorkbookPath(root, body.wb)
      if (!path) return reply.code(400).send({ error: 'not a workbook path' })

      const file = overlayPath(path, kind)
      const current = await readJson(file, kind === 'state' ? { fait: {} } : {})

      if (kind === 'state') {
        // One step at a time, by key: the bench ticks a line, it does not
        // submit a form. Sending the whole map would make two people at two
        // screens overwrite each other silently.
        if (typeof body.key !== 'string') {
          return reply.code(400).send({ error: 'key is required' })
        }
        current.fait ??= {}
        // The value is the moment, not a boolean: it is what dates a workbook
        // in the listing, and it is truthy either way for the engine reading
        // it back.
        if (body.done) current.fait[body.key] = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
        else delete current.fait[body.key]
      } else {
        // Layout arrives as partial maps of `poses` and `bandes`, merged over
        // what is there: a bench that moved one band must not blank the rest.
        for (const section of ['poses', 'bandes']) {
          if (body[section] && typeof body[section] === 'object') {
            current[section] = { ...(current[section] ?? {}), ...body[section] }
          }
        }
      }

      await writeJson(file, current)
      return current
    })
  }
}
