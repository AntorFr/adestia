/**
 * The data of a block, as a form (E-35, B-27).
 *
 * A block's lines are what the page file holds; the form is a way to write
 * them without knowing the format. It edits a COPY: nothing reaches the
 * document until **Apply**, which hands back the lines in one go (one change,
 * one undo step), and **Cancel**, ✕, Escape and the scrim hand back nothing.
 * The codec (`blockform/`) is what makes that honest: a row nobody touched is
 * written back as it stood, and a line the form cannot read rides along where
 * it was.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import type { PluginGalleryColumn, PluginGalleryFields, PluginGalleryText } from '@antorfr/adestia-schemas'

import { Button, EmptyState, Field, Sheet } from '../app/ui/index.js'
import { cellKey, cellsOf, codecFor, isDelimiter, linesOfText, validateRow, type Cells, type Kept, type Problem, type Refusal, type Row } from './blockform/index.js'
import { stepOf } from './moveui.js'

export interface BlockFormProps {
  /** What the sheet calls the block: « Figures — data ». */
  readonly name: string
  readonly fields: PluginGalleryFields
  /** The block's body lines as the document holds them now. */
  readonly lines: readonly string[]
  /** True when the document's block no longer reads as it did when the form opened. */
  readonly stale?: boolean
  readonly locale?: string | undefined
  /**
   * Opened right after the gallery inserted the block (P-17 step 4): the lines
   * it holds are the placeholder that keeps the page writable, so the form
   * starts on one empty row instead (a table keeps its header row).
   */
  readonly fresh?: boolean
  readonly onApply: (lines: string[]) => void
  readonly onClose: () => void
  readonly t?: (key: string) => string
}

interface Item {
  readonly id: number
  readonly row: Row
}

const MESSAGES: Readonly<Record<Refusal, string>> = {
  required: 'Fill this in',
  number: 'Write a number, with its unit if any',
  date: 'Write a date as 2026-03-01',
  order: 'Due is before start',
  colon: 'A label cannot hold a colon',
  dash: 'A value cannot hold a spaced dash',
  newline: 'Write it on one line',
}

function say(text: PluginGalleryText, locale: string | undefined, t: (key: string) => string): string {
  if (typeof text === 'string') return t(text)
  return (locale === 'fr' ? text.fr : undefined) ?? text.en
}

/** `|` ends a cell of a table: typed in one, it is written escaped. */
const escapePipes = (value: string) => value.replace(/(?<!\\)\|/g, '\\|')

function widthOf(items: readonly Item[]): number {
  return items.reduce((width, one) => Math.max(width, cellsOf(one.row.cells).length), 0)
}

