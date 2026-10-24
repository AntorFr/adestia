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

import { useRef, type RefObject } from 'react'

import { WIDTHS, type BlockSpec } from '@antorfr/adestia-content'

import { Icon } from '../app/Icon.js'
import { Button, Popover } from '../app/ui/index.js'
import { FieldRow } from './FieldRow.js'

/** The reserved attributes a person sets, in the order they are asked. */
const COMMON = ['title', 'ico', 'frame', 'w'] as const

/** Attributes the form never offers: identity and resolution, not settings. */
const HIDDEN = new Set(['id', 'from'])

/** What each width means, said the way a person would — keys of the shell's table. */
const WIDTH_LABELS: Readonly<Record<string, string>> = {
  '1': 'the whole line',
  '2/3': 'two thirds',
  '1/2': 'a half',
  '1/3': 'a third',
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

  const own = Object.entries(spec?.attributes ?? {}).filter(
    ([key]) => !HIDDEN.has(key) && !(COMMON as readonly string[]).includes(key),
  )
  // Written on the page but declared by nobody — kept visible, so a stale
  // attribute can be seen and removed rather than silently carried.
  const stray = Object.keys(attributes).filter(
    (key) =>
      !HIDDEN.has(key) &&
      !(COMMON as readonly string[]).includes(key) &&
      !Object.hasOwn(spec?.attributes ?? {}, key),
  )
  const missing = own.filter(([key, one]) => one.required && !attributes[key]).map(([key]) => key)

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

      {own.length > 0 && (
        <fieldset className="adestia-blockset__group">
          <legend>{t('This block')}</legend>
          {own.map(([key, one]) => (
            <FieldRow
              key={key}
              label={
                <>
                  {key}
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
                  {!one.required && <option value="">{one.default ? `(${one.default})` : '—'}</option>}
                  {one.required && !attributes[key] && <option value="">{t('choose…')}</option>}
                  {one.values.map((value) => (
                    <option key={value} value={value}>
                      {value}
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
          ))}
          {missing.length > 0 && (
            <p className="adestia-blockset__missing">
              <Icon name="circle-alert" />
              {t('To fill in: %fields — the page is refused without.').replace('%fields', missing.join(', '))}
            </p>
          )}
        </fieldset>
      )}

      <fieldset className="adestia-blockset__group">
        <legend>{t('Presentation')}</legend>
        <FieldRow label={t('title')}>
          <input
            type="text"
            className="adestia-input"
            value={attributes['title'] ?? ''}
            onChange={(event) => set('title', event.target.value)}
          />
        </FieldRow>
        <FieldRow label={t('icon')}>
          {/* The placeholder is an EXAMPLE of what an author writes, not an icon of the product. */}
          <input
            type="text"
            className="adestia-input adestia-blockset__ico"
            value={attributes['ico'] ?? ''}
            placeholder="📋"
            onChange={(event) => set('ico', event.target.value)}
          />
        </FieldRow>
        <FieldRow label={t('in a card')}>
          <input
            type="checkbox"
            role="switch"
            className="adestia-toggle"
            checked={attributes['frame'] === 'card'}
            onChange={(event) => set('frame', event.target.checked ? 'card' : '')}
          />
        </FieldRow>
        <FieldRow label={t('width')}>
          <select
            className="adestia-select"
            value={attributes['w'] ?? ''}
            onChange={(event) => set('w', event.target.value === '1' ? '' : event.target.value)}
          >
            <option value="">{t(WIDTH_LABELS['1']!)}</option>
            {Object.keys(WIDTHS)
              .filter((one) => one !== '1')
              .map((one) => (
                <option key={one} value={one}>
                  {t(WIDTH_LABELS[one] ?? one)} ({one})
                </option>
              ))}
          </select>
        </FieldRow>
      </fieldset>

      {stray.length > 0 && (
        <fieldset className="adestia-blockset__group">
          <legend>{t('Unknown to this block')}</legend>
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
    </Popover>
  )
}
