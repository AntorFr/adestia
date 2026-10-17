import type { Indexed } from '@antorfr/adestia-content'
import { folderOf } from '../../app/paths.js'
import { listItems } from '../nodes.js'
import { finished, titleOf, under } from '../listing.js'
import { FileList } from './FileList.js'
import { Written, Row } from './Rows.js'
import type { Node } from '../nodes.js'
import type { Ctx } from './types.js'

/**
 * `:::list` — rows, from the pages under this one or from its own body.
 *
 * TWO provenances, and the same drawing. QUERIED, it answers from the INDEX
 * the shell already holds, which is why it costs nothing: `fields` is
 * published for every page, so `pull=status,due` is a lookup rather than a
 * fetch. A block of a child's BODY is not published, and this block
 * deliberately cannot ask for one — see the letter.
 *
 * WRITTEN, the body's lines are the rows: `Rôle: Personne`, split at the
 * first colon like `figures` and `timeline`. This exists because some lists
 * are DECLARATIONS — who holds which role on a project is decided by
 * somebody, derivable from nothing — and they are still lists. Naming them
 * `content` would have made that word mean "prose" on one page and "rows" on
 * another, which is the collision the closed vocabulary exists to stop.
 *
 * `closed=fold` is the default because a finished thing is exactly what
 * somebody opens to see how the last one went. Hidden, it is gone; folded, it
 * is out of the way and one click from being read. It has nothing to say
 * about written rows: a written line carries no status to be closed BY.
 */
export function ListBlock({ node, ctx }: { readonly node: Node; readonly ctx: Ctx }) {
  const attrs = node.attributes ?? {}
  const base = ctx.page?.path ? folderOf(ctx.page.path) : (ctx.base ?? '')
  const depth = attrs['depth'] ?? 'children'
  const closed = attrs['closed'] ?? 'fold'
  const view = attrs['view'] ?? 'rows'
  const pull = (attrs['pull'] ?? '').split(',').map((one) => one.trim()).filter(Boolean)

  // A body means the rows are WRITTEN, whatever `source` says: the lines are
  // in front of us, and querying past them would drop somebody's words.
  const written = listItems(node)
  if (written.length > 0) {
    const entries = written.map((text) => {
      const cut = text.indexOf(':')
      return cut === -1
        ? { label: '', value: text.trim() }
        : { label: text.slice(0, cut).trim(), value: text.slice(cut + 1).trim() }
    })
    return <Written entries={entries} view={view} />
  }

  if (attrs['source'] === 'files') {
    return <FileList node={node} ctx={ctx} view={view} />
  }

  // No index here — a chat bubble, a preview. Saying so beats drawing an
  // empty list, which would read as "this folder holds nothing".
  if (ctx.pages === undefined) {
    return <p className="adestia-block-note">Cette liste a besoin de l’index des pages.</p>
  }

  // `depth` says how far to look; `type` says what to keep. Both are needed:
  // a worksite's folder holds its sub-worksites AND the loose notes filed
  // beside them, so a list scoped by position alone mixes the two.
  const kinds = (attrs['type'] ?? '').split(',').map((one) => one.trim()).filter(Boolean)
  const rows = ctx.pages.filter(
    (page) =>
      page.path !== ctx.page?.path &&
      under(page.path, base, depth) &&
      (kinds.length === 0 || kinds.includes(String(page.fields['type'] ?? ''))),
  )
  const live = rows.filter((page) => !finished(page))
  const done = rows.filter((page) => finished(page))
  const sort = attrs['sort']
  const order = (a: Indexed, b: Indexed) =>
    sort
      ? String(a.fields[sort] ?? '').localeCompare(String(b.fields[sort] ?? ''))
      : titleOf(a).localeCompare(titleOf(b))
  live.sort(order)
  done.sort(order)

  const shown = closed === 'show' ? [...live, ...done] : live
  if (shown.length === 0 && done.length === 0) {
    return <p className="adestia-block-note">Rien sous cette page.</p>
  }

  return (
    <div className={`adestia-list adestia-list--${view}`}>
      {shown.map((page) => (
        <Row key={page.path} page={page} pull={pull} view={view} ctx={ctx} />
      ))}
      {closed === 'fold' && done.length > 0 && (
        <details className="adestia-list__fold">
          <summary>
            {done.length} {done.length === 1 ? 'page close' : 'pages closes'}
          </summary>
          {done.map((page) => (
            <Row key={page.path} page={page} pull={pull} view={view} ctx={ctx} />
          ))}
        </details>
      )}
    </div>
  )
}

