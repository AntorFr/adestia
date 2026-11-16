/**
 * `:::timeline` — bars and markers in time, from lines written in the block.
 *
 * The body is the DATA: the reader hands a flow block its list items as
 * plain text (`items`), and this component draws those instead of its
 * rendered children — the same posture as the core's `figures`. What the
 * calendar cannot say is never invented: an unreadable line is listed under
 * the chart by name, and a body with no date at all gets a sentence showing
 * the grammar, not an empty axis.
 *
 * TWO PROVENANCES, one drawing — the letter's own illustration of its two
 * axes. `depth=self` reads the block's own lines; `depth=children|subtree`
 * reads `start:`/`due:` from the pages below and draws the consolidated
 * planning, where a bar OPENS the worksite it stands for. A closed model
 * would have drawn a rectangle with nothing to click.
 *
 * The index is fetched rather than handed over: a block sees its own page,
 * not the instance's, and `todo`'s checklist already reads it this way.
 */

import { createElement as h, useEffect, useRef, useState } from 'react'

import {
  barState,
  fraction,
  fromPages,
  labelRows,
  milestonesOf,
  parseLine,
  progressOf,
  risksOf,
  span,
  subprojectsOf,
} from './model.js'

/** The logical folder a page sits in. A page at the root has none. */
const folderOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

/**
 * The words this plugin DECLARES, for the shell to say.
 *
 * The block's description is written in the manifest and drawn by the
 * editor's settings panel, so no amount of care inside this module would put
 * it in the reader's language: the table is how it gets there.
 */
export function table(locale) {
  return String(locale ?? '').slice(0, 2) === 'fr'
    ? {
        'How far the pages below this page are: the share finished, how many are late and what falls due next.':
          'Où en sont les pages sous cette page : la part terminée, combien sont en retard et ce qui échoit ensuite.',
        'Milestones written one per line — `- Label: 2026-11-20`, with `— done` once reached — each marked done, next, late or planned.':
          'Les jalons, écrits un par ligne — `- Libellé: 2026-11-20`, avec `— done` une fois atteints — chacun marqué fait, prochain, en retard ou prévu.',
        'Risks written one per line — `- Label: High — Marc` — with a level of High, Medium or Low and an optional owner.':
          'Les risques, écrits un par ligne — `- Libellé: High — Marc` — avec un niveau High, Medium ou Low et un responsable facultatif.',
        'Phases and milestones on a time axis — written as list lines in the block, or read from the start:/due: of the pages below.':
          'Phases et jalons sur un axe de temps — écrits en lignes de liste dans le bloc, ou lus dans les start:/due: des fiches du dessous.',
        'The sub-projects below this page, each with where it stands — its `project-status` while it is under way, its lifecycle status when that has something more urgent to say.':
          'Les sous-projets sous cette fiche, chacun avec où il en est — son `project-status` tant qu’il tourne, son statut de cycle de vie quand celui-ci a quelque chose de plus urgent à dire.',
        // The field's own name and its one sentence, drawn by the shell's
        // properties form. The VALUES are not here and must not be: `Green`
        // is what the file carries, and a menu offering a word the file does
        // not contain is a menu that lies about what it is about to write.
        'Project status': 'Statut projet',
        'How the project is GOING, and only while it is under way — a project waiting or closed says that instead.':
          'Où en est le projet, et seulement tant qu’il tourne — un projet en attente ou clos dit ça à la place.',
        // The group the form files those fields under wears the plugin's id.
        'project-management': 'Gestion de projet',
        // What the blocks themselves say. The French is what they said before
        // they had a table, letter for letter (B-1).
        closed: 'clos',
        late: 'en retard',
        elapsed: 'échu',
        'under way': 'en cours',
        ahead: 'à venir',
        today: 'aujourd\'hui',
        'today|axis': 'auj.',
        Q: 'T',
        'Planning…': 'Planning…',
        'the page index answered %status': 'l\'index des pages a répondu %status',
        'No page below this one carries a date — a phase declares `start:` and `due:` in its header, a milestone `due:` alone.':
          'Aucune page sous celle-ci ne porte de date — une phase se déclare avec « start: » et « due: » dans son entête, un jalon avec « due: » seul.',
        'Nothing here carries a date — a phase reads “Scoping: 2026-01-15 → 2026-03-01”, a milestone “Review: 2026-06-01”.':
          'Rien ne porte de date ici — une phase s’écrit « Cadrage: 2026-01-15 → 2026-03-01 », un jalon « Recette: 2026-06-01 ».',
        'Pages with unreadable dates: ': 'Pages aux dates illisibles : ',
        'Lines with no readable date: ': 'Lignes sans date lisible : ',
        'No sub-project below this page — a project declares `type: project-management` in its header.':
          'Aucun sous-projet sous cette page — un projet se déclare avec « type: project-management » dans son entête.',
        'No page below this page yet.': 'Aucune page sous cette page pour l’instant.',
        '%done of %total sub-pages done': '%done sous-pages terminées sur %total',
        Late: 'En retard',
        'Progress': 'Avancement',
        'Next due': 'Prochaine échéance',
        'Nothing is due': 'Rien à l’horizon',
        'No milestone yet. Use Edit data to add one.':
          'Aucun jalon pour l’instant. Utilisez Modifier les données pour en ajouter un.',
        'No risk recorded. Use Edit data to add one.':
          'Aucun risque noté. Utilisez Modifier les données pour en ajouter un.',
        Done: 'Fait',
        Next: 'Prochain',
        Planned: 'Prévu',
        'Risk': 'Risque',
        Level: 'Niveau',
        Owner: 'Responsable',
        'Line not understood: ': 'Ligne non comprise : ',
        '%n closed project': '%n projet clos',
        '%n closed projects': '%n projets clos',
      }
    : {}
}

