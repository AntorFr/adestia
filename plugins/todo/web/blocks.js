/**
 * `:::checklist` — tasks inside somebody's page.
 *
 * Why a block of its own rather than a wider `from=` on the core's `list`:
 * what separates two renderings is what you can DO in them, and this one ticks
 * and adds. Reading is a list; writing is a block belonging to whoever owns
 * the data. Ticking a box changes `done:` in ANOTHER page — that is a contract
 * with this plugin, not a drawing.
 *
 * And it is named by the action, never by the subject: `:::todo` would name
 * what the tasks are ABOUT, which is the one-block-per-subject drift the
 * closed vocabulary exists to stop.
 *
 * The price, taken knowingly: a contributed block leaves with its plugin, so
 * an instance with todo switched off opens a page carrying one read-only,
 * with a diagnostic. That is the right answer here — a checkbox writing into
 * another file has nothing honest to draw without the plugin that owns it.
 */

import { createElement as h, useCallback, useEffect, useState } from 'react'

import { buildModel, isDeferred, newTaskPath, taskMarkdown, words } from './model.js'
import { storeMarks, taskRow, todayISO, toggleTask } from './rows.js'

/** The folder a logical page path sits in. A page at the root has none. */
const folderOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

/**
 * How far below the folder a task may sit.
 *
 * The words are the core's own cross-cutting ones — `self`, `children`,
 * `subtree` — spoken here before the core serves them, so the day it does this
 * block already speaks the language rather than having to be translated.
 */
function within(taskPath, base, depth) {
  const folder = folderOf(taskPath)
  if (depth === 'self') return folder === base
  if (base === '') return depth === 'children' ? !folder.includes('/') : true
  if (folder === base) return true
  if (!folder.startsWith(`${base}/`)) return false
  return depth === 'children' ? !folder.slice(base.length + 1).includes('/') : true
}

export default function blocks(api) {
  const t = words(api.locale)

  /**
   * The tasks this block is about.
   *
   * TWO ways in, and both are needed. By LOCATION — the folder of the page
   * carrying the block, and what sits under it. And by REFERENCE — a task
   * pointing back with `projet:`, which is the only way to catch the ones
   * captured in a hurry: quick capture files into a single folder, so a task
   * added for this worksite from the app is never under its folder.
   */
  function scope({ tasks, page, attributes }) {
    const depth = attributes.depth ?? 'subtree'
    const base = folderOf(page.path)
    const ids = new Set([page.id, page.fields?.id].filter(Boolean))

    return Object.values(tasks).filter((task) => {
      if (!within(task.path, base, depth) && !(task.projet && ids.has(task.projet))) return false
      if (attributes.assignee && task.assignee !== attributes.assignee) return false
      if (attributes.dom && task.dom !== attributes.dom) return false
      if (attributes.projet && task.projet !== attributes.projet) return false
      return true
    })
  }

  function Checklist({ attributes, path, fields, locate }) {
    const [model, setModel] = useState(null)
    const [error, setError] = useState(null)
    const [title, setTitle] = useState('')
    const [saving, setSaving] = useState(false)
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
     * Where the block IS.
     *
     * `page=` names another one, relative or absolute, and `locate` turns it
     * into the workspace's own spelling — the same resolution a link gets.
     * Absent, it is this page, handed over by the shell: deriving it from a
     * relative path answers `.` for a page at the root, which is a scope that
     * matches nothing and says so to nobody.
     */
    const target =
      attributes.page && path !== undefined
        ? { path: `${locate(attributes.page)}.md`, id: locate(attributes.page), fields: undefined }
        : { path: path ?? '', id: (path ?? '').replace(/\.md$/, ''), fields }

    const add = useCallback(
      async (event) => {
        event.preventDefault()
        const wanted = title.trim()
        if (!wanted || saving || !model) return
        setSaving(true)
        try {
          // Filed WHERE THE BLOCK IS, which is what "add a task here" means —
          // and stamped with the page's id when it has one, so moving the task
          // later does not take it out of this list.
          const folder = folderOf(target.path)
          const projet = target.fields?.id
          const markdown = taskMarkdown({ title: wanted })
          const stamped = projet ? markdown.replace('\n---\n', `\nprojet: ${projet}\n---\n`) : markdown
          const write = await api.fetch(
            `/api/pages/${newTaskPath(folder, wanted, Object.keys(model.tasks))}`,
            {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ markdown: stamped }),
            },
          )
          if (!write.ok) throw new Error(`${t('could not create that task')} (${write.status})`)
          setTitle('')
          setError(null)
        } catch (cause) {
          setError(cause.message)
        }
        setSaving(false)
        await reload()
      },
      [model, saving, target.path, target.fields, title, reload],
    )

    if (error && !model) return h('p', { className: 'todo-block todo-problem' }, error)
    if (!model) return h('p', { className: 'todo-block todo-muted' }, t('Loading…'))

    const storeOf = storeMarks(model.stores)
    const found = scope({ tasks: model.tasks, page: target, attributes })
    const view = attributes.view ?? 'open'
    const shown = found
      .filter((task) => {
        if (view === 'all') return true
        if (task.done) return false
        if (view === 'later') return isDeferred(task, day)
        if (isDeferred(task, day)) return false
        if (view === 'late') return task.due && task.due < day
        if (view === 'today') return task.due === day
        return true
      })
      .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))

    return h('div', { className: 'todo-block' }, [
      h('div', { key: 'h', className: 'todo-block__h' }, [
        t('Tasks here'),
        h(
          'span',
          { key: 's' },
          attributes.page ? t('from %n', { n: attributes.page }) : t('this folder and below'),
        ),
      ]),
      error && h('p', { key: 'e', className: 'todo-problem' }, error),
      ...(shown.length === 0
        ? [h('p', { key: 'z', className: 'todo-muted' }, t('nothing to do here'))]
        : [
            h(
              'ul',
              { key: 'l', className: 'todo-list' },
              shown.map((task) =>
                taskRow(h, { task, t, locale: api.locale, day, onToggle: toggle, storeOf }),
              ),
            ),
          ]),
      // Adding is half of why this is a block and not a list. Only where the
      // block knows its own page: a checklist reading somebody else's folder
      // offers no button, because "here" would be a lie.
      !attributes.page &&
        path !== undefined &&
        h('form', { key: 'a', className: 'todo-block__add', onSubmit: add }, [
          h('span', { key: 'p', 'aria-hidden': 'true' }, '＋'),
          h('input', {
            key: 'i',
            value: title,
            placeholder: t('Add a task here…'),
            'aria-label': t('Add a task here…'),
            disabled: saving,
            onChange: (event) => setTitle(event.target.value),
          }),
        ]),
    ])
  }

  return { tags: { checklist: Checklist } }
}
