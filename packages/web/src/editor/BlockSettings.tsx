/**
 * A block's settings, as a form — the missing half of the editor.
 *
 * Everything a block can be told is already declared: its own attributes in
 * its spec (closed sets and free values, required or not), and the RESERVED
 * ones every block carries — `title`, `ico`, `frame`, `w`. The form is drawn
 * FROM those declarations, never written per block, so a block a plugin adds
 * tomorrow gets its settings with no line here.
 *
 * It edits a plain record and hands back the next one; writing it into the
 * document is the caller's business (`blockview.tsx`). Empty means absent: a
 * field cleared is an attribute removed, never an attribute written empty —
 * and a value equal to its default is written only if somebody chose it,
 * since the page-author rule is to write what changes something.
 */

import { useRef, type ReactNode, type RefObject } from 'react'

import { type BlockSpec } from '@antorfr/adestia-content'

import { Icon } from '../app/Icon.js'
import { Button, Popover, Segmented } from '../app/ui/index.js'
import { FieldRow } from './FieldRow.js'
import { VariantImage } from './VariantImage.js'

/** Attributes the form never offers: identity and resolution, not settings. */
const HIDDEN = new Set(['id', 'from'])

/** The reserved attributes, drawn in their own groups rather than among the block's own. */
const RESERVED = new Set(['title', 'ico', 'frame', 'w'])

/** The widths, narrowest first — `w` values, with the word each is said with (keys of the shell's table). */
const WIDTHS_SHOWN: readonly { value: string; label: string }[] = [
  { value: '1/3', label: '⅓' },
  { value: '1/2', label: '½' },
  { value: '2/3', label: '⅔' },
  { value: '1', label: 'Full' },
]

/**
 * What the core says of each attribute of its own blocks: a label and a line of help,
 * English keys of the shell's table (identity in `en`, translated in `fr`). An attribute
 * absent here — a plugin block's — shows its identifier and no help.
 */
const TEXTS: Readonly<Record<string, readonly [label: string, help: string]>> = {
  'callout.type': ['Kind', 'The tone of the aside.'],
  'app.project': ['Project', 'The project this module reads.'],
  'content.type': ['Subject', 'What the passage is about; queries and configs address it.'],
  'content.by': ['Written by', 'Who the passage is attributed to.'],
  'content.on': ['Date', 'The day the passage is about.'],
  'figures.view': ['Look', 'Tiles, or all the figures on one line.'],
  'list.source': ['Lists', 'The pages below this one, or the files beside it.'],
  'list.depth': ['How far', 'Only this page, its children, or the whole subtree.'],
  'list.type': ['Kind of page', 'Keep only pages of these types, comma-separated.'],
  'list.pull': ['Fields shown', 'Header fields to show on each row, comma-separated.'],
  'list.sort': ['Order', 'The field the rows are sorted by.'],
  'list.closed': ['Closed items', 'What a closed item does: fold, hide or show.'],
  'list.view': ['Look', 'Rows, cards or chips.'],
}

/** The words of a closed value, when the value alone would read as code. */
const VALUE_WORDS: Readonly<Record<string, string>> = {
  note: 'note',
  tip: 'tip',
  warning: 'warning',
  children: 'children',
  files: 'files',
  self: 'self',
  subtree: 'subtree',
  fold: 'fold',
  hide: 'hide',
  show: 'show',
}

export interface BlockSettingsProps {
  /** The block's name, as written after `:::`. */
  readonly name: string
  /** What the block declares; absent for a name nothing defines any more. */
  readonly spec?: BlockSpec | undefined
  /**
   * The spec's `description`, already in the reader's language.
   *
   * Handed over rather than read off the spec, because a contributed block's
   * description is a PLUGIN's word: it is declared in a manifest, so only the
   * plugin that wrote it holds its translation, and only the caller knows
   * which plugin the block resolved to.
   */
  readonly about?: string | undefined
  readonly attributes: Readonly<Record<string, string>>
  /** The block's ⚙: the window hangs from it, and focus goes back to it on close. */
  readonly anchor?: RefObject<HTMLElement | null>
  readonly onChange: (next: Record<string, string>) => void
  readonly onClose: () => void
  /** Opens the data form (E-35); absent for a block that declares no `fields`. */
  readonly onEditData?: (() => void) | undefined
  /** The shell's translator; identity in English. */
  readonly t?: (key: string) => string
}