/**
 * The sayer for one locale: the English key stands when no table answers.
 * A key may carry a context after `|` (`today|axis`) when one English word
 * is two French ones; the context is never shown. `%name` is filled from the
 * values.
 */
const words = (locale) => {
  const said = table(locale)
  return (key, values = {}) =>
    (said[key] ?? key.replace(/\|.*$/, '')).replace(/%(\w+)/g, (whole, name) =>
      name in values ? String(values[name]) : whole,
    )
}

export default function createProjectBlocks(api) {
  const t = words(api.locale)

  /**
   * The page index, asked for ONCE however many blocks want it.
   *
   * Both of this plugin's query blocks read the same listing, so a page
   * carrying a planning and a list of sub-projects fired TWO full requests
   * for one answer — and `/api/pages/index` re-reads every markdown file in
   * the instance, so the second one is not free anywhere.
   *
   * Only the IN-FLIGHT request is shared, never the answer: the agent writes
   * pages while somebody reads them, and a cached listing would show a stale
   * corpus with nothing to say it is stale. Two blocks mounting together make
   * one call; a block mounting later asks again, and gets what is true then.
   */
  let flight
  const askIndex = async () => {
    if (!flight) {
      flight = (async () => {
        const response = await api.fetch('/api/pages/index')
        if (!response.ok) throw new Error(t('the page index answered %status', { status: response.status }))
        const { entries } = await response.json()
        return entries ?? []
      })()
      // Released once settled, success or failure: what is kept is the
      // request, not its result.
      void flight.catch(() => {}).finally(() => {
        flight = undefined
      })
    }
    return flight
  }

  /**
   * The index a query block reads: the one the SHELL handed over, or one
   * asked for when nobody handed any.
   *
   * Handed over is the normal case and the fast one — the shell fetched the
   * listing once at boot and keeps it live, so there is nothing to wait for
   * and the block draws on its first frame, like the core's own `:::list`.
   * The fetch is the fallback for the case the contract names: prose rendered
   * outside a shell, where `pages` is genuinely absent.
   *
   * `want` says whether this block needs an index at all — a written planning
   * reads its own lines and must not pay for a listing it will not open.
   */
  function useIndex(given, want = true) {
    const [asked, setAsked] = useState(null)
    const [failure, setFailure] = useState(null)
    useEffect(() => {
      if (!want || given !== undefined) return undefined
      let live = true
      void (async () => {
        try {
          const entries = await askIndex()
          if (live) setAsked(entries)
        } catch (cause) {
          if (live) setFailure(cause.message)
        }
      })()
      return () => {
        live = false
      }
    }, [given, want])
    return { index: given ?? asked, failure }
  }

  /**
   * What a bar says when the colour cannot be seen — hovered, read aloud, or
   * printed in grey. The state is otherwise carried by hue alone, and the
   * dates are carried by position alone: neither survives a screen reader.
   */
  const STATES = {
    done: t('closed'),
    late: t('late'),
    past: t('elapsed'),
    current: t('under way'),
    ahead: t('ahead'),
    // The three a project's owner writes themselves, and not translated: the
    // domain's own words, the same ones the file carries and the pill shows.
    // They sit in the same table as the calendar's because a bar wears ONE
    // state — what the owner said, or failing that what the dates imply.
    green: 'Green',
    amber: 'Amber',
    red: 'Red',
  }
  const spell = (entry, today) =>
    [entry.label, entry.start ? `${entry.start} → ${entry.due}` : entry.due, STATES[barState(entry, today)]]
      .filter(Boolean)
      .join(' · ')

  /** A date the axis and milestones can wear — short, in the shell's locale. */
  function short(isoDate, scale) {
    const date = new Date(`${isoDate}T00:00:00Z`)
    if (scale === 'quarters') {
      return `${t('Q')}${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`
    }
    const parts = { month: 'short', timeZone: 'UTC' }
    if (scale === 'weeks') parts.day = 'numeric'
    if (scale === 'months' && date.getUTCMonth() === 0) parts.year = 'numeric'
    return date.toLocaleDateString(api.locale, parts)
  }

  /**
   * The dated entries as rows — `view=list`. The same entries, in the order of
   * their dates, each with the word the bars carry as their title: the state
   * is a word in a pill (calendar states) or beside a dot (the owner's own
   * Green / Amber / Red), never a hue alone. A late entry is the dashed
   * `--text-muted` outline, as on the bars; amber stays the owner's.
   */
  function timelineList(entries, today, openPage) {
    const PILL = { done: 'done', past: 'done', late: 'late', current: 'next', ahead: 'planned' }
    const sorted = [...entries].sort((a, b) => {
      const left = a.start ?? a.due
      const right = b.start ?? b.due
      return left === right ? (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) : left < right ? -1 : 1
    })
    return h(
      'ul',
      { className: 'pm-list pm-timeline__list' },
      sorted.map((entry, index) => {
        const state = barState(entry, today)
        const word = STATES[state]
        const mark = !word
          ? null
          : PILL[state]
            ? pill(PILL[state], word)
            : h('span', { className: 'pm-timeline__owner', key: 'owner' }, [
                h('i', { className: `pm-subproject__ico pm-subproject__ico--${state}`, 'aria-hidden': 'true', key: 'dot' }),
                h('span', { key: 'word' }, word),
              ])
        const label = h(
          entry.path && openPage ? 'button' : 'span',
          {
            className: 'pm-mile__label pm-timeline__name',
            key: 'label',
            ...(entry.path && openPage ? { type: 'button', onClick: () => openPage(entry.path) } : {}),
          },
          entry.label,
        )
        return h('li', { className: `pm-mile pm-timeline__row pm-timeline__row--${state}`, key: index, title: spell(entry, today) }, [
          mark,
          label,
          h(
            'span',
            { className: 'pm-mile__date', key: 'date' },
            entry.start ? `${day(entry.start)} → ${day(entry.due)}` : day(entry.due),
          ),
        ])
      }),
    )
  }

  function Timeline({ attributes = {}, items = [], path, openPage, pages }) {
    const scale = attributes.scale ?? 'months'
    const depth = attributes.depth ?? 'self'
    const queried = depth !== 'self'
    const { index, failure } = useIndex(pages, queried)
    // The chart's width, so milestone labels can be laid out in rows that
    // really clear each other — a percentage says where a line is, not
    // whether two labels fit side by side.
    const chart = useRef(null)
    const [width, setWidth] = useState(0)
    useEffect(() => {
      const node = chart.current
      if (!node || typeof ResizeObserver === 'undefined') return undefined
      const watch = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
      watch.observe(node)
      return () => watch.disconnect()
    })

    const written = items.map((text) => ({ text, entry: parseLine(text) }))
    let entries
    let unread
    if (queried) {
      if (failure) return h('p', { className: 'pm-timeline__empty' }, failure)
      if (!index) {
        return h('p', { className: 'pm-timeline__empty' }, t('Planning…'))
      }
      const found = fromPages(index, path === undefined ? '' : folderOf(path), depth)
      entries = found.entries
      unread = found.unread
    } else {
      entries = written.filter((line) => line.entry).map((line) => line.entry)
      unread = written.filter((line) => !line.entry).map((line) => line.text)
    }
    const box = span(entries, scale)

    // Both notes can stand alone or together: a body whose every line is
    // unreadable gets the grammar AND its own lines back by name — losing
    // them to the shorter message would be losing somebody's words.
    const grammar = box
      ? null
      : h(
          'p',
          { className: 'pm-timeline__empty', key: 'empty' },
          queried
            ? t('No page below this one carries a date — a phase declares `start:` and `due:` in its header, a milestone `due:` alone.')
            : t('Nothing here carries a date — a phase reads “Scoping: 2026-01-15 → 2026-03-01”, a milestone “Review: 2026-06-01”.'),
        )
    const leftover =
      unread.length > 0
        ? h(
            'p',
            { className: 'pm-timeline__unread', key: 'unread' },
            `${
              queried ? t('Pages with unreadable dates: ') : t('Lines with no readable date: ')
            }${unread.join(' · ')}`,
          )
        : null
    if (!box) return h('div', { className: 'pm-timeline' }, [grammar, leftover])

    const today = new Date().toISOString().slice(0, 10)
    // `view` is how the SAME entries are drawn, never what is written: the
    // file is byte for byte the same under either, and so is the walk.
    if (attributes.view === 'list') {
      return h('div', { className: 'pm-timeline pm-timeline--list' }, [
        timelineList(entries, today, openPage),
        leftover,
      ])
    }
    const at = (date) => `${(fraction(date, box) * 100).toFixed(2)}%`
    const phases = entries.filter((entry) => entry.start)
    // Sorted by date, then laid out in as many rows as it takes for no two
    // labels to write over each other — the rows sit INSIDE the chart's top
    // padding, so a label never climbs onto what is above the block.
    const milestones = entries.filter((entry) => !entry.start).sort((a, b) => (a.due < b.due ? -1 : 1))
    const words = milestones.map((mile) => `${mile.label} · ${short(mile.due, 'weeks')}`)
    const placed = labelRows(
      milestones.map((mile, index) => ({ at: fraction(mile.due, box), chars: words[index].length })),
      width,
    )
    const rows = Math.max(1, ...placed.map((one) => one.row + 1))
    const ROW = 18

    return h('div', { className: 'pm-timeline' }, [
      h(
        'div',
        { className: 'pm-timeline__chart', style: { paddingTop: `${12 + rows * ROW}px` }, ref: chart, key: 'chart' },
        [
          ...milestones.map((mile, index) =>
            h(
              'div',
              {
                className:
                  `pm-timeline__mile pm-timeline__mile--${barState(mile, today)}` +
                  // Near the right edge the label reads leftwards from its
                  // line, or it runs past the chart into whatever is beside.
                  (placed[index].end ? ' pm-timeline__mile--end' : ''),
                title: spell(mile, today),
                style: { left: at(mile.due), top: `${4 + rows * ROW}px` },
                key: `mile-${index}`,
              },
              h(
                mile.path && openPage ? 'button' : 'span',
                {
                  style: { top: `${-(placed[index].row + 1) * ROW}px` },
                  // A button is named by its content, not by the title of the
                  // box around it: the state word ("late") goes in the name,
                  // for a phone where nothing hovers.
                  ...(STATES[barState(mile, today)]
                    ? { 'aria-label': `${words[index]} · ${STATES[barState(mile, today)]}` }
                    : {}),
                  ...(mile.path && openPage
                    ? { type: 'button', onClick: () => openPage(mile.path) }
                    : STATES[barState(mile, today)]
                      ? { role: 'img' }
                      : {}),
                },
                words[index],
              ),
            ),
          ),
          today >= box.min && today <= box.max
            ? h('div', {
                className: 'pm-timeline__today',
                // Named at the foot, so the one line nobody drew cannot be
                // mistaken for a milestone somebody did.
                'data-label': t('today|axis'),
                title: `${t('today')} · ${today}`,
                // Below the label rows, like a milestone's line: drawn
                // through them, it cuts a label in two.
                style: { left: at(today), top: `${4 + rows * ROW}px` },
                key: 'today',
              })
            : null,
          ...phases.map((phase, index) =>
            h(
              'div',
              { className: 'pm-timeline__bar', key: `phase-${index}` },
              // A bar that STANDS for a page opens it — the whole point of
              // the open model: a phase is an item, so there is somewhere to
              // go. A written phase has no page, and stays a plain span
              // rather than a button that would do nothing on click.
              h(
                phase.path && openPage ? 'button' : 'div',
                {
                  className: `pm-timeline__span pm-timeline__span--${barState(phase, today)}`,
                  title: spell(phase, today),
                  style: {
                    left: at(phase.start),
                    width: `${((fraction(phase.due, box) - fraction(phase.start, box)) * 100).toFixed(2)}%`,
                  },
                  ...(phase.path && openPage
                    ? { type: 'button', onClick: () => openPage(phase.path) }
                    : {}),
                },
                phase.label,
              ),
            ),
          ),
          h(
            'div',
            { className: 'pm-timeline__axis', key: 'axis' },
            box.ticks.map((tick) =>
              h('span', { className: 'pm-timeline__tick', style: { left: at(tick) }, key: tick }, short(tick, scale)),
            ),
          ),
        ],
      ),
      leftover,
    ])
  }

  /**
   * `:::subproject` — the sub-projects below this page, and where each stands.
   *
   * A block of this plugin's own rather than a `:::list` with an attribute,
   * and the reason is a contract rather than a drawing: a seam in the core's
   * row — "ask the owning plugin for a chip" — would make the evolution of
   * that row answerable to every plugin an instance runs, including the ones
   * nobody here maintains. A block belongs to whoever writes it.
   *
   * What it costs is a second rendering of rows; what it saves is that the
   * walk, the eligibility and the state machine are the ones `:::timeline`
   * already runs on. A planning and a list of sub-projects that disagreed
   * about what "below" means, or about how a project is doing, would be two
   * answers to one question on the same page.
   */
  function Subproject({ attributes = {}, path, openPage, pages }) {
    const depth = attributes.depth ?? 'children'
    const closed = attributes.closed ?? 'fold'
    // `view` lays out the ENTRIES, never the block — the core's own word, at
    // the core's own meaning, so a list of sub-projects and a `:::list` in
    // cards on the same page are laid out by one idea and not two.
    const view = attributes.view === 'cards' ? 'cards' : 'rows'
    const { index, failure } = useIndex(pages)

    if (failure) return h('p', { className: 'pm-subproject__empty' }, failure)
    if (!index) return null

    const rows = subprojectsOf(index, path === undefined ? '' : folderOf(path), depth).filter(
      (row) => row.path !== path,
    )
    if (rows.length === 0) {
      return h(
        'p',
        { className: 'pm-subproject__empty' },
        t('No sub-project below this page — a project declares `type: project-management` in its header.'),
      )
    }

    const live = rows.filter((row) => !row.finished)
    const done = rows.filter((row) => row.finished)
    const shown = closed === 'show' ? rows : live

    /**
     * One row: what it is called, and the single word for where it stands.
     *
     * THE STATE IS THE BULLET, and the word rides quietly beside the title.
     * A coloured pill at the end of each line made the state a second column
     * of boxes — heavier than the thing it reports, and read after the title
     * rather than with it. The glyph was already there, already at the left
     * margin where the eye runs down a list, and it was carrying nothing.
     *
     * The WORD is still written. That is not decoration: a bullet in a colour
     * with no word anywhere would make the hue the label, which is the one
     * rule this product does not bend — and it would leave a screen reader,
     * a grey print and a colour-blind reader with a list of identical dots.
     * So the word stays, as a plain tag rather than a pill: the colour is
     * said once, on the bullet, and the box around the word goes.
     *
     * The dot is DRAWN by the stylesheet, not written here: a glyph taken
     * from the font is a shape nobody really chooses — it moves from one
     * system to the next, and it has neither the size nor the weight it is
     * asked for. The element is empty on purpose.
     */
    const draw = (row) =>
      h(
        openPage ? 'button' : 'div',
        {
          key: row.path,
          className: 'pm-subproject__row',
          ...(openPage ? { type: 'button', onClick: () => openPage(row.path) } : {}),
        },
        [
          h(
            'i',
            {
              className: row.badge
                ? `pm-subproject__ico pm-subproject__ico--${row.badge.tone}`
                : 'pm-subproject__ico',
              key: 'ico',
              // Not `aria-hidden` any more: it is the only thing carrying the
              // state's colour, so it owes a reader the state's name.
              ...(row.badge ? { title: row.badge.word, 'aria-label': row.badge.word } : { 'aria-hidden': 'true' }),
            },
          ),
          h('span', { className: 'pm-subproject__title', key: 'title' }, row.label),
          // Nothing at all when the page says nothing about itself: an empty
          // tag would be a state, and "nobody has said" is not one.
          row.badge
            ? h('span', { className: 'pm-subproject__tag', key: 'state' }, row.badge.word)
            : null,
        ],
      )

    /**
     * The same row, as a card — a grid entry rather than a line.
     *
     * Same three things in the same order, and deliberately: a card that
     * reordered them would make the two views two drawings to learn instead
     * of one drawing in two shapes. What changes is the BOX and where it
     * breaks — the dot and the name on one line, the word under them, so a
     * long project name has somewhere to go.
     */
    const card = (row) =>
      h(
        openPage ? 'button' : 'div',
        {
          key: row.path,
          className: openPage ? 'adestia-card pm-subproject__card' : 'adestia-card adestia-card--static pm-subproject__card',
          ...(openPage ? { type: 'button', onClick: () => openPage(row.path) } : {}),
        },
        [
          h(
            'span',
            { className: 'pm-subproject__head', key: 'head' },
            [
              h(
                'i',
                {
                  className: row.badge
                    ? `pm-subproject__ico pm-subproject__ico--${row.badge.tone}`
                    : 'pm-subproject__ico',
                  key: 'ico',
                  ...(row.badge
                    ? { title: row.badge.word, 'aria-label': row.badge.word }
                    : { 'aria-hidden': 'true' }),
                },
              ),
              h('span', { className: 'pm-subproject__title', key: 'title' }, row.label),
            ],
          ),
          row.badge
            ? h('span', { className: 'pm-subproject__tag', key: 'state' }, row.badge.word)
            : null,
        ],
      )

    const entry = view === 'cards' ? card : draw

    // In cards, the entries share a grid; in rows they stack. The FOLD keeps
    // its own grid so what is closed is laid out like what is live — a
    // reader who opens it should recognise what falls out.
    const grid = (entries, key) =>
      view === 'cards'
        ? h('div', { className: 'pm-subproject__grid', key }, entries.map(entry))
        : entries.map(entry)

    return h('div', { className: `pm-subproject pm-subproject--${view}` }, [
      grid(shown, 'live'),
      // Folded, never dropped: a finished project is exactly what somebody
      // opens to see how the last one went. The same posture as the core's
      // own list, because a reader should not have to learn two.
      closed === 'fold' && done.length > 0
        ? h('details', { className: 'pm-subproject__fold', key: 'fold' }, [
            h(
              'summary',
              { key: 'summary' },
              t(done.length === 1 ? '%n closed project' : '%n closed projects', { n: done.length }),
            ),
            grid(done, 'done'),
          ])
        : null,
    ])
  }

  // ── The three project blocks ─────────────────────────────────────────────
  // Their drawing is the shell's components (`components.css`): the state pill,
  // the figure tile, the meter and the static card. Nothing here is a colour.

  const ICONS = {
    done: [['path', { d: 'M20 6 9 17l-5-5' }]],
    next: [['path', { d: 'M5 12h14' }], ['path', { d: 'm12 5 7 7-7 7' }]],
    late: [
      ['circle', { cx: 12, cy: 12, r: 10 }],
      ['path', { d: 'M12 8v4' }],
      ['path', { d: 'M12 16h.01' }],
    ],
    planned: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 6v6l4 2' }]],
    high: [
      ['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }],
      ['path', { d: 'M12 9v4' }],
      ['path', { d: 'M12 17h.01' }],
    ],
    medium: [['path', { d: 'M5 12h14' }]],
    low: [['path', { d: 'm6 9 6 6 6-6' }]],
  }

  /** A state, as a word AND an icon — the tint alone never says it. */
  const pill = (state, word) =>
    h('span', { className: `adestia-state adestia-state--${state}` }, [
      h(
        'svg',
        { className: 'adestia-icon adestia-icon--sm', viewBox: '0 0 24 24', 'aria-hidden': 'true', key: 'icon' },
        ICONS[state].map(([tag, attrs], index) => h(tag, { ...attrs, key: index })),
      ),
      h('span', { key: 'word' }, word),
    ])

  const today = () => new Date().toISOString().slice(0, 10)

  const day = (isoDate) =>
    new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(api.locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })

  /** "in 20 days", "today", "20 days ago": the distance from today to a date, in the reader's language. */
  const distance = (isoDate) => {
    const days = Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000)
    return new Intl.RelativeTimeFormat(api.locale, { numeric: 'auto' }).format(days, 'day')
  }

  /** Lines the block cannot read: named under it, kept as written. */
  const unreadNote = (lines) =>
    lines.length === 0
      ? null
      : h(
          'ul',
          { className: 'pm-unread', key: 'unread' },
          lines.map((line, index) => h('li', { key: index }, `${t('Line not understood: ')}${line}`)),
        )

  function Progress({ attributes = {}, path, pages }) {
    const depth = attributes.depth === 'subtree' ? 'subtree' : 'children'
    const view = attributes.view === 'bar' ? 'bar' : 'tiles'
    const { index, failure } = useIndex(pages)
    if (failure) return h('p', { className: 'pm-empty' }, failure)
    if (!index) return h('p', { className: 'pm-empty' }, t('Planning…'))
    const figures = progressOf(index, path === undefined ? '' : folderOf(path), depth, path, today())
    if (figures.total === 0) return h('p', { className: 'pm-empty' }, t('No page below this page yet.'))
    const next = figures.next ? figures.next.label : t('Nothing is due')
    const nextWhen = figures.next ? distance(figures.next.due) : null
    const counted = t('%done of %total sub-pages done', { done: figures.done, total: figures.total })
    if (view === 'bar') {
      return h('div', { className: 'pm-progress pm-progress--bar' }, [
        h('div', { className: 'pm-progress__head', key: 'head' }, [
          h('strong', { key: 'n' }, `${figures.percent} %`),
          h('span', { key: 'c' }, counted),
        ]),
        h(
          'div',
          {
            className: 'adestia-meter',
            role: 'progressbar',
            'aria-label': t('Progress'),
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': figures.percent,
            'aria-valuetext': counted,
            key: 'meter',
          },
          h('span', { className: 'adestia-meter__fill', style: { width: `${figures.percent}%` } }),
        ),
        h(
          'p',
          { className: 'pm-progress__line', key: 'line' },
          `${t('Late')}: ${figures.late} · ${t('Next due')}: ${next}${nextWhen ? ` (${nextWhen})` : ''}`,
        ),
      ])
    }
    const meter = h(
      'div',
      {
        className: 'adestia-meter',
        role: 'progressbar',
        'aria-label': t('Progress'),
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': figures.percent,
        'aria-valuetext': counted,
        key: 'm',
      },
      h('span', { className: 'adestia-meter__fill', style: { width: `${figures.percent}%` } }),
    )
    const tile = (label, value, caption, key, extra = null) =>
      h('div', { className: 'adestia-figure', key }, [
        h('span', { className: 'adestia-figure__value', key: 'v' }, value),
        h('span', { className: 'adestia-figure__label', key: 'l' }, label),
        extra,
        caption ? h('span', { className: 'adestia-figure__caption', key: 'c' }, caption) : null,
      ])
    return h('div', { className: 'adestia-figures' }, h('div', { className: 'adestia-figures__row' }, [
      tile(t('Progress'), `${figures.percent} %`, counted, 'done', meter),
      tile(t('Late'), String(figures.late), null, 'late'),
      tile(t('Next due'), next, nextWhen, 'next'),
    ]))
  }

  const STATE_WORDS = () => ({ done: t('Done'), next: t('Next'), late: t('Late'), planned: t('Planned') })

  function Milestones({ attributes = {}, items = [] }) {
    const view = attributes.view === 'cards' ? 'cards' : 'list'
    const { items: rows, unread } = milestonesOf(items.filter((line) => line.trim() !== ''), today())
    if (rows.length === 0 && unread.length === 0) {
      return h('p', { className: 'pm-empty' }, t('No milestone yet. Use Edit data to add one.'))
    }
    const words = STATE_WORDS()
    const body =
      view === 'cards'
        ? h(
            'div',
            { className: 'pm-grid', key: 'rows' },
            rows.map((mile, i) =>
              h('div', { className: `adestia-card adestia-card--static pm-mile pm-mile--${mile.state}`, key: i }, [
                pill(mile.state, words[mile.state]),
                h('span', { className: 'adestia-card__title', key: 't' }, mile.label),
                h('span', { className: 'pm-mile__date', key: 'd' }, day(mile.due)),
              ]),
            ),
          )
        : h(
            'ul',
            { className: 'pm-list', key: 'rows' },
            rows.map((mile, i) =>
              h('li', { className: `pm-mile pm-mile--${mile.state}`, key: i }, [
                pill(mile.state, words[mile.state]),
                h('span', { className: 'pm-mile__label', key: 't' }, mile.label),
                h('span', { className: 'pm-mile__date', key: 'd' }, day(mile.due)),
              ]),
            ),
          )
    return h('div', { className: 'pm-milestones' }, [rows.length > 0 ? body : null, unreadNote(unread)])
  }

  function Risks({ attributes = {}, items = [] }) {
    const view = attributes.view === 'cards' ? 'cards' : 'table'
    const { items: rows, unread } = risksOf(items.filter((line) => line.trim() !== ''))
    if (rows.length === 0 && unread.length === 0) {
      return h('p', { className: 'pm-empty' }, t('No risk recorded. Use Edit data to add one.'))
    }
    const level = (risk) => pill(risk.level.toLowerCase(), risk.level)
    const body =
      view === 'cards'
        ? h(
            'div',
            { className: 'pm-grid', key: 'rows' },
            rows.map((risk, i) =>
              h('div', { className: 'adestia-card adestia-card--static pm-risk', key: i }, [
                level(risk),
                h('span', { className: 'adestia-card__title', key: 't' }, risk.label),
                risk.owner ? h('span', { className: 'pm-risk__owner', key: 'o' }, risk.owner) : null,
              ]),
            ),
          )
        : h('div', { className: 'pm-risks__scroll', key: 'rows' },
            h('table', { className: 'pm-risks' }, [
              h(
                'thead',
                { key: 'head' },
                h('tr', null, [
                  h('th', { scope: 'col', key: 'r' }, t('Risk')),
                  h('th', { scope: 'col', key: 'l' }, t('Level')),
                  h('th', { scope: 'col', key: 'o' }, t('Owner')),
                ]),
              ),
              h(
                'tbody',
                { key: 'body' },
                rows.map((risk, i) =>
                  h('tr', { key: i }, [
                    h('td', { key: 'r' }, risk.label),
                    h('td', { key: 'l' }, level(risk)),
                    h('td', { key: 'o' }, risk.owner ?? ''),
                  ]),
                ),
              ),
            ]),
          )
    return h('div', { className: 'pm-risks-block' }, [rows.length > 0 ? body : null, unreadNote(unread)])
  }

  return {
    tags: { timeline: Timeline, subproject: Subproject, progress: Progress, milestones: Milestones, risks: Risks },
    words: table(api.locale),
  }
}
