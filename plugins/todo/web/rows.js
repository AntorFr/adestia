/**
 * The pieces two screens draw the same way.
 *
 * A task appears in the app and inside any page carrying `:::checklist`, and
 * the two must never drift: same row, same checkbox, same colours, and above
 * all the same WRITE. Ticking is a read-modify-write against a revision, and
 * a second copy of it would be a second chance to lose somebody's edit.
 *
 * Presentational functions take `h` rather than importing React themselves —
 * they are called from modules that already have it, and one import map entry
 * per file is one more thing to keep in step.
 */

import { hueOf, initialsOf, isDeferred, toggleDone } from './model.js'

export const todayISO = () => new Date().toISOString().slice(0, 10)

/**
 * A date, as a person reads it.
 *
 * Today and tomorrow are said in words because that is what they are called;
 * everything else is a short date. The year appears only when it is not this
 * one — a list of this week's tasks that repeats "2026" on every line has
 * spent its width on the one thing nobody is wondering about.
 */
export function shortDate(iso, locale, t, day = todayISO()) {
  if (!iso) return ''
  if (iso === day) return t('today')
  const date = new Date(`${iso}T00:00:00Z`)
  const sameYear = iso.slice(0, 4) === day.slice(0, 4)
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/**
 * The box.
 *
 * Drawn rather than native, and it is not decoration: the browser's own
 * checkbox is what made this screen read as a form rather than as a list. A
 * button, so it is reachable by keyboard and announces its own state.
 */
export function check(h, { done, onToggle, label }) {
  return h(
    'button',
    {
      type: 'button',
      className: `todo-box${done ? ' todo-box--on' : ''}`,
      role: 'checkbox',
      'aria-checked': done,
      'aria-label': label,
      onClick: (event) => {
        event.stopPropagation()
        onToggle()
      },
    },
    done ? '✓' : '',
  )
}

/**
 * A face for a handle.
 *
 * Two letters on a derived hue, and the letters are the point: this design
 * system requires every pill to be readable by somebody who cannot separate
 * the colours, so a bare dot would fail. Unassigned is a dashed ring rather
 * than a gap — "nobody has taken this" is a state worth seeing, and it is
 * exactly the one a shared circle produces.
 */
export function avatar(h, { assignee, t, size }) {
  const className = `todo-who${size === 'lg' ? ' todo-who--lg' : ''}`
  if (!assignee) {
    return h(
      'span',
      { className: `${className} todo-who--free`, title: t('Unassigned'), 'aria-label': t('Unassigned') },
      '?',
    )
  }
  return h(
    'span',
    {
      className,
      style: { '--who-color': `var(--adestia-hue-${hueOf(assignee)})` },
      title: assignee,
      'aria-label': assignee,
    },
    initialsOf(assignee),
  )
}

/**
 * The date a row shows, and the one it does not.
 *
 * A deferred task shows WHEN IT WAKES, because its due date is not yet the
 * question. Everything else shows what it owes. Three meanings, three colours
 * — late, today, not yet — all from the closed table, and never colour alone:
 * the words differ too.
 */
function dateChip(h, { task, locale, t, day }) {
  if (isDeferred(task, day)) {
    return h(
      'span',
      { key: 'd', className: 'todo-date todo-date--defer' },
      t('from %d', { d: shortDate(task.start, locale, t, day) }),
    )
  }
  if (!task.due) return null
  const late = !task.done && task.due < day
  const now = task.due === day
  return h(
    'span',
    {
      key: 'd',
      className: `todo-date${late ? ' todo-date--late' : now ? ' todo-date--today' : ''}`,
    },
    shortDate(task.due, locale, t, day),
  )
}

/** Lower is more urgent, and only the two most urgent are worth a mark. */
function priority(h, pri) {
  if (typeof pri !== 'number' || pri > 2) return null
  return h(
    'span',
    { key: 'p', className: `todo-pri${pri <= 1 ? ' todo-pri--hi' : ''}`, 'aria-hidden': 'true' },
    pri <= 1 ? '!!' : '!',
  )
}

/**
 * One task, as a line.
 *
 * `onOpen` is what makes it more than a checkbox: the row leads to the sheet,
 * which is where a note, the documents and the fields it cannot show live.
 * A block that only reads passes none, and the row stays a row.
 */
export function taskRow(h, { task, t, locale, day = todayISO(), onToggle, onOpen, storeOf }) {
  const store = storeOf?.(task.store)
  return h(
    'li',
    {
      key: task.id,
      className: [
        'todo-task',
        task.done ? 'todo-task--done' : '',
        isDeferred(task, day) ? 'todo-task--defer' : '',
        store ? 'todo-task--store' : '',
      ]
        .filter(Boolean)
        .join(' '),
      ...(store ? { style: { '--store-color': `var(--adestia-hue-${store.hue ?? 'gris'})` } } : {}),
    },
    [
      store &&
        h('span', { key: 's', className: 'todo-task__store', title: store.label }, store.mark),
      check(h, { done: task.done, onToggle: () => onToggle(task), label: task.title }),
      onOpen
        ? h(
            'button',
            { key: 't', type: 'button', className: 'todo-task__title', onClick: () => onOpen(task) },
            task.title,
          )
        : h('span', { key: 't', className: 'todo-task__title todo-task__title--flat' }, task.title),
      h('span', { key: 'm', className: 'todo-task__meta' }, [
        task.body && h('span', { key: 'n', className: 'todo-mark', title: t('Note') }, '📝'),
        task.files.length > 0 &&
          h('span', { key: 'f', className: 'todo-mark', title: t('Attachments') }, [
            '📎',
            task.files.length > 1 && h('b', { key: 'c' }, String(task.files.length)),
          ]),
        priority(h, task.pri),
        avatar(h, { assignee: task.assignee, t }),
        task.dom && h('span', { key: 'g', className: 'todo-tag' }, task.dom),
        dateChip(h, { task, locale, t, day }),
      ]),
    ],
  )
}

/**
 * Ticking, written once for both screens.
 *
 * Read-then-write with the revision, so the conflict machinery that protects a
 * human editor also protects a checkbox: if the agent rewrote the task since
 * the screen was loaded, the tick is refused rather than silently overwriting
 * its work.
 */
export async function toggleTask(api, task) {
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
}

/**
 * The store table, as a row needs it: a colour and two letters.
 *
 * The default store gets NOTHING, and that absence is the design — a rim on
 * every row is not a signal. Same grammar as the shell's own cards, so one
 * mark is learnt rather than two.
 */
export function storeMarks(stores) {
  if (!Array.isArray(stores) || stores.length < 2) return () => undefined
  const table = new Map(
    stores
      .filter((store) => !store.default)
      .map((store) => [
        store.id,
        {
          label: store.label ?? store.id,
          hue: store.hue,
          mark: (store.label ?? store.id).slice(0, 2).toLocaleUpperCase(),
        },
      ]),
  )
  return (id) => (id === undefined ? undefined : table.get(id))
}
