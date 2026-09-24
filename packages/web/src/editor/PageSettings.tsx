/**
 * A page's properties, as a form — the frontmatter, without the YAML.
 *
 * The block settings next door solved this for a block: the form is drawn
 * FROM declarations, never written per block, so a block a plugin adds
 * tomorrow gets its settings with no line there. This is the same idea one
 * level up, with one difference that changes everything: a block's attributes
 * are a CLOSED vocabulary and a page's frontmatter is not. So a list here
 * proposes rather than restricts — what the field declares, then what the
 * workspace already writes, then whatever somebody types next.
 *
 * What it will not do is let a form break a file. Nothing is typed as YAML:
 * every control writes a value, `writeFrontmatter` writes the line, and the
 * lines it cannot model are shown as they are and left alone.
 */

import { useMemo, useState } from 'react'

import type { FieldSpec, FieldValue, Indexed } from '@antorfr/adestia-content'

import {
  addableFields,
  formFor,
  strayField,
  type FieldContributions,
  type FormField,
} from './pageform.js'

/** The option value that means "none of these" — never a legal field value. */
const FREE = '\u0000free'

export interface PageSettingsProps {
  /** What the page's frontmatter says today. */
  readonly fields: Readonly<Record<string, FieldValue>>
  /** Structures the editor keeps and does not touch — shown, never offered. */
  readonly opaque: readonly { readonly key: string; readonly text: string }[]
  /** The block does not parse: the form refuses to write rather than repair. */
  readonly broken?: boolean
  /** The instance's pages — the values and the references come from these. */
  readonly pages: readonly Indexed[]
  /** What the active plugins declare, by page type. */
  readonly contributions?: FieldContributions
  readonly locale?: string
  /** Keys something else on screen already owns — the title field, typically. */
  readonly without?: readonly string[]
  /** One field changed. `undefined` removes it. */
  readonly onChange: (key: string, value: FieldValue | undefined) => void
  readonly onClose: () => void
  /** The shell's translator; identity in English. */
  readonly t?: (key: string) => string
}

