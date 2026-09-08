import { createElement as h, useCallback, useEffect, useMemo, useState } from 'react'

import {
  assigneesOf,
  buildModel,
  dynamicLists,
  isDeferred,
  meOf,
  newTaskPath,
  resolveList,
  taskFolder,
  taskMarkdown,
  words,
} from './model.js'
import { storeMarks, taskRow, todayISO, toggleTask } from './rows.js'
import { makeSheet } from './sheet.js'

/**
 * The domain menu's one non-domain entry.
 *
 * A sentinel rather than an empty string, which already means "no domain".
 * Two colons because it must not collide with a real domain and must stay
 * printable: a control character in an option value is a value that breaks
 * whatever reads the DOM next.
 */
const NEW_DOMAIN = '::new'

/** The facet values that are not a person's handle. */
const ANYONE = '::all'
const NOBODY = '::free'

export default function view(api) {
  const t = words(api.locale)

  function Todo() {
    const [model, setModel] = useState(null)
    const [me, setMe] = useState(null)
    const [openList, setOpenList] = useState('open')
    const [openTask, setOpenTask] = useState(null)
    const [who, setWho] = useState(ANYONE)
    const [error, setError] = useState(null)
    const [draft, setDraft] = useState({ title: '', due: '', start: '', dom: '', assignee: '' })
    const [detailed, setDetailed] = useState(false)
    const [saving, setSaving] = useState(false)
    /** The last task captured here, kept only to offer its page. */
    const [created, setCreated] = useState(null)
    /** Typing a domain the base does not have yet. */
    const [naming, setNaming] = useState(false)

    const day = todayISO()

    const reload = useCallback(async () => {
      try {
        const response = await api.fetch('/api/pages/index')
        if (!response.ok) throw new Error(`the page index answered ${response.status}`)
        const { entries, stores } = await response.json()
        setModel(buildModel(entries, stores ?? []))
      } catch (cause) {
        setError(cause.message)
      }
    }, [])

    useEffect(() => {
      void reload()
    }, [reload])

    /**
     * Who is at this screen.
     *
     * Asked of the shell rather than assumed, and only once. An instance with
     * real accounts answers per visitor; an ungated one names nobody, and the
     * settings page then has the last word — see `meOf`.
     */
    useEffect(() => {
      let cancelled = false
      void (async () => {
        const response = await api.fetch('/api/instance').catch(() => undefined)
        if (!response?.ok || cancelled) return
        const { user } = await response.json()
        if (!cancelled) setMe(user ?? null)
      })()
      return () => {
        cancelled = true
      }
    }, [])

    const toggle = useCallback(
      async (task) => {
        try {
          await toggleTask(api, task)
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
     * cannot say — a body, a priority, documents — is said on the sheet, which
     * is the whole reason this form can exist: a form is a poor author only
     * when it is the LAST word.
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
        const markdown = taskMarkdown({
          title,
          due: draft.due,
          start: draft.start,
          dom: draft.dom.trim(),
          assignee: draft.assignee,
        })
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

          setDraft({ title: '', due: '', start: '', dom: '', assignee: '' })
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

    const mine = useMemo(() => (model ? meOf(model.config, me) : null), [model, me])
    const storeOf = useMemo(() => storeMarks(model?.stores), [model])

    if (error && !model) return h('p', { className: 'todo-problem' }, error)
    if (!model) return h('p', { className: 'todo-muted' }, t('Loading…'))

    const Sheet = sheetOf(api, t)
    if (openTask && model.tasks[openTask]) {
      return h(Sheet, {
        task: model.tasks[openTask],
        model,
        onBack: () => setOpenTask(null),
        onChanged: reload,
        onOpenTask: (child, how) => (how === 'toggle' ? void toggle(child) : setOpenTask(child.id)),
      })
    }

    const all = Object.values(model.tasks)
    const people = assigneesOf(all)

    /** The facet, applied before anything is grouped or counted. */
    const kept = (tasks) =>
      who === ANYONE
        ? tasks
        : who === NOBODY
          ? tasks.filter((task) => !task.assignee)
          : tasks.filter((task) => task.assignee === who)

    const dynamic = dynamicLists(model.tasks, t, day)
    const curated = Object.values(model.lists).map((list) => resolveList(list, model.tasks))
    const current = [...dynamic, ...curated].find((list) => list.id === openList) ?? dynamic[3]

    const row = (task) =>
      taskRow(h, { task, t, locale: api.locale, day, onToggle: toggle, onOpen: (one) => setOpenTask(one.id), storeOf })

    const group = (title, tasks, hot) =>
      tasks.length === 0
        ? null
        : h('div', { key: title, className: 'todo-group' }, [
            h('h3', { key: 'h', className: `todo-group__h${hot ? ' todo-group__h--hot' : ''}` }, title),
            h('ul', { key: 'l', className: 'todo-list' }, tasks.map(row)),
          ])

    /**
     * The default view reads as a day, not as a database.
     *
     * Grouped by urgency rather than listed flat, because "what is late" and
     * "what is due Friday" are two different requests and a single ordered
     * list makes the reader do the sorting. Any other view is flat: it was
     * chosen precisely to be one thing.
     */
    const body =
      current.id === 'open'
        ? [
            group(t('Overdue'), kept(current.tasks.filter((task) => task.due && task.due < day)), true),
            group(t('Today'), kept(current.tasks.filter((task) => task.due === day))),
            group(
              t('This week'),
              kept(current.tasks.filter((task) => task.due && task.due > day && task.due <= plusWeek(day))),
            ),
            group(
              t('Beyond'),
              kept(current.tasks.filter((task) => !task.due || task.due > plusWeek(day))),
            ),
          ]
        : [
            kept(current.tasks).length === 0
              ? h('p', { key: 'z', className: 'todo-muted' }, t('Nothing here.'))
              : h('ul', { key: 'l', className: 'todo-list' }, kept(current.tasks).map(row)),
          ]

    const later = dynamic.find((list) => list.id === 'later').tasks
    const closed = all.filter((task) => task.done && task.doneOn && task.doneOn >= minusWeek(day))

    const openCount = kept(all.filter((task) => !task.done && !isDeferred(task, day))).length
    const lateCount = kept(
      all.filter((task) => !task.done && !isDeferred(task, day) && task.due && task.due < day),
    ).length

    const domains = [...new Set(all.map((task) => task.dom).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    )

    const facet = (value, label, extra) =>
      h(
        'button',
        {
          key: value,
          type: 'button',
          className: `todo-chip${who === value ? ' todo-chip--on' : ''}${extra ?? ''}`,
          'aria-pressed': who === value,
          onClick: () => setWho(value),
        },
        label,
      )

    return h('section', { className: 'todo' }, [
      h('header', { key: 'h', className: 'todo__head' }, [
        h('span', { key: 'p', className: 'todo__plate' }, '☑'),
        h('div', { key: 'n' }, [
          h('h2', { key: 't' }, t('Todo')),
          h('p', { key: 's', className: 'todo__lede' }, [
            t('%open to do', { open: openCount }),
            lateCount > 0 && h('em', { key: 'l' }, ` · ${t('%n late', { n: lateCount })}`),
            later.length > 0 && ` · ${t('%n later', { n: later.length })}`,
          ]),
        ]),
      ]),

      /**
       * Quick capture.
       *
       * Title first and alone under the Enter key, because that is the
       * gesture: a task remembered on a staircase is a sentence, and asking
       * for a date before it is written loses it. The rest opens only when
       * asked for — a form that shows five fields to capture one line is a
       * form people stop using.
       */
      h(
        'form',
        { key: 'new', className: `todo-new${detailed ? ' todo-new--open' : ''}`, onSubmit: capture },
        [
          h('div', { key: 'line', className: 'todo-new__line' }, [
            h('span', { key: 'p', className: 'todo-new__plus', 'aria-hidden': 'true' }, '＋'),
            h('input', {
              key: 't',
              className: 'todo-new__title',
              value: draft.title,
              placeholder: t('New task'),
              'aria-label': t('New task'),
              onChange: (event) => setDraft({ ...draft, title: event.target.value }),
            }),
            h(
              'button',
              {
                key: 'm',
                type: 'button',
                className: 'todo-new__more',
                'aria-expanded': detailed,
                onClick: () => setDetailed(!detailed),
              },
              `${t('Details')} ${detailed ? '⌃' : '⌄'}`,
            ),
          ]),

          detailed &&
            h('div', { key: 'row', className: 'todo-new__row' }, [
              h('label', { key: 's', className: 'todo-ctl' }, [
                h('em', { key: 'l' }, t('Not before')),
                h('input', {
                  key: 'i',
                  type: 'date',
                  value: draft.start,
                  'aria-label': t('Start date'),
                  onChange: (event) => setDraft({ ...draft, start: event.target.value }),
                }),
              ]),
              h('label', { key: 'd', className: 'todo-ctl' }, [
                h('em', { key: 'l' }, t('Due on')),
                h('input', {
                  key: 'i',
                  type: 'date',
                  value: draft.due,
                  'aria-label': t('Due date'),
                  onChange: (event) => setDraft({ ...draft, due: event.target.value }),
                }),
              ]),
              h('label', { key: 'a', className: 'todo-ctl' }, [
                h('em', { key: 'l' }, t('Assignee')),
                h(
                  'select',
                  {
                    key: 'i',
                    value: draft.assignee,
                    'aria-label': t('Assignee'),
                    onChange: (event) => setDraft({ ...draft, assignee: event.target.value }),
                  },
                  [
                    h('option', { key: '', value: '' }, t('Unassigned')),
                    ...withMe(people, mine).map((one) => h('option', { key: one, value: one }, one)),
                  ],
                ),
              ]),
              /**
               * The domain, PICKED rather than typed.
               *
               * A domain is a vocabulary the base already has, and typing into
               * a free field is how "atelier" acquires a twin called "Atelier"
               * on a tired evening — two groups on the everything view for one
               * place in the house. A base with no domain yet has nothing to
               * choose from, and a menu of one option saying "new…" is a worse
               * text field: it falls back to typing until there is something
               * to pick.
               */
              h('label', { key: 'm', className: 'todo-ctl' }, [
                h('em', { key: 'l' }, t('Domain')),
                domains.length === 0 || naming
                  ? h('input', {
                      key: 'i',
                      value: draft.dom,
                      placeholder: t('Domain'),
                      'aria-label': t('Domain'),
                      autoFocus: naming,
                      onChange: (event) => setDraft({ ...draft, dom: event.target.value }),
                    })
                  : h(
                      'select',
                      {
                        key: 'i',
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
                        h('option', { key: '', value: '' }, t('No domain')),
                        ...domains.map((dom) => h('option', { key: dom, value: dom }, dom)),
                        h('option', { key: 'new', value: NEW_DOMAIN }, t('New domain…')),
                      ],
                    ),
              ]),
              h(
                'button',
                {
                  key: 'b',
                  type: 'submit',
                  className: 'todo-new__add',
                  disabled: !draft.title.trim() || saving,
                },
                t('Add'),
              ),
            ]),
        ],
      ),

      // Offered, never forced: the task is already filed and shown below.
      // This is only for the times the rest of it is in the writer's head now.
      created &&
        h(
          'a',
          { key: 'open', className: 'todo-new__open', href: `#/page/${encodeURIComponent(created.replace(/\.md$/, ''))}` },
          `${t('Open')} ↗`,
        ),

      error && h('p', { key: 'e', className: 'todo-problem' }, error),

      h(
        'div',
        { key: 'rail', className: 'todo-rail' },
        [...dynamic, ...curated]
          .filter((list) => list.id !== 'later')
          .map((list) =>
            h(
              'button',
              {
                key: list.id,
                type: 'button',
                className: [
                  'todo-rail__b',
                  current.id === list.id ? 'todo-rail__b--on' : '',
                  list.id === 'late' && list.tasks.length > 0 ? 'todo-rail__b--hot' : '',
                ]
                  .filter(Boolean)
                  .join(' '),
                'aria-pressed': current.id === list.id,
                onClick: () => setOpenList(list.id),
              },
              [
                list.curated ? `${list.icon} ${list.title}` : list.title,
                h('i', { key: 'n' }, String(kept(list.tasks).length)),
              ],
            ),
          ),
      ),

      // The facet exists because a shared circle makes "whose is this" the
      // question the list cannot answer by itself.
      (people.length > 0 || mine) &&
        h('div', { key: 'facets', className: 'todo-facets' }, [
          h('em', { key: 'l' }, t('Who')),
          facet(ANYONE, t('Everyone')),
          mine && facet(mine, t('Mine')),
          ...people.filter((one) => one !== mine).map((one) => facet(one, one)),
          facet(NOBODY, t('Unassigned'), ' todo-chip--dash'),
        ]),

      ...body,

      later.length > 0 &&
        h(
          'details',
          { key: 'later', className: 'todo-fold' },
          [
            h('summary', { key: 's' }, `${t('Later')} · ${kept(later).length}`),
            h('ul', { key: 'l', className: 'todo-list' }, kept(later).map(row)),
          ],
        ),

      closed.length > 0 &&
        h(
          'details',
          { key: 'done', className: 'todo-fold' },
          [
            h('summary', { key: 's' }, `${t('Done this week')} · ${kept(closed).length}`),
            h('ul', { key: 'l', className: 'todo-list' }, kept(closed).map(row)),
          ],
        ),
    ])
  }

  /**
   * What the launcher tile says without opening the app.
   *
   * The same index the view reads, through the same model — so a tile can
   * never disagree with the screen it opens. Deferred tasks are not counted:
   * a task nobody can start is not a request. Overdue is the one figure worth
   * colouring, being the only one that IS a request rather than a fact.
   */
  async function tileInfo() {
    const response = await api.fetch('/api/pages/index')
    if (!response.ok) return undefined
    const { entries, stores } = await response.json()
    const { tasks } = buildModel(entries, stores ?? [])
    const day = todayISO()
    const open = Object.values(tasks).filter((task) => !task.done && !isDeferred(task, day))
    const late = open.filter((task) => task.due && task.due < day).length
    const free = open.filter((task) => !task.assignee).length

    return {
      chips: [
        { text: t('%open to do', { open: open.length }) },
        ...(late > 0 ? [{ text: t('%n late', { n: late }), hot: true }] : []),
        ...(late === 0 && free > 0 ? [{ text: t('%n unassigned', { n: free }), hot: true }] : []),
      ],
    }
  }

  return { component: Todo, tileInfo }
}

/** Built once per view factory, not once per render. */
let sheet
const sheetOf = (api, t) => (sheet ??= makeSheet(api, t))

/** "Me" belongs in the menu even before I have been given anything. */
const withMe = (people, mine) =>
  mine && !people.includes(mine) ? [mine, ...people].sort((a, b) => a.localeCompare(b)) : people

const plusWeek = (iso) => shift(iso, 7)
const minusWeek = (iso) => shift(iso, -7)

function shift(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
