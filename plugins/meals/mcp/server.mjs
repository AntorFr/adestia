/* ── A period, at the agent's reach ───────────────────────────────────────────
   TWO tools, not ten. Every declared tool costs context on EVERY turn, so the
   set is the smallest one that closes the loop: read a period, write to it.
   Framing a period is deliberately NOT here — it is writing a markdown page,
   which the agent does all day with its own tools, and a tool for it would be
   a worse copy of something that already works.

   WHY THIS EXISTS AT ALL, since the agent can open the JSON itself: because it
   must not. The file has two authors now, and the only thing keeping one from
   silently erasing the other is that every write states the revision it read.
   A file tool cannot state one. So this is the agent's half of the same
   bargain the screen keeps.

   JSON-RPC on stdio, written out rather than pulled from an SDK: four methods,
   no transport negotiation, one less dependency for a plugin that has none.
   The same choice the atelier made, for the same reason.

   An error comes back as `isError` with its text, never as a JSON-RPC error:
   what the model reads is the content. A protocol error lands in a log nobody
   looks at during a turn. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

import { apply } from '../web/ops.js'
import { revisionOf } from '../revision.mjs'
import { safePagePath, shapeOf } from '../shape.mjs'

/** The agent runs in the workspace; a path is spelled the way the memory spells it. */
const onDisk = (path) => (isAbsolute(path) ? path : resolve(process.cwd(), path))

const readOr = (path, fallback) => {
  try {
    return readFileSync(onDisk(path), 'utf8')
  } catch {
    return fallback
  }
}