export function BlockSettings({
  name,
  spec,
  about,
  attributes,
  anchor,
  onChange,
  onClose,
  onEditData,
  t = (key) => key,
}: BlockSettingsProps) {
  // Without an anchor (a test, a caller that has none) the window has nothing to hang from.
  const orphan = useRef<HTMLElement | null>(null)
  const set = (key: string, value: string) => {
    const next: Record<string, string> = { ...attributes }
    if (value === '') delete next[key]
    else next[key] = value
    onChange(next)
  }

  const declared = spec?.attributes ?? {}
  // The look is offered as pictures when there is more than one to choose from.
  const looks = declared['view']?.values
  const look = looks && looks.length > 1 ? declared['view'] : undefined
  const own = Object.entries(declared).filter(
    ([key]) => !HIDDEN.has(key) && !RESERVED.has(key) && !(look && key === 'view'),
  )
  // Written on the page but declared by nobody — kept visible, so a stale
  // attribute can be seen and removed rather than silently carried.
  const stray = Object.keys(attributes).filter(
    (key) => !HIDDEN.has(key) && !RESERVED.has(key) && !Object.hasOwn(declared, key),
  )
  const missing = own.filter(([key, one]) => one.required && !attributes[key]).map(([key]) => textOf(key).label)

  function textOf(key: string): { label: string; help?: string } {
    const known = TEXTS[`${name}.${key}`]
    return known ? { label: t(known[0]), help: t(known[1]) } : { label: key }
  }

  const effectiveWidth = attributes['w'] ?? '1'
  const group = (title: string, children: ReactNode) => (
    <fieldset className="adestia-blockset__group">
      <legend>{t(title)}</legend>
      {children}
    </fieldset>
  )

  return (
    <Popover
      anchor={anchor ?? orphan}
      open
      onClose={onClose}
      label={t('Block settings %name').replace('%name', name)}
      className="adestia-blockset"
    >
      <div className="adestia-blockset__head">
        <span className="adestia-blockset__name">:::{name}</span>
        <Button variant="ghost" small icon="x" aria-label={t('Close')} title={t('Close')} onClick={onClose} />
      </div>

      {(about ?? spec?.description) && (
        <p className="adestia-blockset__about">{about ?? spec?.description}</p>
      )}

      {look?.values &&
        group(
          'Look',
          <div className="adestia-field">
            <Segmented
              kind="image"
              label={t(TEXTS[`${name}.view`]?.[0] ?? 'Look')}
              value={attributes['view'] ?? look.default}
              choices={look.values.map((value) => ({
                value,
                label: t(value),
                image: <VariantImage name={value} />,
              }))}
              onChange={(value) => set('view', value)}
            />
            {TEXTS[`${name}.view`] && <p className="adestia-field__help">{t(TEXTS[`${name}.view`]![1])}</p>}
          </div>,
        )}

      {own.length > 0 &&
        group(
          'Content',
          <>
            {own.map(([key, one]) => {
              const text = textOf(key)
              return (
                <FieldRow
                  key={key}
                  help={text.help}
                  label={
                    <>
                      {text.label}
                      {one.required && (
                        <>
                          <span aria-hidden="true"> *</span>
                          <span className="adestia-sr-only"> ({t('required')})</span>
                        </>
                      )}
                    </>
                  }
                >
                  {one.values ? (
                    <select
                      className="adestia-select"
                      value={attributes[key] ?? ''}
                      onChange={(event) => set(key, event.target.value)}
                    >
                      {!one.required && (
                        <option value="">{one.default ? `(${t(VALUE_WORDS[one.default] ?? one.default)})` : '—'}</option>
                      )}
                      {one.required && !attributes[key] && <option value="">{t('choose…')}</option>}
                      {one.values.map((value) => (
                        <option key={value} value={value}>
                          {t(VALUE_WORDS[value] ?? value)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="adestia-input"
                      value={attributes[key] ?? ''}
                      placeholder={one.default ?? ''}
                      onChange={(event) => set(key, event.target.value)}
                    />
                  )}
                </FieldRow>
              )
            })}
            {missing.length > 0 && (
              <p className="adestia-blockset__missing">
                <Icon name="circle-alert" />
                {t('To fill in: %fields — the page is refused without.').replace('%fields', missing.join(', '))}
              </p>
            )}
          </>,
        )}

      {group(
        'Layout',
        <>
          <div className="adestia-field">
            <span className="adestia-field__label">{t('Width')}</span>
            <Segmented
              kind="text"
              label={t('Width')}
              value={effectiveWidth}
              choices={WIDTHS_SHOWN.map((one) => ({ value: one.value, label: t(one.label) }))}
              onChange={(value) => set('w', value)}
            />
            <p className="adestia-field__help">{t('How much of the line the block takes.')}</p>
          </div>
          <div className="adestia-field">
            <span className="adestia-field__label">{t('Show a box')}</span>
            <Segmented
              kind="text"
              label={t('Show a box')}
              value={attributes['frame'] === 'card' ? 'card' : 'none'}
              choices={[
                { value: 'card', label: t('Yes') },
                { value: 'none', label: t('No') },
              ]}
              onChange={(value) => set('frame', value === 'card' ? 'card' : '')}
            />
            <p className="adestia-field__help">{t('Draw the block inside a bordered card.')}</p>
          </div>
        </>,
      )}

      {group(
        'Title and icon',
        <>
          <FieldRow label={t('Title')} help={t('Shown above the block.')}>
            <input
              type="text"
              className="adestia-input"
              value={attributes['title'] ?? ''}
              onChange={(event) => set('title', event.target.value)}
            />
          </FieldRow>
          <FieldRow label={t('Icon')} help={t('One glyph, drawn beside the title.')}>
            {/* The placeholder is an EXAMPLE of what an author writes, not an icon of the product. */}
            <input
              type="text"
              className="adestia-input adestia-blockset__ico"
              value={attributes['ico'] ?? ''}
              placeholder="📋"
              onChange={(event) => set('ico', event.target.value)}
            />
          </FieldRow>
        </>,
      )}

      {stray.length > 0 && (
        <fieldset className="adestia-blockset__group">
          <legend>{t('Other attributes')}</legend>
          {stray.map((key) => (
            <div className="adestia-blockset__stray" key={key}>
              <span className="adestia-blockset__stray-value">
                {key}={attributes[key]}
              </span>
              <Button
                variant="ghost"
                small
                icon="trash-2"
                aria-label={t('Remove %key').replace('%key', key)}
                title={t('Remove %key').replace('%key', key)}
                onClick={() => set(key, '')}
              />
            </div>
          ))}
        </fieldset>
      )}

      {onEditData && (
        <div className="adestia-blockset__foot">
          <Button icon="table" onClick={onEditData}>
            {t('Edit data')}
          </Button>
        </div>
      )}
    </Popover>
  )
}
