import { createElement as h, useEffect, useState } from 'react'

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'

export default function view(api) {
  function Planif() {
    const [state, setState] = useState({ loading: true, notes: [], enabled: false })

    useEffect(() => {
      api
        .fetch('/api/plugin/planif/notes')
        .then((r) => r.json())
        .then((d) => setState({ loading: false, ...d }))
        .catch((e) => setState({ loading: false, notes: [], enabled: false, error: e.message }))
    }, [])

    if (state.loading) return h('p', { className: 'planif-muted' }, 'Loading…')
    if (state.error) return h('p', { className: 'planif-problem' }, state.error)

    return h('section', { className: 'planif' }, [
      h('header', { key: 'h', className: 'planif__head' }, [
        h('h2', { key: 't' }, 'Scheduled turns'),
        // The clock's state comes first: a list of notes that will never run
        // looks exactly like a list of notes that will.
        h(
          'span',
          { key: 's', className: state.enabled ? 'planif-on' : 'planif-off' },
          state.enabled ? 'clock running' : 'clock off — nothing will run',
        ),
      ]),

      state.notes.length === 0
        ? h('p', { key: 'e', className: 'planif-muted' }, 'No scheduled note yet.')
        : h(
            'ul',
            { key: 'l', className: 'planif__list' },
            state.notes.map((note) =>
              h('li', { key: note.id, className: 'planif__note' }, [
                h('div', { key: 'r', className: 'planif__row' }, [
                  h('strong', { key: 'n' }, note.title),
                  h('span', { key: 'e', className: 'planif-every' }, note.every ?? '—'),
                  !note.enabled && h('span', { key: 'd', className: 'planif-off' }, 'suspended'),
                  note.problem && h('span', { key: 'p', className: 'planif-problem' }, note.problem),
                ]),
                h(
                  'div',
                  { key: 'w', className: 'planif-muted' },
                  `last ${fmt(note.lastRun)} · next ${fmt(note.nextRun)}`,
                ),
                // The prompt itself: a scheduled turn nobody can read is a
                // scheduled turn nobody can predict.
                h('pre', { key: 'b', className: 'planif__body' }, note.body),
                h(
                  'button',
                  {
                    key: 'a',
                    className: 'planif__ask',
                    // Edited through the AGENT, never from here: the body of
                    // one of these runs verbatim as a prompt, and a UI writing
                    // it directly would be a second author on an executable.
                    onClick: () =>
                      api.ask(
                        note.enabled
                          ? `Suspends la tâche planifiée « ${note.title} » (enabled: false dans sa note).`
                          : `Réactive la tâche planifiée « ${note.title} ».`,
                      ),
                  },
                  note.enabled ? 'Ask to suspend' : 'Ask to resume',
                ),
              ]),
            ),
          ),

      h(
        'button',
        {
          key: 'new',
          className: 'planif__ask',
          onClick: () => api.ask('Crée une tâche planifiée « … » qui tourne tous les jours et qui : '),
        },
        '＋ Ask for a new scheduled turn',
      ),
    ])
  }

  /**
   * What the tile says about what runs on its own.
   *
   * The clock being OFF is the figure that matters most: an instance with
   * eight active notes and a stopped clock does nothing at all, and that is
   * exactly the state somebody needs told rather than discovered a week later.
   */
  async function tileInfo() {
    const response = await api.fetch('/api/plugin/planif/notes')
    if (!response.ok) return undefined
    const { notes, enabled } = await response.json()

    if (!enabled) {
      return { chips: [{ text: 'clock off', hot: true }] }
    }
    if (notes.length === 0) return undefined

    const active = notes.filter((note) => note.enabled && !note.problem).length
    const broken = notes.filter((note) => note.problem).length
    return {
      chips: [
        { text: `${active} active` },
        ...(broken > 0 ? [{ text: `${broken} invalid`, hot: true }] : []),
      ],
    }
  }

  return { component: Planif, tileInfo }
}