/** The page, its shape, and the cards it points at. */
function period(pageArg) {
  const page = safePagePath(pageArg)
  if (!page) throw new Error('`page` must be a .md path inside the memory')
  const markdown = readOr(page, undefined)
  if (markdown === undefined) throw new Error(`no page at ${page}`)

  const shape = shapeOf(page, markdown)
  if (!shape) throw new Error(`${page} has no frontmatter`)
  if (shape.type !== 'meals') throw new Error(`${page} is not \`type: meals\``)
  if (!shape.data) throw new Error(`${page} declares a \`data:\` that is not a .meals.json beside it`)

  const raw = readOr(shape.data, undefined)
  if (raw === undefined) return { page, shape, revision: revisionOf(''), items: [] }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${shape.data} is not valid JSON — fix it by hand, I will not overwrite it`)
  }
  return {
    page,
    shape,
    revision: revisionOf(raw),
    items: Array.isArray(parsed?.items) ? parsed.items : [],
  }
}

/** What the agent reads: the shape it must respect, then the cards. */
function render({ shape, revision, items }) {
  const placed = items.filter((item) => item.jour && item.statut !== 'ecartee')
  const tray = items.filter((item) => !item.jour && item.statut !== 'ecartee')
  const aside = items.filter((item) => item.statut === 'ecartee')

  const card = (item) =>
    `  ${item.id}  ${item.titre}${item.quantite ? ` (${item.quantite})` : ''}` +
    `${item.jour ? ` — ${item.jour} ${item.section ?? ''}` : ''}` +
    `${item.props ? `\n      ${Object.entries(item.props).map(([k, v]) => `${k}: ${v}`).join(', ')}` : ''}`

  return [
    `${shape.titre ?? shape.page}`,
    shape.debut && shape.fin ? `${shape.debut} → ${shape.fin}` : 'no dates yet — the tray is all there is',
    `sections: ${shape.sections.join(', ')}`,
    `data: ${shape.data}`,
    `revision: ${revision}`,
    '',
    `placed (${placed.length}):`,
    ...placed.map(card),
    '',
    `tray (${tray.length}):`,
    ...tray.map(card),
    ...(aside.length > 0 ? ['', `set aside (${aside.length}):`, ...aside.map(card)] : []),
  ].join('\n')
}

const TOOLS = [
  {
    name: 'meals_read',
    description:
      'Read a period of meals: the shape its page declares, every card, and the REVISION. ' +
      'Always read before writing — the revision is what proves you are not about to erase ' +
      'a card somebody just dragged. Never open the .meals.json with a file tool instead.',
    inputSchema: {
      type: 'object',
      properties: { page: { type: 'string', description: 'the `type: meals` page, e.g. sante/septembre.md' } },
      required: ['page'],
    },
    run: (args) => ({ ok: true, text: render(period(args.page)) }),
  },
  {
    name: 'meals_write',
    description:
      'Apply operations to a period, all or nothing, quoting the revision you read. ' +
      'Operations: {op:"add",item:{id,titre,ico?,quantite?,hint?,desc?,props?,source?}}, ' +
      '{op:"place",id,jour,section?,ordre?}, {op:"tray",id}, {op:"dismiss",id}, ' +
      '{op:"set",id,fields:{…}}, {op:"remove",id}. ' +
      'A stale revision is refused and nothing is written: read again and redo.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'string', description: 'the `type: meals` page' },
        revision: { type: 'string', description: 'the revision meals_read gave you' },
        ops: { type: 'array', description: 'the operations, applied in order', items: { type: 'object' } },
      },
      required: ['page', 'revision', 'ops'],
    },
    run: (args) => {
      const state = period(args.page)
      // Refused BEFORE anything is applied: a batch that half-lands is worse
      // than one that does not land, because nobody can tell which half.
      if (args.revision !== state.revision) {
        return {
          ok: false,
          error:
            `the period moved since you read it (now ${state.revision}). ` +
            'Nothing was written. Read it again and redo your operations.',
        }
      }
      const ops = Array.isArray(args.ops) ? args.ops : []
      if (ops.length === 0) return { ok: false, error: '`ops` was empty' }

      let items = state.items
      for (const [index, op] of ops.entries()) {
        const result = apply(items, state.shape, op)
        if (result.error) {
          return { ok: false, error: `operation ${index + 1} (${op?.op}): ${result.error}. Nothing was written.` }
        }
        items = result.items
      }

      const text = `${JSON.stringify({ version: 1, items }, null, 1)}\n`
      const file = onDisk(state.shape.data)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, text)
      return { ok: true, text: `${ops.length} applied.\n\n${render({ ...state, items, revision: revisionOf(text) })}` }
    },
  },
]

/* ── The transport ────────────────────────────────────────────────────────── */

const byName = new Map(TOOLS.map((tool) => [tool.name, tool]))
const write = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
const answer = (id, result) => {
  if (id !== undefined) write({ jsonrpc: '2.0', id, result })
}

function handle(message) {
  switch (message.method) {
    case 'initialize':
      return answer(message.id, {
        protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'meals', version: '1' },
      })
    case 'notifications/initialized':
      return undefined
    case 'tools/list':
      return answer(message.id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      })
    case 'tools/call': {
      const tool = byName.get(message.params?.name)
      if (!tool) {
        return answer(message.id, {
          content: [{ type: 'text', text: `unknown tool "${message.params?.name}"` }],
          isError: true,
        })
      }
      let outcome
      try {
        outcome = tool.run(message.params?.arguments ?? {})
      } catch (error) {
        outcome = { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
      return answer(message.id, {
        content: [{ type: 'text', text: outcome.ok ? outcome.text : outcome.error }],
        ...(outcome.ok ? {} : { isError: true }),
      })
    }
    default:
      // `ping` and the rest: answer rather than stall a handshake on a method
      // a tool server has no use for.
      if (message.id !== undefined) answer(message.id, {})
      return undefined
  }
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let cut = buffer.indexOf('\n')
  while (cut !== -1) {
    const line = buffer.slice(0, cut).trim()
    buffer = buffer.slice(cut + 1)
    if (line !== '') {
      try {
        handle(JSON.parse(line))
      } catch {
        // A malformed line is not worth killing a server the agent is using.
      }
    }
    cut = buffer.indexOf('\n')
  }
})
