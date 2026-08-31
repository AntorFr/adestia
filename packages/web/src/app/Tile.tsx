/**
 * The tile — the one shape this product uses to say "here is a way in".
 *
 * Lifted out of the landing canvas the day a second screen needed it. The
 * settings app draws its own two ways in (the servers this instance reaches,
 * the prose it was told) and drawing them as ROWS made settings look like a
 * preferences dialog wearing a screen's clothes. They are domains of this
 * instance, exactly as an app or a section is, so they are tiles — and a tile
 * that is a copy of another tile is a tile that drifts.
 *
 * Everything about arranging (the slot, the arrows, the drag props) travels
 * with it, unused by callers that never arrange: a second, simpler tile for
 * the screens that only display would be the copy this move exists to avoid.
 */

import { glyphOf } from './glyphs.js'
import type { TileInfo } from '../plugins/contract.js'

/**
 * A tile's colour.
 *
 * A declared hue becomes `--adestia-hue-<name>`, which a skin may define and
 * most will not — so the fallback is the accent rather than a colour invented
 * here. Inventing one would mean a palette the skin cannot reach.
 */
export function hueStyle(hue?: string): Record<string, string> {
  return hue ? { '--tile-color': `var(--adestia-hue-${hue}, var(--accent))` } : {}
}

export function Tile(props: {
  readonly icon: string
  /** `ic:` name resolved against the shell's closed glyph set. */
  readonly glyph?: string
  readonly label: string
  readonly subtitle?: string
  readonly chips?: TileInfo['chips']
  readonly hue?: string
  readonly disabled?: boolean
  readonly title?: string
  readonly onOpen: () => void
  /** Edit mode: the tile is furniture to be moved, not a way in. */
  readonly editing?: boolean
  readonly carried?: boolean
  /** Moves this tile one place. Present only while editing. */
  readonly onNudge?: (by: -1 | 1) => void
  readonly drag?: Record<string, unknown>
  readonly t?: (key: string) => string
}) {
  const drawn = glyphOf(props.glyph)
  const t = props.t ?? ((key: string) => key)
  return (
    <li
      className={[
        'adestia-tile-slot',
        props.editing ? 'adestia-tile-slot--editing' : '',
        props.carried ? 'adestia-tile-slot--carried' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...(props.editing ? props.drag ?? {} : {})}
    >
      {/* Arrows, because a mosaic that can only be dragged is a mosaic some
          people cannot reorder at all — and "hold and drag" is the hardest
          gesture to discover even for those who can. */}
      {props.editing && props.onNudge && (
        <span className="adestia-tile-slot__arrows">
          <button
            type="button"
            aria-label={`${t('Move earlier')} — ${props.label}`}
            onClick={() => props.onNudge?.(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={`${t('Move later')} — ${props.label}`}
            onClick={() => props.onNudge?.(1)}
          >
            ›
          </button>
        </span>
      )}
      <button
        type="button"
        className="adestia-tile"
        style={hueStyle(props.hue)}
        // Editing, the tile is being ARRANGED. Opening what you are trying to
        // pick up is the classic way an edit mode betrays the person in it.
        //
        // Inert by `pointer-events: none` from the slot rather than by
        // `disabled`: a disabled button swallows pointer events in some
        // browsers, and those are exactly the events the drag is listening
        // for on the slot around it. Untabbable too, so the keyboard is not
        // offered a control that does nothing.
        onClick={props.editing ? undefined : props.onOpen}
        disabled={props.disabled ?? false}
        {...(props.editing ? { tabIndex: -1, 'aria-hidden': true } : {})}
        {...(props.title && !props.editing ? { title: props.title } : {})}
      >
        {/* The markup comes from the shell's own closed set, never from a
            manifest — which is what makes the injection safe. */}
        {drawn ? (
          <span
            className="adestia-tile__icon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: drawn }}
          />
        ) : (
          <span className="adestia-tile__icon" aria-hidden="true">
            {props.icon}
          </span>
        )}
        <span className="adestia-tile__label">{props.label}</span>
        {props.subtitle && <span className="adestia-tile__subtitle">{props.subtitle}</span>}
        <span className="adestia-tile__foot">
          {(props.chips ?? []).map((chip) => (
            <span
              key={chip.text}
              className={chip.hot ? 'adestia-chip adestia-chip--hot' : 'adestia-chip'}
            >
              {chip.text}
            </span>
          ))}
        </span>
      </button>
    </li>
  )
}