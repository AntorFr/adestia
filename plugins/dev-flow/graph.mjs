/**
 * The lot graph: what a folder of fiches MEANS, once merged.
 *
 * Everything here is a derivation, and derivations are the whole reason this
 * module exists as its own file: the scanned repositories declare state
 * (`status`, `depends_on`, `priority`) and nothing else. Who has the hand,
 * what is blocked, what a decision would unfreeze, what to look at first —
 * none of that is a field anybody writes, and the moment one of them became a
 * field it would start disagreeing with the status beside it.
 *
 * So: pure functions, no filesystem, no git, no React. What comes in is a list
 * of fiches as they were read; what comes out is the graph a screen draws.
 * Tested without a repository, which is what lets the reading rule next door
 * be tested without the derivations.
 */

/** A lot's life, in order. `done` is the only end. */
export const LOT_STATUSES = ['idea', 'design', 'code', 'integrate', 'done']
/** A question's life. `decided` is the only end. */
export const QUESTION_STATUSES = ['open', 'decided']

/**
 * Who is expected to act, from the status alone.
 *
 * The mapping the scanned READMEs publish, transcribed rather than imported —
 * a plugin cannot read a file in a repository it has not scanned yet, and the
 * table is small and closed. `null` means nobody: the item's life is over.
 */
const OWNERS = {
  lot: { idea: 'monsieur', design: 'monsieur', code: 'coder', integrate: 'integrateur', done: null },
  question: { open: 'monsieur', decided: null },
}

/** An item whose life is over stops blocking whatever waited on it. */
export function isFinished(item) {
  return item.type === 'lot' ? item.status === 'done' : item.status === 'decided'
}

/**
 * Who has the hand — or `null` for a finished item, `undefined` for a status
 * outside its type's vocabulary.
 *
 * The two absences are different and stay different: a `done` lot is nobody's
 * business any more, while a lot whose status is a typo is somebody's business
 * urgently, and the screen must not draw them the same way.
 */
export function ownerOf(item) {
  const table = OWNERS[item.type]
  if (!table) return undefined
  return item.status in table ? table[item.status] : undefined
}

/** `priority` sorts ascending; a fiche that declares none sorts after those that do. */
const rankKey = (item) => [item.priority ?? Number.POSITIVE_INFINITY, item.id]

const byRank = (a, b) => {
  const [pa, ia] = rankKey(a)
  const [pb, ib] = rankKey(b)
  return pa - pb || ia.localeCompare(ib)
}

/**
 * The whole graph, derived.
 *
 * @param items fiches as read — `{ id, repo, type, title, status, priority,
 *   dependsOn, spec, branch, updated, source }`.
 * @returns `{ items, order, problems }` where every item carries its
 *   derivations and `order` is the ids in the order they should be treated.
 */
export function buildGraph(items) {
  const problems = []
  const byId = new Map()

  for (const item of items) {
    if (byId.has(item.id)) {
      // Ids are unique across the GALAXY by contract — prefixed by the repo
      // precisely so two repositories can be merged. A collision means two
      // fiches claim one identity, and picking a winner silently would make
      // the graph depend on the order the folders were read in.
      problems.push({
        code: 'duplicate-id',
        id: item.id,
        repos: [byId.get(item.id).repo, item.repo],
        message: `two fiches claim the id ${item.id}`,
      })
      continue
    }
    byId.set(item.id, item)
  }

  const derived = new Map()
  for (const item of byId.values()) {
    const finished = isFinished(item)
    const owner = ownerOf(item)
    if (owner === undefined) {
      problems.push({
        code: 'bad-status',
        id: item.id,
        repo: item.repo,
        message: `${item.id} is a ${item.type} with status "${item.status}", which that type does not have`,
      })
    }

    const unknownDeps = item.dependsOn.filter((dep) => !byId.has(dep))
    for (const dep of unknownDeps) {
      // A dependency nobody can see is not a dependency that is satisfied.
      // Reported AND treated as blocking: a repository left out of the scan
      // must not make the chain that waits on it look ready to go.
      problems.push({
        code: 'unknown-dep',
        id: item.id,
        repo: item.repo,
        dep,
        message: `${item.id} depends on ${dep}, which no scanned repository holds`,
      })
    }

    derived.set(item.id, {
      ...item,
      finished,
      // A bad status is nobody's *known* business; it is reported above and
      // drawn as a fault rather than filed under a person who is not on the hook.
      owner: owner ?? null,
      badStatus: owner === undefined,
      unknownDeps,
      blockers: [],
      blocked: false,
      actionable: false,
      rootBlockers: [],
      blocks: 0,
      rank: 0,
      cycle: false,
    })
  }

  // Direct blockers: a dependency that has not reached its end, plus every
  // dependency nobody can see.
  for (const item of derived.values()) {
    item.blockers = item.dependsOn.filter((dep) => {
      const target = derived.get(dep)
      return target ? !target.finished : true
    })
    item.blocked = item.blockers.length > 0
    item.actionable = !item.finished && !item.blocked
  }

  // The ROOT of a blockage, which is the thing worth putting on a screen. A
  // lot waiting on a lot waiting on an open question is not blocked by "the
  // lot in front of it" in any useful sense — it is blocked by the question,
  // and that is the line somebody can actually act on.
  for (const item of derived.values()) {
    item.rootBlockers = rootsOf(item, derived)
  }

  // How much a single item is holding up. The count that turns "an open
  // question" into "an open question freezing four lots".
  for (const item of derived.values()) {
    if (item.finished) continue
    for (const downstream of derived.values()) {
      if (downstream.id !== item.id && downstream.rootBlockers.includes(item.id)) item.blocks += 1
    }
  }

  const { order, cycles } = topologicalOrder(derived)
  for (const id of cycles) {
    derived.get(id).cycle = true
  }
  if (cycles.length > 0) {
    problems.push({
      code: 'cycle',
      ids: cycles,
      message: `these fiches depend on each other in a circle: ${cycles.join(', ')}`,
    })
  }
  for (const [index, id] of order.entries()) derived.get(id).rank = index

  return { items: order.map((id) => derived.get(id)), order, problems }
}

