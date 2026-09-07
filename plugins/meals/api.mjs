/**
 * The server side of a period: one document, two authors, one revision.
 *
 * Everything is addressed by the PAGE. A request names `sante/septembre.md`,
 * the server reads its frontmatter, and follows the `data:` it declares. Which
 * means the data file is reachable only through a page that claims it — a
 * route taking the JSON path directly would be a way to read and write any
 * `.json` under the memory, and no amount of suffix-checking makes that a
 * boundary. Here the boundary closes itself.
 *
 * The write is optimistic, never locked: a caller states the revision it read
 * and a stale one is refused with the current document attached, so the loser
 * of a race can redo its work instead of asking again. See `ops.mjs` for why
 * a lock would have been the wrong instrument.
 */

import { apply } from './web/ops.js'
import { revisionOf } from './revision.mjs'
import { safePagePath, shapeOf } from './shape.mjs'

/** A period is a handful of cards; anything larger is not one. */
const MAX_BYTES = 2_000_000

/**
 * The page, its shape, and the cards it points at — or the reason there are
 * none.
 *
 * A missing data file is NOT an error: a page framed a minute ago has no cards
 * yet, and the screen it deserves is an empty frise with a live tray, not a
 * diagnostic.
 */
async function readPeriod(pages, page) {
  const markdown = await pages.read(page)
  if (typeof markdown !== 'string') return { status: 404, error: 'no such page' }

  const shape = shapeOf(page, markdown)
  if (!shape) return { status: 422, error: 'this page has no frontmatter' }
  if (shape.type !== 'meals') return { status: 422, error: 'this page is not a period of meals' }
  if (!shape.data) return { status: 422, error: 'its `data:` does not name a .meals.json beside it' }

  const raw = await pages.read(shape.data)
  if (typeof raw !== 'string') return { shape, revision: revisionOf(''), items: [] }
  if (raw.length > MAX_BYTES) return { status: 413, error: 'that data file is too large to read' }
  try {
    const parsed = JSON.parse(raw)
    return {
      shape,
      revision: revisionOf(raw),
      items: Array.isArray(parsed?.items) ? parsed.items : [],
    }
  } catch {
    // Named rather than swallowed: an unreadable file is somebody's data, and
    // silently treating it as empty is how a screen offers to overwrite it.
    return { status: 422, error: 'that data file is not valid JSON' }
  }
}

/** What goes on disk. One key, so the page stays the only place a shape lives. */
const serialise = (items) => JSON.stringify({ version: 1, items }, null, 1)

export default async function api(app, { pages }) {
  app.get('/period', async (request, reply) => {
    const page = safePagePath(request.query?.page)
    if (!page) return reply.code(400).send({ error: 'bad page path' })
    const found = await readPeriod(pages, page)
    if (found.status) return reply.code(found.status).send({ error: found.error })
    const { shape, revision, items } = found
    return { page, data: shape.data, revision, shape, items }
  })

  app.post('/period', async (request, reply) => {
    const page = safePagePath(request.query?.page)
    if (!page) return reply.code(400).send({ error: 'bad page path' })
    const found = await readPeriod(pages, page)
    if (found.status) return reply.code(found.status).send({ error: found.error })
    const { shape, revision, items } = found

    // The revision is required, not merely honoured: a caller that omits it is
    // one that never read the document, and letting it write would be exactly
    // the lost update this whole design refuses.
    if (request.body?.revision !== revision) {
      return reply.code(409).send({
        error: 'the period moved since you read it',
        revision,
        items,
      })
    }

    const result = apply(items, shape, request.body?.op)
    if (result.error) return reply.code(400).send({ error: result.error })

    const text = serialise(result.items)
    await pages.write(shape.data, text)
    return { revision: revisionOf(text), items: result.items }
  })
}
