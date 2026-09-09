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
 * The QUERY scope of the letter — one bar per page below, from `start:` and
 * `due:` in their headers — is deliberately absent, and so is its `depth`
 * attribute: eligibility needs `pm-config` (which types have a workflow),
 * and an attribute that draws nothing is a documented lie this repository
 * has already paid for once.
 */

import { createElement as h } from 'react'

import { classify, fraction, parseLine, span } from './model.js'

export default function createProjectBlocks(api) {
  const fr = api.locale === 'fr'

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

  function Timeline({ attributes = {}, items = [] }) {
    const scale = attributes.scale ?? 'months'
    const read = items.map((text) => ({ text, entry: parseLine(text) }))
    const entries = read.filter((line) => line.entry).map((line) => line.entry)
    const unread = read.filter((line) => !line.entry).map((line) => line.text)
    const box = span(entries, scale)

    // Both notes can stand alone or together: a body whose every line is
    // unreadable gets the grammar AND its own lines back by name — losing
    // them to the shorter message would be losing somebody's words.
    const grammar = box
      ? null
      : h(
          'p',
          { className: 'pm-timeline__empty', key: 'empty' },
          fr
            ? 'Rien ne porte de date ici — une phase s’écrit « Cadrage: 2026-01-15 → 2026-03-01 », un jalon « Recette: 2026-06-01 ».'
            : 'Nothing here carries a date — a phase reads “Scoping: 2026-01-15 → 2026-03-01”, a milestone “Review: 2026-06-01”.',
        )
    const leftover =
      unread.length > 0
        ? h(
            'p',
            { className: 'pm-timeline__unread', key: 'unread' },
            `${fr ? 'Lignes sans date lisible : ' : 'Lines with no readable date: '}${unread.join(' · ')}`,
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
                style: { left: at(mile.due) },
                key: `mile-${index}`,
              },
              h('span', null, `${mile.label} · ${short(mile.due, 'weeks')}`),
            ),
          ),
          today >= box.min && today <= box.max
            ? h('div', { className: 'pm-timeline__today', style: { left: at(today) }, key: 'today' })
            : null,
          ...phases.map((phase, index) =>
            h(
              'div',
              { className: 'pm-timeline__bar', key: `phase-${index}` },
              h(
                'div',
                {
                  className: `pm-timeline__span pm-timeline__span--${classify(phase, today)}`,
                  style: {
                    left: at(phase.start),
                    width: `${((fraction(phase.due, box) - fraction(phase.start, box)) * 100).toFixed(2)}%`,
                  },
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
