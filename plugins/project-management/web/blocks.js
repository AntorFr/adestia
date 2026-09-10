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

import { createElement as h, useEffect, useState } from 'react'

import { classify, fraction, fromPages, parseLine, span } from './model.js'

/** The logical folder a page sits in. A page at the root has none. */
const folderOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

export default function createProjectBlocks(api) {
  const fr = api.locale === 'fr'

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
  }
  const spell = (entry, today) =>
    [entry.label, entry.start ? `${entry.start} → ${entry.due}` : entry.due, STATES[classify(entry, today)]]
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

    // Only the queried scope pays for the index; a written planning draws
    // from what is already in the page.
    useEffect(() => {
      if (!queried) return undefined
      let live = true
      void (async () => {
        try {
          const response = await api.fetch('/api/pages/index')
          if (!response.ok) throw new Error(`l'index des pages a répondu ${response.status}`)
          const { entries } = await response.json()
          if (live) setIndex(entries ?? [])
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
    // Sorted by date so neighbouring labels alternate between two rows —
    // two milestones a week apart otherwise write over each other, which
    // the first bench photo of this block duly showed.
    const milestones = entries.filter((entry) => !entry.start).sort((a, b) => (a.due < b.due ? -1 : 1))
    const tall = milestones.length > 1

    return h('div', { className: 'pm-timeline' }, [
      h(
        'div',
        { className: `pm-timeline__chart${tall ? ' pm-timeline__chart--tall' : ''}`, key: 'chart' },
        [
          ...milestones.map((mile, index) =>
            h(
              'div',
              {
                className:
                  `pm-timeline__mile pm-timeline__mile--${classify(mile, today)}` +
                  (index % 2 === 1 ? ' pm-timeline__mile--high' : ''),
                title: spell(mile, today),
                style: { left: at(mile.due) },
                key: `mile-${index}`,
              },
              h(
                mile.path && openPage ? 'button' : 'span',
                mile.path && openPage
                  ? { type: 'button', onClick: () => openPage(mile.path) }
                  : null,
                `${mile.label} · ${short(mile.due, 'weeks')}`,
              ),
            ),
          ),
          today >= box.min && today <= box.max
            ? h('div', { className: 'pm-timeline__today', style: { left: at(today) }, key: 'today' })
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
                  className: `pm-timeline__span pm-timeline__span--${classify(phase, today)}`,
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

  return { tags: { timeline: Timeline } }
}