function Tags({
  value,
  options,
  onChange,
  t,
}: {
  value: readonly string[]
  options: readonly string[]
  onChange: (next: string[]) => void
  t: (key: string) => string
}) {
  const [draft, setDraft] = useState('')
  const add = (word: string) => {
    const clean = word.trim().replace(/^#/, '')
    if (clean === '' || value.includes(clean)) return setDraft('')
    onChange([...value, clean])
    setDraft('')
  }
  const list = `adestia-tags-${options.length}`
  return (
    <div className="adestia-tagedit">
      {value.map((tag) => (
        <span className="adestia-tag" key={tag}>
          {tag}
          <button
            type="button"
            aria-label={`${t('Remove tag')} ${tag}`}
            onClick={() => onChange(value.filter((one) => one !== tag))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        list={list}
        value={draft}
        placeholder={t('add…')}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => add(draft)}
        onKeyDown={(event) => {
          // Enter and comma both mean "that is one word" — and neither may
          // reach the editor underneath, where Enter is a new paragraph.
          if (event.key !== 'Enter' && event.key !== ',') {
            if (event.key === 'Backspace' && draft === '' && value.length > 0) {
              onChange(value.slice(0, -1))
            }
            return
          }
          event.preventDefault()
          add(draft)
        }}
      />
      <datalist id={list}>
        {options.filter((one) => !value.includes(one)).map((one) => (
          <option key={one} value={one} />
        ))}
      </datalist>
    </div>
  )
}

function Control({
  field,
  value,
  onChange,
  t,
}: {
  field: FormField
  value: FieldValue | undefined
  onChange: (next: FieldValue | undefined) => void
  t: (key: string) => string
}) {
  const { spec } = field
  const current = value === undefined ? '' : String(value)
  /*
   * A value the list does not hold puts the row in free text ON ITS OWN —
   * which is what a page written by the agent looks like the first time
   * somebody opens its properties. Asking them to press "other" to see the
   * word already in their file would be asking them to confirm a fact.
   */
  const [free, setFree] = useState(
    spec.kind === 'choice' && current !== '' && !field.options.includes(current) && !spec.closed,
  )
  /*
   * Whether free text was CHOSEN here, rather than merely inferred above.
   * Only the chosen one takes the caret: a panel that opened on a page full
   * of words the corpus has not met would otherwise steal focus into
   * whichever field happened to be first.
   */
  const [chose, setChose] = useState(false)

  switch (spec.kind) {
    case 'tags': {
      const list = Array.isArray(value) ? value.map(String) : current === '' ? [] : [current]
      return (
        <Tags
          value={list}
          options={field.options}
          onChange={(next) => onChange(next.length === 0 ? undefined : next)}
          t={t}
        />
      )
    }
    case 'date':
      return (
        <input
          type="date"
          value={current}
          onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          value={current}
          onChange={(event) =>
            onChange(event.target.value === '' ? undefined : Number(event.target.value))
          }
        />
      )
    case 'icon':
      return (
        <input
          type="text"
          className="adestia-blockset__ico"
          value={current}
          placeholder="◆"
          onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
        />
      )
    case 'reference': {
      const options = field.references ?? []
      const orphan = current !== '' && !options.some((one) => one.id === current)
      return (
        <select
          value={current}
          onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
        >
          <option value="">{t('none')}</option>
          {/* A reference whose target is gone keeps its own line rather than
              silently becoming "none" the moment somebody opens the form. */}
          {orphan && <option value={current}>{current} — {t('not found')}</option>}
          {options.map((one) => (
            <option key={one.id} value={one.id}>
              {one.title}
            </option>
          ))}
        </select>
      )
    }
    case 'choice':
      if (free) {
        return (
          <input
            type="text"
            autoFocus={chose}
            value={current}
            onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
            onBlur={() => current !== '' && field.options.includes(current) && setFree(false)}
          />
        )
      }
      return (
        <select
          value={current}
          onChange={(event) => {
            if (event.target.value === FREE) {
              /*
               * The value is KEPT, not cleared. Clearing it made "another
               * value…" a delete button for anyone who pressed it to correct
               * a word rather than replace it, and closing the panel then
               * left the field gone. Editing what is there is both the
               * friendlier gesture and the lossless one.
               */
              setFree(true)
              setChose(true)
              return
            }
            onChange(event.target.value === '' ? undefined : event.target.value)
          }}
        >
          <option value="">—</option>
          {field.options.map((one) => (
            <option key={one} value={one}>
              {one}
            </option>
          ))}
          {!spec.closed && <option value={FREE}>{t('another value…')}</option>}
        </select>
      )
    default:
      return (
        <input
          type="text"
          value={current}
          onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
        />
      )
  }
}

export function PageSettings({
  fields,
  opaque,
  broken = false,
  pages,
  contributions,
  locale = 'en',
  without = [],
  onChange,
  onClose,
  t = (key) => key,
}: PageSettingsProps) {
  /*
   * Fields somebody ASKED for that the page does not carry yet. Held here
   * rather than written empty: a field is added to the form by choosing it,
   * and to the FILE by giving it a value. Writing `cat:` with nothing after
   * it would be writing a line that means nothing and that every reader of
   * the index would then have to ignore.
   */
  const [extra, setExtra] = useState<readonly string[]>([])

  const present = useMemo(() => {
    const copy: Record<string, FieldValue> = { ...fields }
    for (const key of extra) if (!(key in copy)) copy[key] = ''
    return copy
  }, [fields, extra])

  const { groups, unknown } = useMemo(
    () => formFor({ present, pages, ...(contributions ? { contributions } : {}), locale, without }),
    [present, pages, contributions, locale, without],
  )
  const addable = useMemo(() => addableFields(present, without), [present, without])
  const type = typeof fields['type'] === 'string' ? fields['type'] : undefined

  const row = (field: FormField) => (
    <label className="adestia-blockset__field" key={field.spec.key}>
      <span>{t(field.spec.label)}</span>
      <Control
        field={field}
        value={present[field.spec.key]}
        onChange={(next) => onChange(field.spec.key, next)}
        t={t}
      />
      {field.spec.help && <p className="adestia-blockset__hint">{t(field.spec.help)}</p>}
    </label>
  )

  return (
    <div
      className="adestia-blockset adestia-blockset--page"
      role="dialog"
      aria-label={t('Page properties')}
    >
      <div className="adestia-blockset__head">
        <span className="adestia-blockset__name">
          {t('properties')}
          {type ? ` · type=${type}` : ''}
        </span>
        <button
          type="button"
          className="adestia-blockset__close"
          onClick={onClose}
          aria-label={t('Close')}
        >
          ×
        </button>
      </div>

      {broken ? (
        <p className="adestia-blockset__missing">
          {t('This page’s frontmatter does not parse, so nothing here is editable — fixing it is a change to the file.')}
        </p>
      ) : (
        <>
          {groups.map((group) => (
            <fieldset className="adestia-blockset__group" key={group.id}>
              <legend>{t(group.label)}</legend>
              {group.fields.map(row)}
            </fieldset>
          ))}

          {unknown.length > 0 && (
            <fieldset className="adestia-blockset__group">
              <legend>{t('Nobody reads these')}</legend>
              {unknown.map((key) => (
                <label className="adestia-blockset__field" key={key}>
                  <span>{key}</span>
                  <Control
                    field={{ spec: strayField(key), options: [] }}
                    value={present[key]}
                    onChange={(next) => onChange(key, next)}
                    t={t}
                  />
                </label>
              ))}
            </fieldset>
          )}

          {opaque.length > 0 && (
            <fieldset className="adestia-blockset__group">
              <legend>{t('Kept as written')}</legend>
              <p className="adestia-blockset__hint adestia-blockset__hint--wide">
                {t('The editor does not model these, so it leaves them exactly as they are.')}
              </p>
              {opaque.map((one) => (
                <pre className="adestia-blockset__kept" key={one.key}>
                  {one.text}
                </pre>
              ))}
            </fieldset>
          )}

          {addable.length > 0 && (
            <div className="adestia-blockset__add">
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value === '') return
                  setExtra((was) => [...was, event.target.value])
                }}
              >
                <option value="">{t('+ add a field…')}</option>
                {addable.map((spec: FieldSpec) => (
                  <option key={spec.key} value={spec.key}>
                    {t(spec.label)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
    </div>
  )
}
