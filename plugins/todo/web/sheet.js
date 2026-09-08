/**
 * One task, in full.
 *
 * The screen this app never had, and without which "a note" and "some
 * documents" have nowhere to go. A list row is a SYNTHESIS — a title, a date,
 * a face; this is the DETAIL, and the two levels are the whole answer to
 * "where do I read the rest of it".
 *
 * It borrows rather than invents. The note is the shell's own page editor, so
 * writing here is writing on `#/page/…`: same posture, same revision, same
 * refusal when the agent got there first. The fields are written with the same
 * in-place surgery a tick uses.
 */

import { createElement as h, useCallback, useEffect, useState } from 'react'

import { assigneesOf, setField } from './model.js'
import { check, shortDate, todayISO } from './rows.js'

export function makeSheet(api, t) {
  const PageEditor = api.PageEditor

  /**
   * Editing one field.
   *
   * Read-then-write against the revision, like every other write in this
   * plugin: the agent may have rewritten the page while the sheet was open,
   * and a form that overwrote it would be the one place where a person's
   * convenience costs somebody else's work.
   */
  async function writeField(task, key, value) {
    const read = await api.fetch(`/api/pages/${task.path}`)
    if (!read.ok) throw new Error(t('that task no longer exists'))
    const page = await read.json()
    const markdown = setField(page.markdown, key, value)
    if (!markdown) throw new Error(t('that task has no frontmatter'))

    const write = await api.fetch(`/api/pages/${task.path}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ markdown, revision: page.revision }),
    })
    if (write.status === 409) throw new Error(t('the agent changed that task — reloading'))
    if (!write.ok) throw new Error(`${t('could not save')} (${write.status})`)
  }

  /** One editable cell: a label, and the control that changes it. */
  function Field({ label, children }) {
    return h('div', { className: 'todo-field' }, [
      h('em', { key: 'l' }, label),
      h('div', { key: 'v', className: 'todo-field__v' }, children),
    ])
  }

  function Sheet({ task, model, onBack, onChanged, onOpenTask }) {
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)
    const locale = api.locale
    const day = todayISO()

    // The trail is the shell's, drawn once, above everything — a plugin that
    // painted its own would put two breadcrumbs on one screen.
    useEffect(() => {
      api.trail([{ label: task.title }])
      return () => api.trail([])
    }, [task.title])

    const edit = useCallback(
      async (key, value) => {
        setBusy(true)
        try {
          await writeField(task, key, value)
          setError(null)
        } catch (cause) {
          setError(cause.message)
        }
        setBusy(false)
        await onChanged()
      },
      [task, onChanged],
    )

    const people = assigneesOf(Object.values(model.tasks))
    const domains = [...new Set(Object.values(model.tasks).map((one) => one.dom).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b),
    )

    const dateField = (label, key, value) =>
      h(
        Field,
        { label },
        h('input', {
          type: 'date',
          className: 'todo-input',
          value: value ?? '',
          disabled: busy,
          'aria-label': label,
          onChange: (event) => void edit(key, event.target.value),
        }),
      )

    const pickField = (label, key, value, options, none) =>
      h(
        Field,
        { label },
        h(
          'select',
          {
            className: 'todo-input',
            value: value ?? '',
            disabled: busy,
            'aria-label': label,
            onChange: (event) => void edit(key, event.target.value),
          },
          [
            h('option', { key: '', value: '' }, none),
            ...options.map((option) => h('option', { key: option, value: option }, option)),
          ],
        ),
      )

    const children = (task.sub ?? []).map((id) => model.tasks[id]).filter(Boolean)
    const files = task.files ?? []

    return h('section', { className: 'todo todo-sheet' }, [
      /**
       * The way back sits IN the header, not above it.
       *
       * The shell draws its own « Back » in the canvas, and a second button
       * stacked under it read as two of the same control — seen in the bench
       * before it was written down. They are not the same: the shell's walks
       * the browser's history, which leaves the app entirely, while this one
       * closes a screen the app holds in its own state.
       */
      h('header', { key: 'h', className: 'todo-sheet__head' }, [
        h(
          'button',
          { key: 'b', type: 'button', className: 'todo-back', onClick: onBack, 'aria-label': t('Back') },
          '‹',
        ),
        check(h, { done: task.done, onToggle: () => void edit('done', task.done ? '' : day), label: task.title }),
        h('h2', { key: 't' }, task.title),
        task.done &&
          h('span', { key: 's', className: 'todo-stat todo-stat--done' }, `${t('Done')} ${shortDate(task.doneOn, locale, t, day)}`),
      ]),

      error && h('p', { key: 'e', className: 'todo-problem' }, error),

      h('div', { key: 'f', className: 'todo-panel' }, [
        h('div', { key: 'g', className: 'todo-fields' }, [
          dateField(t('Due on'), 'due', task.due),
          dateField(t('Not before'), 'start', task.start),
          pickField(t('Assignee'), 'assignee', task.assignee, people, t('Unassigned')),
          pickField(t('Domain'), 'dom', task.dom, domains, t('No domain')),
          task.projet &&
            h(
              Field,
              { key: 'p', label: t('Project') },
              h(
                'a',
                { className: 'todo-link', href: `#/page/${encodeURIComponent(task.projet)}` },
                `${task.projet} ↗`,
              ),
            ),
        ]),
      ]),

      /**
       * The note.
       *
       * The shell's editor, mounted here rather than reimplemented: a plugin
       * with its own textarea would be a plugin with its own idea of what a
       * save means, and this page is co-written by an agent that does not ask
       * permission. `attachments` stays off — a task's documents are the ones
       * it CITES, and the files sitting in the shared todo folder belong to
       * nobody in particular.
       */
      h('div', { key: 'n', className: 'todo-panel' }, [
        h('h3', { key: 'h', className: 'todo-panel__h' }, t('Note')),
        h(PageEditor, { key: 'e', path: task.path, onSaved: () => void onChanged() }),
      ]),

      files.length > 0 &&
        h('div', { key: 'a', className: 'todo-panel' }, [
          h('h3', { key: 'h', className: 'todo-panel__h' }, `${t('Attachments')} · ${files.length}`),
          h(
            'ul',
            { key: 'l', className: 'todo-files' },
            files.map((file) =>
              h(
                'li',
                { key: file },
                h('a', { className: 'todo-file', href: `/api/files/${encodeURI(file)}` }, [
                  h('span', { key: 'n', className: 'todo-file__n' }, file.split('/').pop()),
                  h('span', { key: 'w', className: 'todo-file__w' }, `↗ ${file.split('/').slice(0, -1).join('/')}/`),
                ]),
              ),
            ),
          ),
        ]),

      children.length > 0 &&
        h('div', { key: 's', className: 'todo-panel' }, [
          h(
            'h3',
            { key: 'h', className: 'todo-panel__h' },
            `${t('Subtasks')} · ${children.filter((one) => one.done).length} / ${children.length}`,
          ),
          h(
            'ul',
            { key: 'l', className: 'todo-subs' },
            children.map((child) =>
              h('li', { key: child.id, className: child.done ? 'todo-sub todo-sub--done' : 'todo-sub' }, [
                check(h, {
                  done: child.done,
                  onToggle: () => void onOpenTask(child, 'toggle'),
                  label: child.title,
                }),
                h(
                  'button',
                  { key: 't', type: 'button', className: 'todo-sub__t', onClick: () => onOpenTask(child, 'open') },
                  child.title,
                ),
              ]),
            ),
          ),
        ]),

      h(
        'a',
        { key: 'o', className: 'todo-sheet__page', href: `#/page/${encodeURIComponent(task.id)}` },
        `${t('Open')} ↗`,
      ),
    ])
  }

  return Sheet
}
