import { toneOf, type Indexed } from '@antorfr/adestia-content'
import { isIndexPath } from '../../app/paths.js'
import { initials, titleOf } from '../listing.js'
import type { Ctx } from './types.js'

/**
 * Rows the BODY wrote — `Rôle: Personne`, one per line.
 *
 * They are not pages, so nothing here opens, folds, or carries a status: a
 * written line has no page behind it to have one. That is the whole
 * difference between the two provenances, and it is why the same three views
 * can draw both without either pretending to be the other.
 */
export function Written({
  entries,
  view,
}: {
  readonly entries: readonly { label: string; value: string }[]
  readonly view: string
}) {
  if (view === 'chips') {
    return (
      <div className="adestia-list adestia-list--chips">
        {entries.map((entry, index) => (
          <span className="adestia-chip" key={`${entry.value}-${index}`}>
            <i className="adestia-chip__plate" aria-hidden="true">
              {initials(entry.value)}
            </i>
            <span className="adestia-chip__text">
              <b>{entry.value}</b>
              {entry.label && <em> · {entry.label}</em>}
            </span>
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className={`adestia-list adestia-list--${view === 'cards' ? 'cards' : 'rows'}`}>
      {entries.map((entry, index) => (
        <div className="adestia-list__row adestia-list__row--written" key={`${entry.value}-${index}`}>
          <span className="adestia-list__title">{entry.value}</span>
          {entry.label && (
            <span className="adestia-list__pulled">
              <span className="adestia-tag">{entry.label}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * The two names a status answers to, and the reason there are two: the content
 * engine's own pair (`isFinished` reads `status` then `statut`), because half
 * this corpus writes the French spelling. A pulled field under one of these
 * names is drawn as the STATUS PILL the shell wears everywhere else — a
 * section card, a collection's member, a page's own header — instead of the
 * neutral tag every other pulled field gets.
 *
 * A row of sub-worksites was the one place the shell answered in grey while
 * the cards beside it answered in colour, for the same field read from the
 * same index. The tone is `toneOf`'s, never a second table here: three
 * families, and the WORD stays written beside the dot, because hue alone is
 * not a label.
 */
const STATUS_FIELDS = new Set(['status', 'statut'])

export function Row({
  page,
  pull,
  view,
  ctx,
}: {
  readonly page: Indexed
  readonly pull: readonly string[]
  readonly view: string
  readonly ctx: Ctx
}) {
  // Two kinds of pull, and they draw differently because they ARE different.
  // A bare name is a HEADER field — a status, a date — and reads as a chip.
  // `content:etat` is a written BLOCK of the child, digested by the index,
  // and it is a sentence: it reads as the row's description, under the title,
  // because a paragraph squeezed into a chip is a paragraph nobody reads.
  const pulled = pull
    .filter((name) => !name.startsWith('content:'))
    .map((name) => ({ name, value: page.fields[name] }))
    .filter((one) => one.value !== undefined && one.value !== '')
  const said = pull
    .filter((name) => name.startsWith('content:'))
    .map((name) => page.blocks?.[name.slice('content:'.length)])
    .find((text) => text !== undefined && text !== '')
  const title = titleOf(page)
  // The glyph a row wears, and none of it is invented here. A page that
  // declares `ico:` wins — the same field the section cards and the tiles
  // read, so a subject looks like itself wherever it appears. Failing that,
  // the shell's own two words: `◆` for a row standing for a FOLDER, which is
  // what `sections.ts` already draws for a subject, and `•` for a plain page,
  // which is what the launcher already draws for an item. The shape then says
  // something true that the list had already worked out — whether this row is
  // a subject you descend into or a page you open.
  const declared = page.fields['ico']
  const glyph =
    typeof declared === 'string' && declared !== ''
      ? declared
      : isIndexPath(page.path)
        ? '◆'
        : '•'
  return (
    <button
      type="button"
      className="adestia-list__row"
      onClick={() => ctx.openPage?.(page.path)}
    >
      {view === 'chips' ? (
        <i className="adestia-chip__plate" aria-hidden="true">
          {initials(title)}
        </i>
      ) : (
        <i className="adestia-list__ico" aria-hidden="true">
          {glyph}
        </i>
      )}
      <span className="adestia-list__title">
        {title}
        {said && <em className="adestia-list__said">{said}</em>}
      </span>
      {pulled.length > 0 && (
        <span className="adestia-list__pulled">
          {pulled.map((one) => (
            <span
              key={one.name}
              className={
                STATUS_FIELDS.has(one.name)
                  ? `adestia-stat adestia-stat--${toneOf(one.value)}`
                  : 'adestia-tag'
              }
            >
              {String(one.value)}
            </span>
          ))}
        </span>
      )}
    </button>
  )
}

