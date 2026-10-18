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
import { apply } from './ops.js'

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
 * The document, and the one way it is written.
 *
 * Three things have to hold at once, and they are what this hook is:
 *
 * - a drag must show INSTANTLY, so the operation is applied locally first —
 *   with `apply`, the same function the server will run, so what the screen
 *   predicts is what the file gets;
 * - a write must not lose somebody else's, so every request states the
 *   revision it was based on and one write is in flight at a time. Firing two
 *   in parallel would have the second quoting a revision the first has already
 *   replaced, and the server would refuse a perfectly good drag;
 * - a refusal must not leave a lie on screen. A 409 means the period moved
 *   under us: the server sends the current document back, we take it, and we
 *   say so — because a card that snapped back with no explanation reads as a
 *   bug rather than as somebody else's edit.
 */
function usePeriod(api, page) {
  const [state, setState] = useState({ loading: true })
  const [note, setNote] = useState()
  /** Writes wait their turn: the revision is a serial number, not a guess. */
  const queue = useRef(Promise.resolve())
  const revision = useRef(undefined)

  const load = useCallback(async () => {
    try {
      const response = await api.fetch(
        `/api/plugin/${api.id}/period?page=${encodeURIComponent(page)}`,
      )
      const body = await response.json().catch(() => undefined)
      if (!response.ok) return setState({ error: body?.error ?? 'unreadable' })
      revision.current = body.revision
      setState({ shape: body.shape, items: body.items })
    } catch {
      setState({ error: 'unreadable' })
    }
  }, [api, page])

  useEffect(() => {
    setState({ loading: true })
    void load()
  }, [load])

  const run = useCallback(
    (op) => {
      // Predicted with the server's own rules: an operation the server would
      // refuse is not drawn either, so the screen never shows a move that is
      // about to be undone.
      setState((current) => {
        if (!current.items) return current
        const result = apply(current.items, current.shape, op)
        return result.error ? current : { ...current, items: result.items }
      })
      setNote(undefined)

      queue.current = queue.current.then(async () => {
        try {
          const response = await api.fetch(
            `/api/plugin/${api.id}/period?page=${encodeURIComponent(page)}`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ revision: revision.current, op }),
            },
          )
          const body = await response.json().catch(() => undefined)
          if (response.ok) {
            revision.current = body.revision
            setState((current) => ({ ...current, items: body.items }))
            return
          }
          if (response.status === 409 && body?.items) {
            // Somebody else's write won. Take theirs, say so, and let the
            // reader redo the one gesture rather than lose the document.
            revision.current = body.revision
            setState((current) => ({ ...current, items: body.items }))
            setNote('moved')
            return
          }
          setNote('refused')
          await load()
        } catch {
          setNote('refused')
          await load()
        }
      })
    },
    [api, load, page],
  )

  return { ...state, run, note }
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
      role: 'button',
      tabIndex: 0,
      onClick: (event) => onOpen(item, event.currentTarget),
      onKeyDown: (event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onOpen(item, event.currentTarget)
        }
      },
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
              'aria-label': t('Set this one aside'),
              onClick: (event) => {
                event.stopPropagation()
                onDismiss(item)
              },
            },
            icon('x'),
          )
        : null,
    ],
  )
}

/** The shell mounts this sprite once; plugins share its names, not its code. */
const NS = 'http://www.w3.org/2000/svg'
const icon = (name) =>
  h('svg', { className: 'adestia-icon', 'aria-hidden': true, focusable: false }, h('use', { href: `#adestia-i-${name}` }))

/** A node with a class and some text, for the sheet written outside React. */
function node(tag, className, text) {
  const made = document.createElement(tag)
  if (className) made.className = className
  if (text !== undefined) made.textContent = text
  return made
}

/**
 * The detail nobody sees until they ask for it, as the shell's sheet.
 *
 * Written to the body by an effect, not rendered in the view: the shell folds
 * its panes with transforms and a fixed element inside one is fixed to THAT.
 * The contract is the plugin-author skill's: a dialog named by its title,
 * Escape and the scrim close it, Tab stays inside, and focus goes back to
 * whatever opened it.
 */
