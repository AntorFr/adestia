import { createElement as h, useCallback, useEffect, useState } from 'react'

import {
  buildModel,
  byDomain,
  dynamicLists,
  newTaskPath,
  progressOf,
  resolveList,
  taskFolder,
  taskMarkdown,
  toggleDone,
  words,
} from './model.js'

/**
 * The domain menu's one non-domain entry.
 *
 * A sentinel rather than an empty string, which already means "no domain".
 * Two colons because it must not collide with a real domain and must stay
 * printable: a control character in an option value is a value that breaks
 * whatever reads the DOM next.
 */
const NEW_DOMAIN = '::new'

export default function view(api) {
  const t = words(api.locale)

  function Todo() {
    const [model, setModel] = useState(null)
    const [openList, setOpenList] = useState(null)
    const [error, setError] = useState(null)
    const [draft, setDraft] = useState({ title: '', due: '', dom: '' })
    const [saving, setSaving] = useState(false)
    /** The last task captured here, kept only to offer its page. */
    const [created, setCreated] = useState(null)
    /** Typing a domain the base does not have yet. */
    const [naming, setNaming] = useState(false)

    const reload = useCallback(async () => {
      try {
        const response = await api.fetch('/api/pages/index')
        if (!response.ok) throw new Error(`the page index answered ${response.status}`)
        const { entries } = await response.json()
        setModel(buildModel(entries))
      } catch (cause) {
        setError(cause.message)
      }
    }, [])

    useEffect(() => {
      void reload()
    }, [reload])

    /**
     * Ticking a task rewrites its page.
     *
     * Read-then-write with the revision, so the conflict machinery that
     * protects a human editor also protects a checkbox: if the agent rewrote
     * the task since the list was loaded, the tick is refused rather than
     * silently overwriting its work.
     */
    const toggle = useCallback(
      async (task) => {
        try {
          const read = await api.fetch(`/api/pages/${task.path}`)
          if (!read.ok) throw new Error('that task no longer exists')
          const page = await read.json()

          const markdown = toggleDone(page.markdown, !task.done)
          if (!markdown) throw new Error('that task has no frontmatter to tick')

          const write = await api.fetch(`/api/pages/${task.path}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ markdown, revision: page.revision }),
          })
          if (write.status === 409) throw new Error('the agent changed that task — reloading')
          if (!write.ok) throw new Error(`could not save (${write.status})`)
          setError(null)
        } catch (cause) {
          setError(cause.message)
        }
        await reload()
      },
      [reload],
    )

    /**
     * Capturing a task by hand.
     *
     * The other author is still the agent, and this does not compete with it:
     * it writes the shortest page the contract allows and stops. What it
     * cannot say — a body, a priority, a parent project — is said in the page
     * editor, which is the whole reason this form can exist now and could not
     * before: a form is a poor author only when it is the LAST word.
     *
     * The write carries no revision, which is precisely the guard: the server
     * refuses a PUT with no revision on a file that already exists, so a
     * collision with something the agent wrote a second ago is a 409 and a
     * second name, never a page silently replaced.
     */
    const capture = useCallback(
      async (event) => {
        event.preventDefault()
        const title = draft.title.trim()
        if (!title || saving) return
        setSaving(true)
        // The previous "open" link goes with the previous capture: left up
        // beside an error, it would offer the wrong page for the right task.
        setCreated(null)

        const folder = taskFolder(model.config, api.locale)
        const markdown = taskMarkdown({ title, due: draft.due, dom: draft.dom.trim() })
        const taken = Object.keys(model.tasks)

        const put = (path) =>
          api.fetch(`/api/pages/${path}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ markdown }),
          })

        try {
          let path = newTaskPath(folder, title, taken)
          let write = await put(path)
          if (write.status === 409) {
            path = newTaskPath(folder, title, [...taken, path.replace(/\.md$/, '')])
            write = await put(path)
          }
          if (write.status === 409) throw new Error(t('another author just took that name — try again'))
          if (!write.ok) throw new Error(`${t('could not create that task')} (${write.status})`)

          setDraft({ title: '', due: '', dom: '' })
          setNaming(false)
          setCreated(path)
          setError(null)
        } catch (cause) {
          setError(cause.message)
        }
        setSaving(false)
        await reload()
      },
      [draft, model, reload, saving],
    )

    if (error && !model) return h('p', { className: 'todo-problem' }, error)
    if (!model) return h('p', { className: 'todo-muted' }, 'Loading…')

    const dynamic = dynamicLists(model.tasks, t)
    const curated = Object.values(model.lists).map((list) => resolveList(list, model.tasks))
    const current =
      openList &&
      [...curated, ...dynamic].find((list) => list.id === openList)

    const taskRow = (task) =>
      h('li', { key: task.id, className: `todo-task${task.done ? ' todo-task--done' : ''}` }, [
        h('input', {
          key: 'c',
          type: 'checkbox',
          checked: task.done,
          onChange: () => void toggle(task),
          'aria-label': task.title,
        }),
        h('span', { key: 't', className: 'todo-task__title' }, task.title),
        task.due &&
          h(
            'span',
            {
              key: 'd',
              className: `todo-chip${
                !task.done && task.due < new Date().toISOString().slice(0, 10) ? ' todo-chip--late' : ''
              }`,
            },
            task.due,
          ),
        task.dom && h('span', { key: 'm', className: 'todo-chip' }, task.dom),
      ])

    if (current) {
      const { open } = progressOf(current.tasks)
      return h('section', { className: 'todo' }, [
        h('button', { key: 'b', className: 'todo-back', onClick: () => setOpenList(null) }, '‹ Lists'),
        h('header', { key: 'h', className: 'todo__head' }, [
          h('h2', { key: 't' }, `${current.icon ?? '⚙'} ${current.title}`),
          h(
            'span',
            { key: 's', className: 'todo-muted' },
            // Said on every list, because the two behave differently and a
            // user who ticks something out of a dynamic view needs to know
            // why it vanished.
            current.curated
              ? `${open} ${t('to do')} · ${t('curated by reference')}`
              : `${open} ${t('to do')} · ${t('a live query, nothing to maintain')}`,
          ),
        ]),
        error && h('p', { key: 'e', className: 'todo-problem' }, error),
        current.tasks.length === 0
          ? h('p', { key: 'z', className: 'todo-muted' }, 'Nothing here.')
          : h('ul', { key: 'l', className: 'todo-list' }, current.tasks.map(taskRow)),
      ])
    }

    const card = (list, isCurated) => {
      const { open, percent } = progressOf(list.tasks)
      return h(
        'li',
        { key: list.id },
        h('button', { className: 'todo-card', onClick: () => setOpenList(list.id) }, [
          h('span', { key: 'i', className: 'todo-card__icon' }, list.icon ?? '⚙'),
          h('span', { key: 'n', className: 'todo-card__name' }, list.title),
          h('span', { key: 'd', className: 'todo-muted' }, list.description ?? ''),
          isCurated &&
            h('span', { key: 'b', className: 'todo-bar' }, h('i', { style: { width: `${percent}%` } })),
          h('span', { key: 'c', className: 'todo-card__count' }, `${open} ${t('to do')}`),
        ]),
      )
    }

    const allTasks = Object.values(model.tasks)
    /** The domains the base already uses — its own vocabulary, sorted. */
    const domains = [...new Set(allTasks.map((task) => task.dom).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    )

    return h('section', { className: 'todo' }, [
      h('header', { key: 'h', className: 'todo__head' }, [
        h('h2', { key: 't' }, '☑ Todo'),
        h(
          'span',
          { key: 's', className: 'todo-muted' },
          `${allTasks.filter((t) => !t.done).length} open across ${allTasks.length} tasks`,
        ),
      ]),
      /**
       * Quick capture.
       *
       * Title first and alone under the Enter key, because that is the
       * gesture: a task remembered on a staircase is a sentence, and asking
       * for a date before it is written loses it. The two fields beside it
       * are the two the list itself displays — a form that offered a field
       * this screen cannot show would be promising something it does not
       * keep.
       */
      h('form', { key: 'new', className: 'todo-new', onSubmit: capture }, [
        h('input', {
          key: 't',
          className: 'todo-new__title',
          value: draft.title,
          placeholder: t('New task'),
          'aria-label': t('New task'),
          onChange: (event) => setDraft({ ...draft, title: event.target.value }),
        }),
        h('input', {
          key: 'd',
          type: 'date',
          className: 'todo-new__field',
          value: draft.due,
          'aria-label': t('Due date'),
          onChange: (event) => setDraft({ ...draft, due: event.target.value }),
        }),
        /**
         * The domain, PICKED rather than typed.
         *
         * A domain is a vocabulary the base already has, and typing into a
         * free field is how "atelier" acquires a twin called "Atelier" on a
         * tired evening — two groups on the everything view for one place in
         * the house. So the existing ones are a list, and inventing one is a
         * deliberate choice at the bottom of it rather than the default
         * gesture.
         *
         * A base with no domain yet has nothing to choose from, and a menu
         * of one option that says "new…" is a worse text field: it falls
         * back to typing until there is something to pick.
         */
        domains.length === 0 || naming
          ? h('input', {
              key: 'm',
              className: 'todo-new__field',
              value: draft.dom,
              placeholder: t('Domain'),
              'aria-label': t('Domain'),
              autoFocus: naming,
              onChange: (event) => setDraft({ ...draft, dom: event.target.value }),
            })
          : h(
              'select',
              {
                key: 'm',
                className: 'todo-new__field',
                value: draft.dom,
                'aria-label': t('Domain'),
                onChange: (event) => {
                  if (event.target.value === NEW_DOMAIN) {
                    setNaming(true)
                    setDraft({ ...draft, dom: '' })
                  } else setDraft({ ...draft, dom: event.target.value })
                },
              },
              [
                // Undomained is a legitimate answer, not an empty field: the
                // everything view has a group for it.
                h('option', { key: '', value: '' }, t('No domain')),
                ...domains.map((dom) => h('option', { key: dom, value: dom }, dom)),
                h('option', { key: 'new', value: NEW_DOMAIN }, t('New domain…')),
              ],
            ),
        h(
          'button',
          { key: 'b', type: 'submit', className: 'todo-new__add', disabled: !draft.title.trim() || saving },
          t('Add'),
        ),
      ]),

      // Offered, never forced: the task is already filed and shown below.
      // This is only for the times the rest of it — a body, a priority — is
      // in the writer's head right now.
      created &&
        h(
          'a',
          { key: 'open', className: 'todo-new__open', href: `#/page/${encodeURIComponent(created)}` },
          `${t('Open')} ↗`,
        ),

      error && h('p', { key: 'e', className: 'todo-problem' }, error),

      h('h3', { key: 'c', className: 'todo-group' }, t('Your lists')),
      curated.length === 0
        ? h(
            'p',
            { key: 'cz', className: 'todo-muted' },
            'No curated list yet — ask the agent for one.',
          )
        : h('ul', { key: 'cl', className: 'todo-cards' }, curated.map((l) => card(l, true))),

      h('h3', { key: 'd', className: 'todo-group' }, t('Live views')),
      h('ul', { key: 'dl', className: 'todo-cards' }, dynamic.map((l) => card(l, false))),

      h('h3', { key: 'g', className: 'todo-group' }, t('Everything, by domain')),
      ...byDomain(allTasks.filter((task) => !task.done), t).map((group) =>
        h('div', { key: group.dom, className: 'todo-domain' }, [
          h('h4', { key: 'h' }, group.dom),
          h('ul', { key: 'l', className: 'todo-list' }, group.tasks.map(taskRow)),
        ]),
      ),
    ])
  }

  /**
   * What the launcher tile says without opening the app.
   *
   * The same index the view reads, through the same model — so a tile can
   * never disagree with the screen it opens. Overdue is the one figure worth
   * colouring: it is the only one that is a request rather than a fact.
   */
  async function tileInfo() {
    const response = await api.fetch('/api/pages/index')
    if (!response.ok) return undefined
    const { entries } = await response.json()
    const { tasks } = buildModel(entries)
    const open = Object.values(tasks).filter((task) => !task.done)
    const today = new Date().toISOString().slice(0, 10)
    const late = open.filter((task) => task.due && task.due < today).length

    return {
      chips: [
        { text: `${open.length} ${t('to do')}` },
        ...(late > 0 ? [{ text: `${late} ${t('late')}`, hot: true }] : []),
      ],
    }
  }

  return { component: Todo, tileInfo }
}
