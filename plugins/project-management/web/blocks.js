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

import { barState, fraction, fromPages, labelRows, parseLine, span, subprojectsOf } from './model.js'

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
      }
    : {}
}

export default function createProjectBlocks(api) {
  const fr = api.locale === 'fr'

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
        if (!response.ok) throw new Error(`l'index des pages a répondu ${response.status}`)
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
   * What a bar says when the colour cannot be seen — hovered, read aloud, or
   * printed in grey. The state is otherwise carried by hue alone, and the
   * dates are carried by position alone: neither survives a screen reader.
   */
  const STATES = {
    done: fr ? 'clos' : 'closed',
    late: fr ? 'en retard' : 'late',
    past: fr ? 'échu' : 'elapsed',
    current: fr ? 'en cours' : 'under way',
    ahead: fr ? 'à venir' : 'ahead',
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
      return `${fr ? 'T' : 'Q'}${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`
    }
    const parts = { month: 'short', timeZone: 'UTC' }
    if (scale === 'weeks') parts.day = 'numeric'
    if (scale === 'months' && date.getUTCMonth() === 0) parts.year = 'numeric'
    return date.toLocaleDateString(api.locale, parts)
  }

  function Timeline({ attributes = {}, items = [], path, openPage }) {
    const scale = attributes.scale ?? 'months'
    const depth = attributes.depth ?? 'self'
    const queried = depth !== 'self'
    const [index, setIndex] = useState(null)
    const [failure, setFailure] = useState(null)
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

    // Only the queried scope pays for the index; a written planning draws
    // from what is already in the page.
    useEffect(() => {
      if (!queried) return undefined
      let live = true
      void (async () => {
        try {
          const entries = await askIndex()
          if (live) setIndex(entries)
        } catch (cause) {
          if (live) setFailure(cause.message)
        }
      })()
      return () => {
        live = false
      }
    }, [queried])

    const written = items.map((text) => ({ text, entry: parseLine(text) }))
    let entries
    let unread
    if (queried) {
      if (failure) return h('p', { className: 'pm-timeline__empty' }, failure)
      if (index === null) {
        return h('p', { className: 'pm-timeline__empty' }, fr ? 'Planning…' : 'Planning…')
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
            ? fr
              ? 'Aucune page sous celle-ci ne porte de date — une phase se déclare avec « start: » et « due: » dans son entête, un jalon avec « due: » seul.'
              : 'No page below this one carries a date — a phase declares `start:` and `due:` in its header, a milestone `due:` alone.'
            : fr
              ? 'Rien ne porte de date ici — une phase s’écrit « Cadrage: 2026-01-15 → 2026-03-01 », un jalon « Recette: 2026-06-01 ».'
              : 'Nothing here carries a date — a phase reads “Scoping: 2026-01-15 → 2026-03-01”, a milestone “Review: 2026-06-01”.',
        )
    const leftover =
      unread.length > 0
        ? h(
            'p',
            { className: 'pm-timeline__unread', key: 'unread' },
            `${
              queried
                ? fr
                  ? 'Pages aux dates illisibles : '
                  : 'Pages with unreadable dates: '
                : fr
                  ? 'Lignes sans date lisible : '
                  : 'Lines with no readable date: '
            }${unread.join(' · ')}`,
          )
        : null
    if (!box) return h('div', { className: 'pm-timeline' }, [grammar, leftover])

    const today = new Date().toISOString().slice(0, 10)
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
                  ...(mile.path && openPage ? { type: 'button', onClick: () => openPage(mile.path) } : {}),
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
                'data-label': fr ? "auj." : 'today',
                title: `${fr ? "aujourd'hui" : 'today'} · ${today}`,
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
  function Subproject({ attributes = {}, path, openPage }) {
    const depth = attributes.depth ?? 'children'
    const closed = attributes.closed ?? 'fold'
    // `view` lays out the ENTRIES, never the block — the core's own word, at
    // the core's own meaning, so a list of sub-projects and a `:::list` in
    // cards on the same page are laid out by one idea and not two.
    const view = attributes.view === 'cards' ? 'cards' : 'rows'
    const [index, setIndex] = useState(null)
    const [failure, setFailure] = useState(null)

    useEffect(() => {
      let live = true
      void (async () => {
        try {
          const entries = await askIndex()
          if (live) setIndex(entries)
        } catch (cause) {
          if (live) setFailure(cause.message)
        }
      })()
      return () => {
        live = false
      }
    }, [])

    if (failure) return h('p', { className: 'pm-subproject__empty' }, failure)
    if (index === null) return null

    const rows = subprojectsOf(index, path === undefined ? '' : folderOf(path), depth).filter(
      (row) => row.path !== path,
    )
    if (rows.length === 0) {
      return h(
        'p',
        { className: 'pm-subproject__empty' },
        fr
          ? 'Aucun sous-projet sous cette page — un projet se déclare avec « type: project-management » dans son entête.'
          : 'No sub-project below this page — a project declares `type: project-management` in its header.',
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
          className: 'pm-subproject__card',
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
              fr
                ? `${done.length} ${done.length === 1 ? 'projet clos' : 'projets clos'}`
                : `${done.length} closed ${done.length === 1 ? 'project' : 'projects'}`,
            ),
            grid(done, 'done'),
          ])
        : null,
    ])
  }

  return { tags: { timeline: Timeline, subproject: Subproject }, words: table(api.locale) }
}
