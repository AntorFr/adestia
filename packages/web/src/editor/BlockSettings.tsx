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

import { WIDTHS, type BlockSpec } from '@antorfr/adestia-content'

/** The reserved attributes a person sets, in the order they are asked. */
const COMMON = ['title', 'ico', 'frame', 'w'] as const

/** Attributes the form never offers: identity and resolution, not settings. */
const HIDDEN = new Set(['id', 'from'])

/** What each width means, said the way a person would. */
const WIDTH_LABELS: Readonly<Record<string, string>> = {
  '1': 'toute la ligne',
  '2/3': 'deux tiers',
  '1/2': 'la moitié',
  '1/3': 'un tiers',
}

export interface BlockSettingsProps {
  /** The block's name, as written after `:::`. */
  readonly name: string
  /** What the block declares; absent for a name nothing defines any more. */
  readonly spec?: BlockSpec | undefined
  readonly attributes: Readonly<Record<string, string>>
  readonly onChange: (next: Record<string, string>) => void
  readonly onClose: () => void
}

export function BlockSettings({ name, spec, attributes, onChange, onClose }: BlockSettingsProps) {
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
    <div className="adestia-blockset" role="dialog" aria-label={`Réglages du bloc ${name}`}>
      <div className="adestia-blockset__head">
        <span className="adestia-blockset__name">:::{name}</span>
        <button type="button" className="adestia-blockset__close" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </div>

      {spec?.description && <p className="adestia-blockset__about">{spec.description}</p>}

      {own.length > 0 && (
        <fieldset className="adestia-blockset__group">
          <legend>Ce bloc</legend>
          {own.map(([key, one]) => (
            <label className="adestia-blockset__field" key={key}>
              <span>
                {key}
                {one.required && <em title="obligatoire"> *</em>}
              </span>
              {one.values ? (
                <select value={attributes[key] ?? ''} onChange={(event) => set(key, event.target.value)}>
                  {!one.required && (
                    <option value="">{one.default ? `(${one.default})` : '—'}</option>
                  )}
                  {one.required && !attributes[key] && <option value="">choisir…</option>}
                  {one.values.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={attributes[key] ?? ''}
                  placeholder={one.default ?? ''}
                  onChange={(event) => set(key, event.target.value)}
                />
              )}
            </label>
          ))}
          {missing.length > 0 && (
            <p className="adestia-blockset__missing">
              À remplir : {missing.join(', ')} — la page est refusée sans.
            </p>
          )}
        </fieldset>
      )}

      <fieldset className="adestia-blockset__group">
        <legend>Présentation</legend>
        <label className="adestia-blockset__field">
          <span>titre</span>
          <input type="text" value={attributes['title'] ?? ''} onChange={(event) => set('title', event.target.value)} />
        </label>
        <label className="adestia-blockset__field">
          <span>icône</span>
          <input
            type="text"
            className="adestia-blockset__ico"
            value={attributes['ico'] ?? ''}
            placeholder="📋"
            onChange={(event) => set('ico', event.target.value)}
          />
        </label>
        <label className="adestia-blockset__field adestia-blockset__field--check">
          <input
            type="checkbox"
            checked={attributes['frame'] === 'card'}
            onChange={(event) => set('frame', event.target.checked ? 'card' : '')}
          />
          <span>dans une carte</span>
        </label>
        <label className="adestia-blockset__field">
          <span>largeur</span>
          <select value={attributes['w'] ?? ''} onChange={(event) => set('w', event.target.value === '1' ? '' : event.target.value)}>
            <option value="">{WIDTH_LABELS['1']}</option>
            {Object.keys(WIDTHS)
              .filter((one) => one !== '1')
              .map((one) => (
                <option key={one} value={one}>
                  {WIDTH_LABELS[one] ?? one} ({one})
                </option>
              ))}
          </select>
        </label>
      </fieldset>

      {stray.length > 0 && (
        <fieldset className="adestia-blockset__group">
          <legend>Inconnus de ce bloc</legend>
          {stray.map((key) => (
            <div className="adestia-blockset__field adestia-blockset__field--stray" key={key}>
              <span>
                {key}={attributes[key]}
              </span>
              <button type="button" onClick={() => set(key, '')}>
                retirer
              </button>
            </div>
          ))}
        </fieldset>
      )}
    </div>
  )
}
