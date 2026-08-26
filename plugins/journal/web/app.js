/**
 * The journal view: an entire history on one page, one entry in edit mode.
 *
 * The screen is a stack of the shell's OWN page editors, one per entry, handed
 * over by `api.PageEditor`. That is the whole trick, and it is what makes the
 * behaviour asked for fall out for free: each editor reads by default and has
 * its own ✎, so clicking one puts THAT entry into writing posture while the
 * rest of the journal stays readable. No second editor, no second grammar, no
 * idea of its own about what a save means.
 *
 * Adding an entry is a plain form rather than a new empty page opened in the
 * editor, and deliberately so: a page created before anybody typed is a page
 * that stays behind, empty, when they change their mind — and the file API is
 * read-only for a browser, so nothing here could clean it up. The form writes
 * the shortest entry the contract allows; everything after that is said in
 * the editor, which is the same division `todo` uses for capturing a task.
 */

import { createElement as h, useCallback, useEffect, useMemo, useState } from 'react'

import { ROUTE, resolve, restOf, routeOf } from './address.js'
import {
  buildModel,
  entryMarkdown,
  formatWhen,
  journalMarkdown,
  newEntryPath,
  slugify,
  stamp,
  words,
} from './model.js'

/** Where a journal created from here is filed. Anywhere works; this is home. */
const HOME = 'journal'

/** How many entries a journal shows before asking. */
const PAGE = 15

