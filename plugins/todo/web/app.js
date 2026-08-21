import { createElement as h, useCallback, useEffect, useState } from 'react'

import {
  buildModel,
  byDomain,
  dynamicLists,
  progressOf,
  resolveList,
  toggleDone,
} from './model.js'

export default function view(api) {
  return function Todo() {
    const [model, setModel] = useState(null)
    const [openList, setOpenList] = useState(null)
    const [error, setError] = useState(null)

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

    if (error && !model) return h('p', { className: 'todo-problem' }, error)
    if (!model) return h('p', { className: 'todo-muted' }, 'Loading…')

    const dynamic = dynamicLists(model.tasks)
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
              ? `${open} to do · curated by reference`
              : `${open} to do · a live query, nothing to maintain`,
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
          h('span', { key: 'c', className: 'todo-card__count' }, `${open} to do`),
        ]),
      )
    }

    const allTasks = Object.values(model.tasks)

    return h('section', { className: 'todo' }, [
      h('header', { key: 'h', className: 'todo__head' }, [
        h('h2', { key: 't' }, '☑ Todo'),
        h(
          'span',
          { key: 's', className: 'todo-muted' },
          `${allTasks.filter((t) => !t.done).length} open across ${allTasks.length} tasks`,
        ),
      ]),
      error && h('p', { key: 'e', className: 'todo-problem' }, error),

      h('h3', { key: 'c', className: 'todo-group' }, 'Your lists'),
      curated.length === 0
        ? h(
            'p',
            { key: 'cz', className: 'todo-muted' },
            'No curated list yet — ask the agent for one.',
          )
        : h('ul', { key: 'cl', className: 'todo-cards' }, curated.map((l) => card(l, true))),

      h('h3', { key: 'd', className: 'todo-group' }, 'Live views'),
      h('ul', { key: 'dl', className: 'todo-cards' }, dynamic.map((l) => card(l, false))),

      h('h3', { key: 'g', className: 'todo-group' }, 'Everything, by domain'),
      ...byDomain(allTasks.filter((task) => !task.done)).map((group) =>
        h('div', { key: group.dom, className: 'todo-domain' }, [
          h('h4', { key: 'h' }, group.dom),
          h('ul', { key: 'l', className: 'todo-list' }, group.tasks.map(taskRow)),
        ]),
      ),

      h(
        'button',
        {
          key: 'ask',
          className: 'todo-back',
          // Created through the agent: a task is a page with a contract, and
          // a form that writes one would be a second, poorer author.
          onClick: () => api.ask('Ajoute une tâche : '),
        },
        '＋ Ask for a new task',
      ),
    ])
  }
}
