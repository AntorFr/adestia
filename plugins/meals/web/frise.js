/**
 * The frise — one screen, mounted twice.
 *
 * The block draws it inside a page and the standalone route draws it alone,
 * and they must be the SAME screen: a week of meals read from a trip's fiche
 * and the same week opened from a bookmark that disagreed about anything would
 * be two products. So both entry points mount this component and differ only
 * in where they get the file from.
 *
 * Written with React rather than ported from the trips engine. That engine
 * paints with `innerHTML` and rebuilds its whole subtree on every gesture,
 * which is defensible for a full-page app that owns its canvas and wrong for a
 * block sitting inside a page React is already rendering. What is reused is
 * the part that was actually hard — the fractional drop rank, the drag back to
 * the tray, the overlay frontier — and those are rules, not lines of code.
 */

import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { dayLabel, dropRank, layout, words } from './model.js'

/** Where a card dropped at height `y` belongs among the cards already there. */
function indexAt(zone, y, draggedId) {
  const cards = [...zone.querySelectorAll('[data-card]')].filter(
    (node) => node.dataset.card !== draggedId,
  )
  for (const [index, node] of cards.entries()) {
    const box = node.getBoundingClientRect()
    if (y < box.top + box.height / 2) return index
  }
  return cards.length
}

/**
 * The overlay, and the one way it is written.
 *
 * Every gesture goes through here so the optimistic update and the request can
 * never disagree about what was asked. A refused write rolls the screen back
 * rather than leaving a card where the file does not have it — a card that
 * moved on screen and nowhere else is the failure nobody notices until the
 * shopping list is short.
 */