export default function view(api) {
  const t = words(api.locale)

  /**
   * Every journal folder this plugin knows — the listing `routeFor` answers
   * from, and the one an address is resolved against.
   *
   * Held here rather than in the component because the shell asks while a
   * LINK is being drawn: on the launcher, in a breadcrumb, in a page the
   * agent wrote — all of them before this view has ever mounted. Refreshed on
   * every reload and every tile render, so a journal created since boot is
   * addressable without a reload of the whole shell.
   */
  let known = []

  const refresh = async () => {
    const response = await api.fetch('/api/pages/index')
    if (!response.ok) throw new Error(`the page index answered ${response.status}`)
    const { entries } = await response.json()
    const model = buildModel(Array.isArray(entries) ? entries : [])
    known = model.map((journal) => journal.folder)
    return model
  }

  // Primed at load so the first link drawn is already the short form, rather
  // than the path form every address falls back to when the listing is empty.
  void refresh().catch(() => {})

  const put = (path, markdown, revision) =>
    api.fetch(`/api/pages/${path}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      // No revision means "this file must not exist yet": the server refuses a
      // blind PUT over something the agent wrote a second ago, so a collision
      // is a 409 and a second name rather than a page silently replaced.
      body: JSON.stringify(revision ? { markdown, revision } : { markdown }),
    })

  function Journal() {
    const [journals, setJournals] = useState(null)
    const [error, setError] = useState(null)
    const [route, setRoute] = useState(() => location.hash.replace(/^#/, ''))

    const reload = useCallback(async () => {
      try {
        setJournals(await refresh())
      } catch (cause) {
        setError(cause.message)
      }
    }, [])

    useEffect(() => {
      void reload()
    }, [reload])

    // The route owns everything below it, so this view reads its own tail:
    // `#/journal/atelier` opens that journal, and a bookmark to it resurrects
    // the same screen.
    useEffect(() => {
      const apply = () => setRoute(location.hash.replace(/^#/, ''))
      window.addEventListener('hashchange', apply)
      return () => window.removeEventListener('hashchange', apply)
    }, [])

    // Resolved against the listing rather than read off the URL: a journal is
    // addressed by NAME, and only the listing knows whether a name is taken
    // twice. An empty listing answers nothing, which is the loading screen
    // below rather than a wrong journal.
    const folders = journals ? journals.map((journal) => journal.folder) : []
    const openId = resolve(folders, restOf(route))
    const open = openId ? journals.find((entry) => entry.id === openId) : null

    // The shell draws the breadcrumb; this view only says where it is. `[]` on
    // the shelf is not a no-op: the trail is cleared on every navigation, so a
    // screen with nothing to add must SAY nothing rather than leave the last
    // journal's name standing under the app's tile.
    useEffect(() => {
      api.trail(open ? [{ label: open.title, route: routeOf(folders, open.folder) }] : [])
    }, [open?.id, open?.title])

    if (error && !journals) return h('p', { className: 'journal-problem' }, error)
    if (!journals) return h('p', { className: 'journal-muted' }, t('Loading…'))

    return open
      ? h(One, { journal: open, reload, error, setError })
      : h(All, { journals, reload, error, setError })
  }

  /** The shelf: every journal, finished ones folded away. */
  function All({ journals, reload, error, setError }) {
    const [draft, setDraft] = useState({ title: '', ico: '' })
    const [saving, setSaving] = useState(false)

    const live = journals.filter((journal) => !journal.finished)
    const archived = journals.filter((journal) => journal.finished)

    const create = async (event) => {
      event.preventDefault()
      const title = draft.title.trim()
      if (!title || saving) return
      setSaving(true)
      try {
        const taken = new Set(journals.map((journal) => journal.id))
        const base = `${HOME}/${slugify(title)}`
        let folder = base
        for (let suffix = 2; taken.has(folder); suffix += 1) folder = `${base}-${suffix}`

        const write = await put(`${folder}/INDEX.md`, journalMarkdown({ title, ico: draft.ico }))
        if (write.status === 409) {
          throw new Error(t('another author just took that name — try again'))
        }
        if (!write.ok) throw new Error(`${t('could not write that entry')} (${write.status})`)
        setDraft({ title: '', ico: '' })
        setError(null)
        await reload()
        location.hash = routeOf(known, folder)
      } catch (cause) {
        setError(cause.message)
      }
      setSaving(false)
    }

    const card = (journal) =>
      h(
        'li',
        { key: journal.id },
        h(
          'a',
          { className: 'journal-card', href: `#${routeOf(known, journal.folder)}` },
          [
            h('span', { key: 'i', className: 'journal-card__icon' }, journal.ico ?? '📓'),
            h('span', { key: 'n', className: 'journal-card__name' }, journal.title),
            h(
              'span',
              { key: 'c', className: 'journal-muted' },
              journal.entries.length === 0
                ? t('Nothing written yet.')
                : `${journal.entries.length} ${
                    journal.entries.length === 1 ? t('entry') : t('entries')
                  } · ${formatWhen(journal.entries[0].when, api.locale)}`,
            ),
          ],
        ),
      )

    return h('section', { className: 'journal' }, [
      h('header', { key: 'h', className: 'journal__head' }, [h('h2', { key: 't' }, t('Journals'))]),
      error && h('p', { key: 'e', className: 'journal-problem' }, error),

      live.length === 0
        ? h('p', { key: 'z', className: 'journal-muted' }, t('No journal yet.'))
        : h('ul', { key: 'l', className: 'journal-shelf' }, live.map(card)),

      // The core's own verdict on whether a page's life is over, never a table
      // of statuses copied in here — that is the one thing guaranteed to drift.
      archived.length > 0 &&
        h('details', { key: 'a', className: 'journal-archive', open: live.length === 0 }, [
          h('summary', { key: 's' }, `🗄 ${archived.length}`),
          h('ul', { key: 'l', className: 'journal-shelf' }, archived.map(card)),
        ]),

      h('form', { key: 'f', className: 'journal-new', onSubmit: create }, [
        h(
          'p',
          { key: 'p', className: 'journal-muted' },
          t('A journal is a folder of entries. Ask the agent for one, or name it here.'),
        ),
        h('div', { key: 'r', className: 'journal-new__row' }, [
          h('input', {
            key: 'i',
            className: 'journal-new__ico',
            value: draft.ico,
            maxLength: 4,
            placeholder: '📓',
            'aria-label': 'ico',
            onChange: (event) => setDraft({ ...draft, ico: event.target.value }),
          }),
          h('input', {
            key: 'n',
            className: 'journal-new__title',
            value: draft.title,
            placeholder: t('Name of the journal'),
            'aria-label': t('Name of the journal'),
            onChange: (event) => setDraft({ ...draft, title: event.target.value }),
          }),
          h(
            'button',
            { key: 'b', type: 'submit', className: 'journal-button', disabled: saving },
            t('Create'),
          ),
        ]),
      ]),
    ])
  }

  /** One journal: capture at the top, the history under it. */
  function One({ journal, reload, error, setError }) {
    const [draft, setDraft] = useState({ title: '', body: '' })
    const [saving, setSaving] = useState(false)
    const [shown, setShown] = useState(PAGE)

    // A different journal starts at its own top rather than inheriting how far
    // somebody had scrolled into the last one.
    useEffect(() => {
      setShown(PAGE)
    }, [journal.id])

    const visible = useMemo(() => journal.entries.slice(0, shown), [journal.entries, shown])

    const add = async (event) => {
      event.preventDefault()
      const body = draft.body.trim()
      if (!body || saving) return
      setSaving(true)
      try {
        const now = new Date()
        const taken = journal.entries.map((entry) => entry.path)
        const path = newEntryPath(journal.folder, now, taken)
        const markdown = entryMarkdown({ when: stamp(now), title: draft.title, body })

        let write = await put(path, markdown)
        if (write.status === 409) {
          // Somebody — or something — wrote that minute while this form was
          // open. Take the next name rather than the other author's entry.
          write = await put(newEntryPath(journal.folder, now, [...taken, path]), markdown)
        }
        if (write.status === 409) {
          throw new Error(t('another author just took that name — try again'))
        }
        if (!write.ok) throw new Error(`${t('could not write that entry')} (${write.status})`)

        setDraft({ title: '', body: '' })
        setError(null)
      } catch (cause) {
        setError(cause.message)
      }
      setSaving(false)
      await reload()
    }

    return h('section', { className: 'journal' }, [
      h(
        'a',
        { key: 'b', className: 'journal-back', href: '#/journal' },
        `‹ ${t('Journals')}`,
      ),
      h('header', { key: 'h', className: 'journal__head' }, [
        h('h2', { key: 't' }, `${journal.ico ?? '📓'} ${journal.title}`),
        journal.description && h('p', { key: 'd', className: 'journal-muted' }, journal.description),
      ]),
      error && h('p', { key: 'e', className: 'journal-problem' }, error),

      h('form', { key: 'f', className: 'journal-new', onSubmit: add }, [
        h('input', {
          key: 't',
          className: 'journal-new__title',
          value: draft.title,
          placeholder: t('Title (optional)'),
          'aria-label': t('Title (optional)'),
          onChange: (event) => setDraft({ ...draft, title: event.target.value }),
        }),
        h('textarea', {
          key: 'b',
          className: 'journal-new__body',
          value: draft.body,
          rows: 3,
          placeholder: t('What happened?'),
          'aria-label': t('What happened?'),
          onChange: (event) => setDraft({ ...draft, body: event.target.value }),
        }),
        h(
          'button',
          { key: 's', type: 'submit', className: 'journal-button', disabled: saving },
          t('Add'),
        ),
      ]),

      journal.entries.length === 0
        ? h('p', { key: 'z', className: 'journal-muted' }, t('Nothing written yet.'))
        : h(
            'ol',
            { key: 'l', className: 'journal-history' },
            visible.map((entry) =>
              h('li', { key: entry.id, className: 'journal-entry' }, [
                h('header', { key: 'h', className: 'journal-entry__head' }, [
                  h(
                    'time',
                    { key: 'w', className: 'journal-entry__when' },
                    formatWhen(entry.when, api.locale),
                  ),
                  entry.title && h('h3', { key: 't', className: 'journal-entry__title' }, entry.title),
                ]),
                // The shell's editor, one per entry: reading posture until its
                // own ✎ is pressed, and its own revision against an agent that
                // writes without warning.
                h(api.PageEditor, { key: 'e', path: entry.path, onSaved: reload }),
              ]),
            ),
          ),

      shown < journal.entries.length &&
        h(
          'button',
          { key: 'm', type: 'button', className: 'journal-more', onClick: () => setShown(shown + PAGE) },
          `${t('Show more')} · ${journal.entries.length - shown}`,
        ),
    ])
  }

  /**
   * Which of this plugin's screens a workspace folder opens on.
   *
   * `absorbs` says the `journal` folder is this app's business; it cannot say
   * WHERE a particular journal inside it is reached, because that is a name
   * this plugin resolves and the shell has no way of knowing. Without an
   * answer, every link INTO a journal — the breadcrumb out of one of its
   * entries, a bookmark, a target the agent wrote — landed on the generic
   * list of files, from a screen that exists precisely because a journal is
   * not one.
   *
   * A page deeper than the journal folder still belongs to that journal, so
   * the walk climbs: an entry answers for the journal that holds it.
   */
  function routeFor(path) {
    let candidate = String(path ?? '')
    while (candidate !== '') {
      if (known.includes(candidate)) return routeOf(known, candidate)
      const cut = candidate.lastIndexOf('/')
      if (cut === -1) break
      candidate = candidate.slice(0, cut)
    }
    // The `journal` folder ITSELF is the shell's to answer: `absorbs` makes
    // the tile stand for it, and restating that here would be this plugin
    // describing a rule it does not own.
    return undefined
  }

  return {
    component: Journal,
    route: ROUTE,
    routeFor,
    /**
     * One figure on the tile: what was written last, and where.
     *
     * Asked for by the launcher and answered here, because only this app
     * knows which pages are entries. A slow or failing count costs the chip,
     * never the tile.
     */
    async tileInfo() {
      // The launcher render is also when the listing is worth refreshing: it
      // is the moment the shell draws every link into a journal.
      const journals = (await refresh().catch(() => [])).filter((journal) => !journal.finished)
      const latest = journals
        .flatMap((journal) => journal.entries)
        .sort((a, b) => (a.when < b.when ? 1 : -1))[0]
      if (!latest) return { subtitle: t('No journal yet.') }
      return {
        subtitle: formatWhen(latest.when, api.locale),
        chips: [{ text: `${journals.length}` }],
      }
    },
  }
}