export function BlockForm({ name, fields, lines, stale = false, locale, fresh = false, onApply, onClose, t = (key) => key }: BlockFormProps) {
  const codec = useMemo(() => codecFor(fields.line), [fields.line])
  const isTable = fields.line === 'table'
  const next = useRef(0)
  const wrap = (rows: readonly Row[]): Item[] => rows.map((row) => ({ id: next.current++, row }))
  const first = useMemo(() => codec.read(lines), [codec, lines])
  const [items, setItems] = useState<Item[]>(() => {
    if (!fresh) return wrap(first.rows)
    const head = isTable ? first.rows.slice(0, 1) : []
    const width = isTable ? Math.max(head[0] ? cellsOf(head[0].cells).length : 2, 2) : 0
    const empty: Row = {
      cells: Object.fromEntries(
        (isTable ? Array.from({ length: width }, (_, i) => cellKey(i)) : fields.columns.map((c) => c.key)).map((k) => [k, '']),
      ),
    }
    return wrap([...head, empty])
  })
  const [kept, setKept] = useState<readonly Kept[]>(first.kept)
  const [raw, setRaw] = useState<string | null>(null)
  const [current, setCurrent] = useState<number | undefined>(undefined)
  const focus = useRef<{ id: number; select: string } | null>(null)
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wanted = focus.current
    if (!wanted) return
    focus.current = null
    const row = body.current?.querySelector<HTMLElement>(`[data-row="${wanted.id}"]`)
    const target = row?.querySelector<HTMLElement>(wanted.select)
    ;(target && !target.hasAttribute('disabled') ? target : row?.querySelector<HTMLElement>('input'))?.focus()
  })

  const columns: readonly PluginGalleryColumn[] = isTable
    ? Array.from({ length: widthOf(items) }, (_, i) => ({ key: cellKey(i), kind: 'text' as const, label: '' }))
    : fields.columns

  // Only a row somebody changed is judged: one read from the page is written back as it stood.
  const problems = useMemo(() => {
    const out = new Map<number, Problem[]>()
    if (isTable) {
      for (const one of items) {
        const bad = cellsOf(one.row.cells).flatMap((cell, i) =>
          /[\r\n]/.test(cell) ? [{ key: cellKey(i), refusal: 'newline' as const }] : [])
        if (bad.length) out.set(one.id, bad)
      }
      return out
    }
    for (const one of items) {
      const unchanged = one.row.raw !== undefined && sameCells(codec.parse(one.row.raw), one.row.cells)
      if (unchanged) continue
      const found = validateRow(fields.columns, fields.line, one.row.cells)
      if (found.length) out.set(one.id, found)
    }
    return out
  }, [items, codec, fields, isTable])

  const labelOf = (key: string): string => {
    const column = columns.find((one) => one.key === key)
    return column && column.label !== '' ? say(column.label, locale, t) : key
  }
  const firstProblem = [...problems.entries()][0]
  const live = firstProblem?.[1][0]
    ? `${labelOf(firstProblem[1][0].key)}: ${t(MESSAGES[firstProblem[1][0].refusal])}`
    : ''

  const edit = (id: number, key: string, value: string) =>
    setItems((all) =>
      all.map((one) =>
        one.id === id
          ? { id, row: { ...(one.row.raw !== undefined ? { raw: one.row.raw } : {}), cells: { ...one.row.cells, [key]: isTable ? escapePipes(value) : value } } }
          : one,
      ),
    )

  const blank = (): Cells =>
    Object.fromEntries((isTable ? Array.from({ length: Math.max(widthOf(items), 2) }, (_, i) => cellKey(i)) : fields.columns.map((c) => c.key)).map((k) => [k, '']))

  const add = () => {
    const id = next.current++
    setItems((all) => [...all, { id, row: { cells: blank() } }])
    setCurrent(id)
    focus.current = { id, select: 'input' }
  }
  const remove = (id: number) => {
    setItems((all) => all.filter((one) => one.id !== id))
    setCurrent(undefined)
  }
  const move = (id: number, by: -1 | 1, select: string) => {
    setItems((all) => {
      const at = all.findIndex((one) => one.id === id)
      const to = at + by
      if (at < 0 || to < 0 || to >= all.length) return all
      const copy = [...all]
      copy.splice(to, 0, ...copy.splice(at, 1))
      return copy
    })
    focus.current = { id, select }
  }
  const addColumn = () =>
    setItems((all) => {
      const width = widthOf(all)
      return all.map((one) => ({ ...one, row: { ...one.row, cells: { ...one.row.cells, [cellKey(width)]: '' } } }))
    })
  const removeColumn = (index: number) =>
    setItems((all) =>
      all.map((one) => {
        const cells = cellsOf(one.row.cells)
        cells.splice(index, 1)
        return { ...one, row: { ...(one.row.raw !== undefined ? { raw: one.row.raw } : {}), cells: Object.fromEntries(cells.map((c, i) => [cellKey(i), c])) } }
      }),
    )

  const written = (): string[] => codec.write(items.map((one) => one.row), kept)

  const toRaw = () => setRaw(written().join('\n'))
  const toForm = () => {
    if (raw === null) return
    const read = codec.read(linesOfText(raw))
    setItems(wrap(read.rows))
    setKept(read.kept)
    setCurrent(undefined)
    setRaw(null)
  }

  // Raw is read as it stands: a line the form cannot read shows under "Kept as written" when switching back.
  const apply = () => onApply(raw !== null ? linesOfText(raw) : written())
  const blocked = stale || (raw === null && problems.size > 0)

  const shown = kept.filter((one) => !(isTable && isDelimiter(one.line)))
  const focused = items.find((one) => one.id === current) ?? items[items.length - 1]

  return (
    <Sheet
      open
      title={t('%name — data').replace('%name', name)}
      onClose={onClose}
      t={t}
      className="adestia-blockform"
      headerActions={
        <Button
          variant="ghost"
          small
          icon="code"
          aria-pressed={raw !== null}
          onClick={() => (raw === null ? toRaw() : toForm())}
        >
          {t('Raw')}
        </Button>
      }
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="accent" disabled={blocked} onClick={apply}>
            {t('Apply')}
          </Button>
        </>
      }
    >
      <div ref={body} className="adestia-blockform__body">
        {stale && (
          <p className="adestia-blockform__stale" role="alert">
            {t('This block changed — reopen it')}
          </p>
        )}
        {raw !== null ? (
          <textarea
            className="adestia-textarea adestia-blockform__raw"
            aria-label={t('Raw')}
            spellCheck={false}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
          />
        ) : (
          <>
            {items.length === 0 ? (
              <EmptyState
                icon="plus"
                text={t('Nothing here yet.')}
                action={<Button icon="plus" onClick={add}>{t('Add')}</Button>}
              />
            ) : (
              <>
                {isTable && (
                  <div className="adestia-blockform__cols">
                    {columns.map((column, i) => (
                      <Button
                        key={column.key}
                        variant="ghost"
                        small
                        icon="x"
                        aria-label={t('Remove column %n').replace('%n', String(i + 1))}
                        title={t('Remove column %n').replace('%n', String(i + 1))}
                        onClick={() => removeColumn(i)}
                      />
                    ))}
                  </div>
                )}
                <ol className={`adestia-blockform__rows${isTable ? ' adestia-blockform__rows--table' : ''}`}>
                  {items.map((one, index) => {
                    const bad = problems.get(one.id) ?? []
                    return (
                      <li
                        key={one.id}
                        className="adestia-blockform__row"
                        data-row={one.id}
                        onFocus={() => setCurrent(one.id)}
                        onKeyDown={(event) => {
                          const by = stepOf(event.nativeEvent)
                          if (!by) return
                          event.preventDefault()
                          move(one.id, by, 'input')
                        }}
                      >
                        <div className="adestia-blockform__cells">
                          {columns.map((column, i) => {
                            const refusal = bad.find((p) => p.key === column.key)?.refusal
                            const input = (
                              <input
                                type={column.kind === 'date' ? 'date' : 'text'}
                                className="adestia-input"
                                value={one.row.cells[column.key] ?? ''}
                                {...(isTable ? { 'aria-label': `${t('Row %n').replace('%n', String(index + 1))}, ${t('Column %n').replace('%n', String(i + 1))}` } : {})}
                                {...(i === 0 ? { 'data-first': '' } : {})}
                                onChange={(event) => edit(one.id, column.key, event.target.value)}
                              />
                            )
                            return isTable ? (
                              <div key={column.key} className="adestia-field">
                                {input}
                                {refusal && <p className="adestia-field__error">{t(MESSAGES[refusal])}</p>}
                              </div>
                            ) : (
                              <Field
                                key={column.key}
                                label={say(column.label, locale, t)}
                                {...(refusal ? { error: t(MESSAGES[refusal]) } : {})}
                              >
                                {input}
                              </Field>
                            )
                          })}
                        </div>
                        <div className="adestia-blockform__acts">
                          <Button
                            variant="ghost"
                            small
                            icon="arrow-up"
                            data-move="up"
                            aria-label={t('Move up')}
                            title={t('Move up')}
                            disabled={index === 0}
                            onClick={() => move(one.id, -1, '[data-move="up"]')}
                          />
                          <Button
                            variant="ghost"
                            small
                            icon="arrow-up"
                            className="adestia-blockform__down"
                            data-move="down"
                            aria-label={t('Move down')}
                            title={t('Move down')}
                            disabled={index === items.length - 1}
                            onClick={() => move(one.id, 1, '[data-move="down"]')}
                          />
                          <Button
                            variant="ghost"
                            small
                            icon="trash-2"
                            aria-label={t('Remove row')}
                            title={t('Remove row')}
                            onClick={() => remove(one.id)}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ol>
                <div className="adestia-blockform__add">
                  <Button icon="plus" onClick={add}>{t('Add')}</Button>
                  {isTable && <Button icon="plus" onClick={addColumn}>{t('Add column')}</Button>}
                </div>
              </>
            )}
            {focused && !isTable && (
              <p className="adestia-blockform__writes">
                <span>{t('Writes:')}</span> <code>{codec.format(focused.row.cells)}</code>
              </p>
            )}
            {shown.length > 0 && (
              <section className="adestia-blockform__kept" aria-label={t('Kept as written')}>
                <h3>{t('Kept as written')}</h3>
                <ul>
                  {shown.map((one) => (
                    <li key={one.index}><code>{one.line}</code></li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        <div className="adestia-sr-only" role="status" aria-live="polite">{live}</div>
      </div>
    </Sheet>
  )
}

function sameCells(a: Cells | null, b: Cells): boolean {
  if (!a) return false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) if ((a[key] ?? '') !== (b[key] ?? '')) return false
  return true
}