/**
 * The unfinished items at the FAR END of what this one waits on.
 *
 * Depth-first through the dependencies, keeping only those that are themselves
 * waiting on nothing — plus any id nobody can resolve, which is a root in the
 * only sense that matters here: no one can look further.
 */
function rootsOf(item, derived, seen = new Set()) {
  const roots = new Set()
  for (const dep of item.blockers) {
    if (seen.has(dep)) continue
    seen.add(dep)
    const target = derived.get(dep)
    if (!target) {
      roots.add(dep)
      continue
    }
    if (target.blockers.length === 0) roots.add(dep)
    else for (const deeper of rootsOf(target, derived, seen)) roots.add(deeper)
  }
  return [...roots].sort()
}

/**
 * Kahn's algorithm, settling ties by priority then by id.
 *
 * Ties are the interesting half: a topological sort of a graph this sparse has
 * thousands of valid answers, and an order that shuffles between two reads is
 * an order nobody can follow. So the ready set is drained in the contract's
 * own tie-break — `priority` ascending, then id — which makes the answer
 * deterministic and, more to the point, the one Monsieur declared.
 *
 * Only UNFINISHED dependencies gate the sort. A lot whose only dependency is
 * done is ready now, and letting the done one hold its slot would push a
 * priority-1 chantier behind a priority-3 one for no reason a reader could
 * ever guess. A dependency nobody holds does not gate it either: it already
 * blocks the item loudly, and gating the ORDER too would drop the item off the
 * list entirely — the one outcome worse than showing it in the wrong place.
 */
function topologicalOrder(derived) {
  const waiting = new Map()
  const dependents = new Map()

  for (const item of derived.values()) {
    const known = item.dependsOn.filter((dep) => derived.has(dep) && !derived.get(dep).finished)
    waiting.set(item.id, known.length)
    for (const dep of known) {
      if (!dependents.has(dep)) dependents.set(dep, [])
      dependents.get(dep).push(item.id)
    }
  }

  const ready = [...derived.values()].filter((item) => waiting.get(item.id) === 0).sort(byRank)
  const order = []

  while (ready.length > 0) {
    const item = ready.shift()
    order.push(item.id)
    for (const id of dependents.get(item.id) ?? []) {
      waiting.set(id, waiting.get(id) - 1)
      if (waiting.get(id) === 0) {
        ready.push(derived.get(id))
        ready.sort(byRank)
      }
    }
  }

  // Whatever the sort could not reach is in a circle. Appended rather than
  // dropped, in the same tie-break, and flagged: a fiche that vanishes from a
  // list because two fiches point at each other is a bug reported as an
  // absence, which is the hardest kind to see.
  const cycles = [...derived.values()]
    .filter((item) => !order.includes(item.id))
    .sort(byRank)
    .map((item) => item.id)

  return { order: [...order, ...cycles], cycles }
}
