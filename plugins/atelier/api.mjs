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

import { dirname, join, relative, resolve, sep } from 'node:path'

const WORKBOOK = 'workbook.json'

/**
 * Le nom d'un workbook, validé sans toucher au disque.
 *
 * La convention plutôt que la déclaration : un projet range son workbook dans
 * son propre `assets/` et l'app l'y trouve. Rien à enregistrer, donc un
 * nouveau projet est un dossier et un fichier.
 *
 * Un chemin venu d'une requête reste une entrée utilisateur, d'où le suffixe
 * vérifié ici. Mais OÙ le fichier vit n'est plus l'affaire de ce plugin : la
 * mémoire peut être composée de plusieurs magasins, et c'est le noyau qui sait
 * lesquels et où s'applique la garde de traversée.
 */
export function safeWorkbookPath(requested) {
  if (typeof requested !== 'string' || requested.includes('\0')) return undefined
  const path = requested.replace(/^\/+/, '')
  if (!path.endsWith(`/${WORKBOOK}`) && path !== WORKBOOK) return undefined
  if (path.split('/').some((segment) => segment === '..' || segment.startsWith('.'))) {
    return undefined
  }
  return path
}

/** `…/workbook.json` → `…/workbook-state.json`. À côté, jamais dedans. */
export const overlayPath = (workbook, kind) =>
  `${workbook.split('/').slice(0, -1).join('/')}/workbook-${kind}.json`

/** Lecture par le noyau, qui compose les magasins. */
const readJson = async (pages, path, fallback) => {
  const raw = await pages.read(path)
  if (raw === undefined) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

/**
 * Écriture par le noyau, qui décide du magasin.
 *
 * L'atomicité vivait ici en copie ; elle vit maintenant en un seul endroit —
 * et elle en avait besoin, puisqu'un `rename` n'est atomique qu'à l'intérieur
 * d'un système de fichiers et que les magasins sont des montages.
 */
const writeJson = (pages, path, value) => pages.write(path, JSON.stringify(value, null, 2))

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
  // La mémoire est servie par le noyau : chemins LOGIQUES, jamais de racine.
  // Composée de plusieurs magasins ou d'un seul, ce plugin ne voit aucune
  // différence — sauf que chaque workbook dit d'où il vient.
  const pages = opts.pages

  app.get('/workbooks', async () => {
    const found = await pages.list({ keep: (name) => name === WORKBOOK })
    const workbooks = []
    for (const entry of found.filter((one) => one.path.includes('/assets/')).sort((a, b) => a.path.localeCompare(b.path))) {
      const data = await readJson(pages, entry.path, null)
      if (!data) continue
      const fait = (await readJson(pages, overlayPath(entry.path, 'state'), {})).fait ?? {}
      workbooks.push({ ...summarise(entry.path, data, fait), store: entry.store })
    }
    // Most recently worked on first — the bench comes back to what it left.
    workbooks.sort((a, b) => String(b.lastActivity ?? '').localeCompare(String(a.lastActivity ?? '')))
    return { workbooks }
  })

  app.get('/workbook', async (request, reply) => {
    const path = safeWorkbookPath(request.query.path)
    if (!path) return reply.code(400).send({ error: 'not a workbook path' })
    const raw = await pages.read(path)
    if (raw === undefined) return reply.code(404).send({ error: 'no workbook there' })
    try {
      // Rendu brut, pour que le front convertisse lui-même un 2.0 dormant : le
      // chemin de compatibilité vit à un seul endroit, à côté du moteur qui le
      // lit, plutôt que d'être dupliqué côté serveur.
      return JSON.parse(raw)
    } catch {
      return reply.code(404).send({ error: 'no workbook there' })
    }
  })

  for (const kind of ['state', 'layout']) {
    app.get(`/${kind}`, async (request, reply) => {
      const path = safeWorkbookPath(request.query.wb)
      if (!path) return reply.code(400).send({ error: 'not a workbook path' })
      return readJson(pages, overlayPath(path, kind), kind === 'state' ? { fait: {} } : {})
    })

    app.post(`/${kind}`, async (request, reply) => {
      const body = request.body ?? {}
      const path = safeWorkbookPath(body.wb)
      if (!path) return reply.code(400).send({ error: 'not a workbook path' })

      const file = overlayPath(path, kind)
      const current = await readJson(pages, file, kind === 'state' ? { fait: {} } : {})

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

      await writeJson(pages, file, current)
      return current
    })
  }
}