function useOverlay(api, path) {
  const [overlay, setOverlay] = useState({ items: {} })
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setOverlay({ items: {} })
    if (!path) return undefined
    void (async () => {
      try {
        const response = await api.fetch(
          `/api/plugin/${api.id}/state?f=${encodeURIComponent(path)}`,
        )
        if (!response.ok || !alive) return
        const body = await response.json()
        if (alive) setOverlay({ items: body?.items ?? {} })
      } catch {
        // No overlay is a legitimate reading of a period nobody has touched.
      }
    })()
    return () => {
      alive = false
    }
  }, [api, path])

  const gesture = useCallback(
    async (id, fields) => {
      const previous = overlay
      const next = { items: { ...overlay.items, [id]: { ...overlay.items[id], ...fields } } }
      setOverlay(next)
      setFailed(false)
      try {
        const response = await api.fetch(
          `/api/plugin/${api.id}/state?f=${encodeURIComponent(path)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id, ...fields }),
          },
        )
        if (!response.ok) throw new Error(String(response.status))
      } catch {
        setOverlay(previous)
        setFailed(true)
      }
    },
    [api, overlay, path],
  )

  return { overlay, gesture, failed }
}

/** The card as everybody sees it: quiet on its face, and everything else a click away. */
function Card({ item, t, onOpen, onDrag, onDismiss, tray }) {
  return h(
    'div',
    {
      className: `meals-card${tray ? ' is-tray' : ''}`,
      'data-card': item.id,
      draggable: true,
      title: t('Click for the detail · Drag to move'),
      onDragStart: (event) => onDrag(event, item),
      onClick: () => onOpen(item),
    },
    [
      item.ico ? h('span', { key: 'i', className: 'meals-ico' }, item.ico) : null,
      h('div', { key: 'b', className: 'meals-body' }, [
        h('div', { key: 't', className: 'meals-title' }, item.titre || item.id),
        item.quantite ? h('div', { key: 'q', className: 'meals-qty' }, item.quantite) : null,
        tray && item.hint ? h('div', { key: 'h', className: 'meals-hint' }, item.hint) : null,
      ]),
      tray
        ? h(
            'button',
            {
              key: 'x',
              type: 'button',
              className: 'meals-dismiss',
              title: t('Set this one aside'),
              onClick: (event) => {
                event.stopPropagation()
                onDismiss(item)
              },
            },
            '✕',
          )
        : null,
    ],
  )
}

/** The detail nobody sees until they ask for it. */
function Detail({ item, t, onClose }) {
  const entries = Object.entries(item.props ?? {}).filter(
    ([key]) => typeof key === 'string' && key !== '',
  )
  return h(
    'div',
    { className: 'meals-modal', onClick: onClose },
    h('div', { className: 'meals-sheet', onClick: (event) => event.stopPropagation() }, [
      h('header', { key: 'h', className: 'meals-sheet-head' }, [
        item.ico ? h('span', { key: 'i', className: 'meals-ico' }, item.ico) : null,
        h('h3', { key: 't' }, item.titre || item.id),
        item.quantite ? h('span', { key: 'q', className: 'meals-qty' }, item.quantite) : null,
      ]),
      item.desc || item.hint
        ? h('p', { key: 'd', className: 'meals-desc' }, item.desc || item.hint)
        : null,
      entries.length > 0
        ? h(
            'dl',
            { key: 'p', className: 'meals-props' },
            entries.flatMap(([key, value]) => [
              h('dt', { key: `k${key}` }, key),
              h('dd', { key: `v${key}` }, String(value ?? '')),
            ]),
          )
        : null,
      item.source ? h('p', { key: 's', className: 'meals-source' }, item.source) : null,
      h(
        'button',
        { key: 'c', type: 'button', className: 'meals-close', onClick: onClose },
        t('Close'),
      ),
    ]),
  )
}

/**
 * The screen.
 *
 * `src` is where the file is READ from (a URL), `path` is what it is CALLED in
 * the workspace (what the state API is asked about). They are different
 * strings for the same file and both are needed: a block resolves the first
 * from the page it sits in, and only the second means anything to a server.
 */
export default function Frise({ api, src, path }) {
  const t = useMemo(() => words(api.locale), [api.locale])
  const [plan, setPlan] = useState()
  const [error, setError] = useState(false)
  const [open, setOpen] = useState()
  const dragged = useRef(null)
  const { overlay, gesture, failed } = useOverlay(api, path)

  useEffect(() => {
    let alive = true
    setPlan(undefined)
    setError(false)
    if (!src) return undefined
    void (async () => {
      try {
        const response = await api.fetch(src)
        if (!response.ok) throw new Error(String(response.status))
        const body = await response.json()
        if (alive) setPlan(body)
      } catch {
        if (alive) setError(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [api, src])

  const view = useMemo(() => layout(plan, overlay), [plan, overlay])

  const onDrag = useCallback((event, item) => {
    dragged.current = item.id
    event.dataTransfer.effectAllowed = 'move'
    // Written even though it is never read back: a drag with an empty payload
    // is cancelled outright by some browsers before any drop handler runs.
    event.dataTransfer.setData('text/plain', item.id)
  }, [])

  const dropInto = useCallback(
    (event, jour, section, cards) => {
      event.preventDefault()
      const id = dragged.current
      dragged.current = null
      if (!id) return
      const ordre = dropRank(cards, indexAt(event.currentTarget, event.clientY, id))
      void gesture(id, { statut: 'confirme', jour, section, ordre })
    },
    [gesture],
  )

  const dropToTray = useCallback(
    (event) => {
      event.preventDefault()
      const id = dragged.current
      dragged.current = null
      if (!id) return
      void gesture(id, { statut: 'suggestion', jour: null, section: null, ordre: null })
    },
    [gesture],
  )

  if (error) return h('p', { className: 'meals-empty' }, t('This period cannot be read.'))
  if (!plan) return h('p', { className: 'meals-empty' }, t('loading…'))

  const allow = (event) => event.preventDefault()

  const frise = view.dated
    ? view.days.map((day) =>
        h('section', { key: day.date, className: 'meals-day' }, [
          h('h3', { key: 'h', className: 'meals-day-head' }, dayLabel(day.date, api.locale)),
          ...day.groups.map((group) =>
            h('div', { key: group.name, className: `meals-sec${group.known ? '' : ' is-extra'}` }, [
              h('span', { key: 'n', className: 'meals-sec-name' }, group.name),
              h(
                'div',
                {
                  key: 'z',
                  className: 'meals-zone',
                  onDragOver: allow,
                  onDrop: (event) => dropInto(event, day.date, group.name, group.cards),
                },
                group.cards.length > 0
                  ? group.cards.map((item) =>
                      h(Card, { key: item.id, item, t, onOpen: setOpen, onDrag, onDismiss: () => {} }),
                    )
                  : h('span', { className: 'meals-drop' }, t('Drop a card here')),
              ),
            ]),
          ),
        ]),
      )
    : h('p', { className: 'meals-empty' }, t('An idea for now — the tray is live, the timeline waits for dates.'))

  return h('div', { className: 'meals' }, [
    h('header', { key: 'h', className: 'meals-head' }, [
      h('h2', { key: 't' }, plan.titre || t('Ideas')),
      view.dated
        ? h(
            'span',
            { key: 'p', className: 'meals-period' },
            `${dayLabel(plan.debut, api.locale)} → ${dayLabel(plan.fin, api.locale)}`,
          )
        : null,
    ]),
    failed ? h('p', { key: 'f', className: 'meals-failed' }, '⚠') : null,
    h('div', { key: 's', className: 'meals-split' }, [
      h('div', { key: 'f', className: 'meals-frise' }, [
        frise,
        view.strays.length > 0
          ? h('section', { key: 'x', className: 'meals-day is-stray' }, [
              h('h3', { key: 'h', className: 'meals-day-head' }, t('Out of the period')),
              h(
                'div',
                { key: 'z', className: 'meals-zone' },
                view.strays.map((item) =>
                  h(Card, { key: item.id, item, t, onOpen: setOpen, onDrag, onDismiss: () => {} }),
                ),
              ),
            ])
          : null,
      ]),
      h(
        'aside',
        {
          key: 'y',
          className: 'meals-tray',
          onDragOver: allow,
          onDrop: dropToTray,
        },
        [
          h('h3', { key: 'h', className: 'meals-tray-head' }, t('Ideas')),
          view.tray.length > 0
            ? view.tray.map((item) =>
                h(Card, {
                  key: item.id,
                  item,
                  t,
                  tray: true,
                  onOpen: setOpen,
                  onDrag,
                  onDismiss: (card) => void gesture(card.id, { statut: 'ecartee' }),
                }),
              )
            : h(
                'p',
                { key: 'e', className: 'meals-empty' },
                t('Ask the agent for ideas — they land here.'),
              ),
        ],
      ),
    ]),
    open ? h(Detail, { key: 'd', item: open, t, onClose: () => setOpen(undefined) }) : null,
  ])
}