function Detail({ item, opener, t, onClose }) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const scrim = node('div', 'adestia-sheet')
    const panel = node('div', 'adestia-sheet__panel meals-sheet')
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    const head = node('header', 'adestia-sheet__head')
    const title = node('h2', 'adestia-sheet__title', item.titre || item.id)
    title.id = `meals-sheet-${item.id}`
    panel.setAttribute('aria-labelledby', title.id)
    const x = node('button', 'adestia-btn adestia-btn--ghost adestia-btn--sm adestia-btn--icon')
    x.type = 'button'
    x.setAttribute('aria-label', t('Close'))
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('class', 'adestia-icon')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    const use = document.createElementNS(NS, 'use')
    use.setAttribute('href', '#adestia-i-x')
    svg.append(use)
    x.append(svg)
    head.append(title, x)
    const body = node('div', 'adestia-sheet__body')
    const lead = node('div', 'meals-sheet-lead')
    if (item.ico) lead.append(node('span', 'meals-ico', item.ico))
    if (item.quantite) lead.append(node('span', 'meals-qty', item.quantite))
    if (lead.childNodes.length) body.append(lead)
    if (item.desc || item.hint) body.append(node('p', 'meals-desc', item.desc || item.hint))
    const entries = Object.entries(item.props ?? {}).filter(([key]) => typeof key === 'string' && key !== '')
    if (entries.length > 0) {
      const list = node('dl', 'meals-props')
      for (const [key, value] of entries) list.append(node('dt', '', key), node('dd', '', String(value ?? '')))
      body.append(list)
    }
    if (item.source) body.append(node('p', 'meals-source', item.source))
    panel.append(head, body)
    scrim.append(panel)
    document.body.append(scrim)
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close.current()
      } else if (event.key === 'Tab') {
        const controls = [...panel.querySelectorAll('button:not(:disabled)')]
        const inside = panel.contains(document.activeElement)
        if (!inside || controls.length === 1) { event.preventDefault(); controls[0]?.focus() }
      }
    }
    scrim.addEventListener('click', (event) => { if (event.target === scrim) close.current() })
    x.addEventListener('click', () => close.current())
    document.addEventListener('keydown', onKey, true)
    x.focus()
    return () => {
      document.removeEventListener('keydown', onKey, true)
      scrim.remove()
      if (opener?.isConnected) opener.focus()
    }
  }, [item, opener, t])
  return null
}

/**
 * The screen.
 *
 * Everything it draws comes from the server's answer about ONE page: the shape
 * the page declares and the cards its data file holds. The layout hands it a
 * path and nothing else — a second source for the same facts is how a screen
 * ends up disagreeing with the file it is showing.
 */
export default function Frise({ api, page }) {
  const t = useMemo(() => words(api.locale), [api.locale])
  const [open, setOpen] = useState()
  const onOpen = useCallback((item, from) => setOpen({ item, from }), [])
  const dragged = useRef(null)
  const { shape, items, loading, error, run, note } = usePeriod(api, page)

  const view = useMemo(() => layout(shape, items), [shape, items])

  const onDrag = useCallback((event, item) => {
    dragged.current = item.id
    event.dataTransfer.effectAllowed = 'move'
    // Written though never read back: a drag with an empty payload is
    // cancelled outright by some browsers before any drop handler runs.
    event.dataTransfer.setData('text/plain', item.id)
  }, [])

  const dropInto = useCallback(
    (event, jour, section, cards) => {
      event.preventDefault()
      const id = dragged.current
      dragged.current = null
      if (!id) return
      const ordre = dropRank(cards, indexAt(event.currentTarget, event.clientY, id))
      run({ op: 'place', id, jour, section, ordre })
    },
    [run],
  )

  const dropToTray = useCallback(
    (event) => {
      event.preventDefault()
      const id = dragged.current
      dragged.current = null
      if (id) run({ op: 'tray', id })
    },
    [run],
  )

  if (error) return h('p', { className: 'meals-empty' }, t('This period cannot be read.'))
  if (loading) return h('p', { className: 'meals-empty' }, t('loading…'))

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
                      h(Card, { key: item.id, item, t, onOpen, onDrag }),
                    )
                  : h('span', { className: 'meals-drop' }, t('Drop a card here')),
              ),
            ]),
          ),
        ]),
      )
    : h(
        'p',
        { className: 'meals-empty' },
        t('An idea for now — the tray is live, the timeline waits for dates.'),
      )

  return h('div', { className: 'meals' }, [
    // The period says its own name and span. The shell puts the page's title
    // in the breadcrumb and nowhere else, and a frise that opened on an
    // undated grid with no heading leaves a reader guessing which week.
    h('header', { key: 'h', className: 'meals-head' }, [
      h('h2', { key: 't' }, shape?.titre || t('Ideas')),
      view.dated
        ? h(
            'span',
            { key: 'p', className: 'meals-period' },
            `${dayLabel(shape.debut, api.locale)} → ${dayLabel(shape.fin, api.locale)}`,
          )
        : null,
    ]),
    note
      ? h(
          'p',
          { key: 'n', className: 'meals-note', role: 'status' },
          note === 'moved'
            ? t('Someone changed this period while you were reading it. Reloaded.')
            : t('That move was refused.'),
        )
      : null,
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
                  h(Card, { key: item.id, item, t, onOpen, onDrag }),
                ),
              ),
            ])
          : null,
      ]),
      h(
        'aside',
        { key: 'y', className: 'meals-tray', onDragOver: allow, onDrop: dropToTray },
        [
          h('h3', { key: 'h', className: 'meals-tray-head' }, t('Ideas')),
          view.tray.length > 0
            ? view.tray.map((item) =>
                h(Card, {
                  key: item.id,
                  item,
                  t,
                  tray: true,
                  onOpen,
                  onDrag,
                  onDismiss: (card) => run({ op: 'dismiss', id: card.id }),
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
    open ? h(Detail, { key: 'd', item: open.item, opener: open.from, t, onClose: () => setOpen(undefined) }) : null,
  ])
}
