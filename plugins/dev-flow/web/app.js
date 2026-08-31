/**
 * The dev-flow screen: one look, and you know whose move it is.
 *
 * Three bands, in the order somebody actually needs them. What is FROZEN comes
 * first — the open questions holding chains up, biggest chain at the top — and
 * that placement is the whole product: a structuring question an agent hit
 * three days ago is invisible in a list sorted by anything else, and every lot
 * behind it quietly waits. Then what is yours to specify, then what is in
 * hand. Everything else is one list in the order the graph says to treat it.
 *
 * The screen never writes. Its only outward gesture is `api.compose`, which
 * deposits a sentence in the composer and stops there: the decision is made by
 * a person, and written into a fiche by an agent they asked. A button that
 * sent by itself would be this window growing a pen, and every guarantee in
 * `api.mjs` would be worth nothing.
 */

import { createElement as h, useCallback, useEffect, useState } from 'react'

import {
  draftFor,
  fill,
  ownerWord,
  problemWords,
  sections,
  tileInfo as chipsFor,
  toneOf,
  words,
} from './model.js'

/** `#/dev-flow/<id>` — the hash tail this view owns below its own route. */
const ROUTE = '/dev-flow'
const restOf = (hash) => {
  const path = String(hash ?? '').replace(/^#/, '')
  if (path !== ROUTE && !path.startsWith(`${ROUTE}/`)) return ''
  return decodeURIComponent(path.slice(ROUTE.length + 1))
}

export default function view(api) {
  const t = words(api.locale)
  const url = (path) => `/api/plugin/${api.id}${path}`

  async function load(fresh = false) {
    const response = await api.fetch(url(`/graph${fresh ? '?fresh=1' : ''}`))
    if (!response.ok) throw new Error(`the scan answered ${response.status}`)
    return response.json()
  }

  /** A time, in the instance's language rather than the browser's. */
  const clock = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString(api.locale, { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }
  const day = (iso) => {
    try {
      return new Date(iso).toLocaleDateString(api.locale, { day: 'numeric', month: 'short' })
    } catch {
      return String(iso ?? '')
    }
  }

  const open = (id) => {
    window.location.hash = `#${ROUTE}/${encodeURIComponent(id)}`
  }

  /**
   * A status, in one word and one tone.
   *
   * Carries its own key: it is called inside arrays of children, and a React
   * list without keys is a console full of warnings under every screenshot.
   */
  const Pill = (item) =>
    h(
      'span',
      { key: 's', className: `dev-flow-pill dev-flow-tone-${toneOf(item)}` },
      item.badStatus ? t('faulty status') : t(item.status),
    )

  /** The ids holding an item up, each a way into the fiche that is holding it. */
  function Blockers({ item, byId }) {
    if (!item.blocked) return null
    const roots = item.rootBlockers.length > 0 ? item.rootBlockers : item.blockers
    return h('span', { className: 'dev-flow-blocked' }, [
      h('span', { key: 'w', className: 'dev-flow-blocked-word' }, `${t('blocked by')} `),
      ...roots.map((id, index) =>
        h(
          'button',
          {
            key: id,
            type: 'button',
            className: 'dev-flow-link',
            // A dependency nobody holds has no fiche to open — it is named
            // rather than linked, which is the honest form of "we cannot see
            // this one".
            disabled: !byId.has(id),
            onClick: () => open(id),
            title: byId.get(id)?.title ?? t('unknown item'),
          },
          index === roots.length - 1 ? id : `${id}, `,
        ),
      ),
    ])
  }

  /**
   * One item, as a line in a band.
   *
   * `place` is the item's position IN THIS BAND, not its rank in the whole
   * graph. The two differ as soon as a finished lot sits between two live ones
   * — and a list numbered 2, 4, 5, 8 is a list that looks like it lost rows.
   */
  function Row({ item, byId, place }) {
    return h('li', { className: `dev-flow-row${item.blocked ? ' is-blocked' : ''}` }, [
      place ? h('span', { key: 'n', className: 'dev-flow-rank' }, place) : null,
      h(
        'button',
        { key: 't', type: 'button', className: 'dev-flow-title', onClick: () => open(item.id) },
        item.title,
      ),
      h('span', { key: 'm', className: 'dev-flow-meta' }, [
        h('span', { key: 'r', className: 'dev-flow-repo' }, item.repo.split('/').pop()),
        Pill(item),
        item.owner
          ? h('span', { key: 'o', className: 'dev-flow-owner' }, ownerWord(item, t))
          : null,
        item.priority != null
          ? h('span', { key: 'p', className: 'dev-flow-prio' }, fill(t('priority %n'), item.priority))
          : null,
        item.source.startsWith('branch:')
          ? h(
              'span',
              { key: 'b', className: 'dev-flow-branch' },
              fill(t('on branch %s'), item.source.slice(7)),
            )
          : null,
        h(Blockers, { key: 'x', item, byId }),
      ]),
    ])
  }

  const Band = ({ title, items, byId, numbered = false, empty }) =>
    h('section', { className: 'dev-flow-band' }, [
      h('h3', { key: 'h', className: 'dev-flow-band-title' }, title),
      items.length === 0
        ? h('p', { key: 'e', className: 'dev-flow-muted' }, empty ?? '—')
        : h(
            'ul',
            { key: 'l', className: 'dev-flow-list' },
            items.map((item, index) =>
              h(Row, { key: item.id, item, byId, place: numbered ? index + 1 : 0 }),
            ),
          ),
    ])

  /**
   * The alarm band: what a decision would unfreeze.
   *
   * Drawn as cards rather than as one more list because it is the one thing
   * this screen exists to make impossible to miss, and because the number
   * beside each — how many lots are waiting behind it — is the argument for
   * dealing with that one first.
   */
  function Frozen({ items, byId }) {
    if (items.length === 0) return null
    return h('section', { className: 'dev-flow-frozen' }, [
      h('h3', { key: 'h', className: 'dev-flow-band-title' }, t('to decide first')),
      h(
        'div',
        { key: 'c', className: 'dev-flow-cards' },
        items.map((item) =>
          h('article', { key: item.id, className: 'dev-flow-card' }, [
            h(
              'button',
              { key: 't', type: 'button', className: 'dev-flow-card-title', onClick: () => open(item.id) },
              item.title,
            ),
            h('p', { key: 'n', className: 'dev-flow-card-count' }, fill(t('freezes %n'), item.blocks)),
            h(
              'ul',
              { key: 'd', className: 'dev-flow-card-downstream' },
              downstreamOf(item, byId).map((held) =>
                h('li', { key: held.id }, [
                  h(
                    'button',
                    { key: 'b', type: 'button', className: 'dev-flow-link', onClick: () => open(held.id) },
                    held.title,
                  ),
                ]),
              ),
            ),
            h(
              'button',
              {
                key: 'a',
                type: 'button',
                className: 'dev-flow-action',
                onClick: () => api.compose(draftFor(item, t)),
              },
              t('Draft a decision'),
            ),
          ]),
        ),
      ),
    ])
  }

  /** Everything waiting, directly or not, on this one. */
  const downstreamOf = (item, byId) =>
    [...byId.values()].filter(
      (candidate) => !candidate.finished && candidate.rootBlockers.includes(item.id),
    )

  /**
   * What the scan could not read, said out loud.
   *
   * A repository that is not there, a branch that has gone, a fiche whose
   * frontmatter will not parse: each degrades to a line here rather than to a
   * missing row nobody notices. `info` problems — a merged branch's name still
   * sitting in a fiche — are folded away; they are normal.
   */
  function Problems({ problems }) {
    const [shown, setShown] = useState(false)
    if (problems.length === 0) return null
    const loud = problems.filter((problem) => problem.severity !== 'info')
    return h('div', { className: `dev-flow-problems${loud.length > 0 ? ' is-loud' : ''}` }, [
      h(
        'button',
        { key: 'b', type: 'button', className: 'dev-flow-problems-toggle', onClick: () => setShown(!shown) },
        `${t('what the scan could not read')} (${problems.length})`,
      ),
      shown
        ? h(
            'ul',
            { key: 'l', className: 'dev-flow-problems-list' },
            problems.map((problem, index) =>
              h('li', { key: `${problem.code}-${index}` }, problemWords(problem, t)),
            ),
          )
        : null,
    ])
  }

  /**
   * One fiche in full: its facts, its prose, its history.
   *
   * No back button of its own. This view publishes a crumb, which makes the
   * shell's "Lots" a link to the hub — and the shell already draws a way out
   * of the app above that. A third one would be furniture, and the doctrine
   * about never drawing your own breadcrumb is the same rule seen earlier.
   */
  function Detail({ id, graph }) {
    const [detail, setDetail] = useState(null)
    const [error, setError] = useState(null)

    useEffect(() => {
      let cancelled = false
      setDetail(null)
      setError(null)
      void (async () => {
        try {
          const response = await api.fetch(url(`/item?id=${encodeURIComponent(id)}`))
          if (!response.ok) throw new Error(t('unknown item'))
          const payload = await response.json()
          if (!cancelled) setDetail(payload)
        } catch (cause) {
          if (!cancelled) setError(cause.message)
        }
      })()
      return () => {
        cancelled = true
      }
    }, [id])

    const byId = new Map((graph.items ?? []).map((item) => [item.id, item]))

    useEffect(() => {
      api.trail([{ label: detail?.item.title ?? id, route: `${ROUTE}/${encodeURIComponent(id)}` }])
    }, [id, detail?.item.title])

    if (error) return h('p', { className: 'dev-flow-problem' }, error)
    if (!detail) return h('p', { className: 'dev-flow-muted' }, '…')

    const { item, body, timeline } = detail
    const held = downstreamOf(item, byId)

    return h('article', { className: 'dev-flow-detail' }, [
      h('h2', { key: 'h', className: 'dev-flow-detail-title' }, item.title),
      h('p', { key: 'f', className: 'dev-flow-facts' }, [
        h('span', { key: 'i', className: 'dev-flow-id' }, item.id),
        h('span', { key: 'r', className: 'dev-flow-repo' }, item.repo.split('/').pop()),
        h('span', { key: 'y', className: 'dev-flow-kind' }, t(item.type)),
        Pill(item),
        item.owner ? h('span', { key: 'o', className: 'dev-flow-owner' }, ownerWord(item, t)) : null,
        item.priority != null
          ? h('span', { key: 'p', className: 'dev-flow-prio' }, fill(t('priority %n'), item.priority))
          : null,
        item.updated ? h('span', { key: 'u', className: 'dev-flow-muted' }, fill(t('updated %s'), item.updated)) : null,
        item.spec ? h('span', { key: 's', className: 'dev-flow-muted' }, `${t('spec:')} ${item.spec}`) : null,
        h(
          'span',
          { key: 'w', className: 'dev-flow-muted' },
          fill(t('read from %s'), item.source.startsWith('branch:') ? item.source.slice(7) : 'main'),
        ),
      ]),

      item.blocked
        ? h('p', { key: 'x', className: 'dev-flow-detail-blocked' }, h(Blockers, { item, byId }))
        : h('p', { key: 'x', className: 'dev-flow-detail-ready' }, item.finished ? '' : t('ready to go')),

      held.length > 0
        ? h('p', { key: 'd', className: 'dev-flow-detail-holds' }, [
            `${t('holds up')} `,
            ...held.map((other, index) =>
              h(
                'button',
                { key: other.id, type: 'button', className: 'dev-flow-link', onClick: () => open(other.id) },
                index === held.length - 1 ? other.title : `${other.title}, `,
              ),
            ),
          ])
        : null,

      // Verbatim. The fiche's body is prose an agent or a person wrote —
      // reports, decisions, notes — and a second markdown engine living in a
      // plugin is how one product starts disagreeing with itself about what a
      // document looks like. The shell's own editor is not an option either:
      // these files are in another repository, not in the workspace.
      body.trim() === ''
        ? null
        : h('pre', { key: 'p', className: 'dev-flow-body' }, body.trim()),

      h('section', { key: 'l', className: 'dev-flow-timeline' }, [
        h('h3', { key: 'h', className: 'dev-flow-band-title' }, t('history')),
        timeline.length === 0
          ? h('p', { key: 'e', className: 'dev-flow-muted' }, t('no history for this fiche'))
          : h(
              'ul',
              { key: 'u', className: 'dev-flow-list' },
              timeline.map((entry) =>
                h('li', { key: entry.sha, className: 'dev-flow-commit' }, [
                  h('span', { key: 'd', className: 'dev-flow-commit-date' }, day(entry.date)),
                  h('span', { key: 's', className: 'dev-flow-commit-subject' }, entry.subject),
                  h('span', { key: 'a', className: 'dev-flow-muted' }, entry.author),
                ]),
              ),
            ),
      ]),

      h(
        'button',
        {
          key: 'a',
          type: 'button',
          className: 'dev-flow-action',
          onClick: () => api.compose(draftFor(item, t)),
        },
        item.type === 'question' ? t('Draft a decision') : t('Ask about this lot'),
      ),
    ])
  }

  function Lots() {
    const [graph, setGraph] = useState(null)
    const [error, setError] = useState(null)
    const [hash, setHash] = useState(() => window.location.hash)

    const reload = useCallback(async (fresh) => {
      try {
        setGraph(await load(fresh))
        setError(null)
      } catch (cause) {
        setError(cause.message)
      }
    }, [])

    useEffect(() => {
      void reload(false)
    }, [reload])

    useEffect(() => {
      const apply = () => setHash(window.location.hash)
      window.addEventListener('hashchange', apply)
      return () => window.removeEventListener('hashchange', apply)
    }, [])

    const openId = restOf(hash)
    // The trail is cleared on every navigation, so the hub must SAY it has
    // nothing to add rather than leave the last fiche's name under the tile.
    useEffect(() => {
      if (openId === '') api.trail([])
    }, [openId])

    if (error && !graph) return h('p', { className: 'dev-flow-problem' }, error)
    if (!graph) return h('p', { className: 'dev-flow-muted' }, '…')

    if (!graph.configured) {
      return h('section', { className: 'dev-flow' }, [
        h('h2', { key: 'h' }, t('no repository is configured')),
        h('p', { key: 'p' }, t('Name the repositories to scan in the instance configuration:')),
        h(
          'pre',
          { key: 'c', className: 'dev-flow-body' },
          'secrets:\n  DEV_FLOW_REPOS: /repos/tessera:/repos/ostia',
        ),
      ])
    }

    const items = graph.items ?? []
    const byId = new Map(items.map((item) => [item.id, item]))
    const bands = sections(items)

    if (openId !== '') {
      return h('section', { className: 'dev-flow' }, [
        h(Detail, { key: openId, id: openId, graph }),
      ])
    }

    return h('section', { className: 'dev-flow' }, [
      h('header', { key: 'h', className: 'dev-flow-head' }, [
        h(
          'p',
          { key: 'r', className: 'dev-flow-muted' },
          `${graph.repos
            .map((repo) => `${repo.kind === 'forge' ? '⌁' : '▪'} ${repo.name} (${repo.items})`)
            .join(' · ')} — ${fill(
            t('read at %s'),
            clock(graph.scannedAt),
          )}`,
        ),
        h(
          'button',
          { key: 'b', type: 'button', className: 'dev-flow-action', onClick: () => void reload(true) },
          t('refresh'),
        ),
      ]),
      h(Problems, { key: 'p', problems: graph.problems ?? [] }),
      items.length === 0
        ? h('p', { key: 'e', className: 'dev-flow-muted' }, t('Every scanned repository came back empty.'))
        : null,
      h(Frozen, { key: 'f', items: bands.frozen, byId }),
      h(Band, {
        key: 'm',
        title: t('yours to specify'),
        items: bands.mine,
        byId,
      }),
      h(Band, { key: 'u', title: t('under way'), items: bands.underway, byId }),
      h(Band, {
        key: 'a',
        title: t('everything, in order'),
        items: bands.live,
        byId,
        numbered: true,
      }),
      bands.finished.length > 0
        ? h('details', { key: 'd', className: 'dev-flow-done' }, [
            h(
              'summary',
              { key: 's' },
              `${t('finished')} (${bands.finished.length})`,
            ),
            h(
              'ul',
              { key: 'l', className: 'dev-flow-list' },
              bands.finished.map((item) => h(Row, { key: item.id, item, byId })),
            ),
          ])
        : null,
    ])
  }

  /** The tile's own figures, from the same scan the screen reads. */
  async function tileInfo() {
    try {
      return chipsFor(await load(false), t)
    } catch {
      // A count is worth nothing next to a launcher that failed to draw.
      return undefined
    }
  }

  // A route owns its descendants, so `#/dev-flow/<id>` reaches one fiche and a
  // bookmark to it survives a reload.
  return { component: Lots, route: ROUTE, tileInfo }
}
