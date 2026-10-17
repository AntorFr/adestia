import { createElement as h, Fragment, type ReactNode } from 'react'
import { parseReference, resolveReference, WIDTHS } from '@antorfr/adestia-content'
import { resolveHref } from '../links.js'
import { isBlankBreak, type Node } from '../nodes.js'
import type { Ctx } from './types.js'
import { Meta } from './Meta.js'
import { directive } from './directive.js'

/**
 * A single newline, kept as one — in prose only.
 *
 * CommonMark folds a soft line break into a space, and for a FILE that is
 * right: where the lines of a paragraph were wrapped is an accident of the
 * editor somebody typed it in. A message is not a file. Nobody hard-wraps a
 * chat message, so a newline in one was put there to be a newline, and the
 * bubble had always shown it (the plain-text rendering this replaces ran
 * under `white-space: pre-wrap`). Folding them now would have been a silent
 * regression paid for by the fix — and the predecessor, which is where this
 * feature comes from, rendered with `breaks: true` for the same reason.
 *
 * Done here rather than in the grammar deliberately: the grammar is shared
 * with the editor and the server, where a file must keep meaning what
 * CommonMark says it means. This is a posture, not a dialect.
 */
function withBreaks(value: string): ReactNode {
  if (!value.includes('\n')) return value
  return value.split('\n').map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {line}
    </Fragment>
  ))
}

/**
 * How much of a line a block asked for, when it asked for less than all of it.
 *
 * `undefined` for anything that is not a block, and for a block that wants the
 * whole line — both are laid out the way everything else is, one after
 * another, and must not be pulled into a row.
 */
function widthOf(node: Node): number | undefined {
  if (node.type !== 'containerDirective' && node.type !== 'leafDirective') return undefined
  const asked = node.attributes?.['w']
  const share = asked === undefined ? undefined : WIDTHS[asked]
  return share !== undefined && share < 1 ? share : undefined
}

/**
 * Children, with narrow blocks gathered onto shared lines.
 *
 * `w` is the one attribute a block cannot honour by itself: a component draws
 * itself and never sees its neighbour, so "half a line" drawn alone is a
 * narrow block with a hole beside it. The grouping therefore belongs HERE,
 * where the sibling list exists — which is also what keeps one rule for every
 * block instead of each plugin inventing its own idea of a column.
 *
 * A run ends when the widths would pass one whole line, or when anything else
 * comes along. So `1/2 1/2` share a line, `1/3 1/3 1/3` share one, and
 * `2/3 1/2` do not: the second starts its own rather than being shrunk into a
 * width nobody asked for.
 */
function children(node: Node, ctx: Ctx): ReactNode {
  // A lone `<br />` is an empty paragraph the editor used to save that way:
  // nothing to draw, and nothing that should end a band of `w=` blocks.
  const list = (node.children ?? []).filter((one) => !isBlankBreak(one))
  const out: ReactNode[] = []

  for (let index = 0; index < list.length; index += 1) {
    const first = list[index]
    if (first === undefined) continue
    if (widthOf(first) === undefined) {
      out.push(<Fragment key={index}>{render(first, ctx)}</Fragment>)
      continue
    }

    const run: Node[] = []
    let filled = 0
    let cursor = index
    while (cursor < list.length) {
      const next = list[cursor]
      const share = next === undefined ? undefined : widthOf(next)
      // A hair of tolerance, because three thirds do not add to one in binary.
      if (next === undefined || share === undefined || filled + share > 1 + 1e-9) break
      run.push(next)
      filled += share
      cursor += 1
    }

    out.push(
      <div className="adestia-row" key={index}>
        {run.map((one, seat) => (
          <div
            className={`adestia-row__cell adestia-row__cell--${(one.attributes?.['w'] ?? '1').replace('/', '-')}`}
            key={seat}
          >
            {render(one, ctx)}
          </div>
        ))}
      </div>,
    )
    index = cursor - 1
  }

  return out
}

export function render(node: Node, ctx: Ctx): ReactNode {
  switch (node.type) {
    case 'root':
      return children(node, ctx)
    case 'yaml':
      // A page wears its frontmatter as chips. Prose has no frontmatter to
      // wear: `---` opening a message is a rule somebody drew, and the shared
      // grammar — which is the point — has already eaten the block behind it.
      // Drawing its text back beats mining it for chips it does not carry,
      // which renders nothing at all and takes the words down with it.
      return ctx.prose ? <p>{node.value}</p> : <Meta yaml={node.value ?? ''} />
    case 'paragraph':
      return <p>{children(node, ctx)}</p>
    case 'heading':
      // Headings shift down one level: the page's own H1 is its title, and a
      // document with two competing first-level headings reads as two
      // documents.
      return h(`h${Math.min((node.depth ?? 1) + 1, 6)}`, {}, children(node, ctx))
    case 'text':
      return ctx.prose ? withBreaks(node.value ?? '') : node.value
    case 'strong':
      return <strong>{children(node, ctx)}</strong>
    case 'emphasis':
      return <em>{children(node, ctx)}</em>
    case 'delete':
      return <del>{children(node, ctx)}</del>
    case 'inlineCode':
      return <code>{node.value}</code>
    case 'code':
      return (
        <pre>
          <code>{node.value}</code>
        </pre>
      )
    case 'blockquote':
      return <blockquote>{children(node, ctx)}</blockquote>
    case 'list':
      return node.ordered ? <ol>{children(node, ctx)}</ol> : <ul>{children(node, ctx)}</ul>
    case 'listItem':
      return (
        <li className={node.checked === null || node.checked === undefined ? undefined : 'adestia-task'}>
          {node.checked !== null && node.checked !== undefined && (
            <input type="checkbox" checked={node.checked} readOnly />
          )}
          {children(node, ctx)}
        </li>
      )
    case 'link': {
      const target = resolveHref(node.url, ctx.base)
      // A link to a neighbouring page opens IN PLACE, like a wikilink: the two
      // spellings mean the same thing to whoever wrote them, and only one of
      // them working is the kind of detail that teaches people to distrust the
      // interface.
      if (target.kind === 'page') {
        return (
          <button
            type="button"
            className="adestia-wikilink"
            onClick={() => ctx.openPage?.(target.path)}
          >
            {children(node, ctx)}
          </button>
        )
      }
      // Anything off-instance opens elsewhere: a page that swallowed the tab
      // on an external link would lose the reader their place.
      return (
        <a
          href={target.href}
          {...(/^[a-z]+:/i.test(node.url ?? '') ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {children(node, ctx)}
        </a>
      )
    }
    case 'image': {
      const source = resolveHref(node.url, ctx.base)
      // A page's own image is fetched from the workspace; one written as a
      // page path is a mistake the alt text will have to explain, and drawing
      // a broken square beats guessing at what was meant.
      return <img src={source.kind === 'page' ? node.url : source.href} alt={node.alt ?? ''} />
    }
    case 'wikiLink': {
      // A link to another page of this instance, opened in place.
      const target = node.value ?? ''
      const label = node.data?.alias ?? target
      const open = (path: string) => (
        <button type="button" className="adestia-wikilink" onClick={() => ctx.openPage?.(path)}>
          {label}
        </button>
      )

      // A PATH — how every reference in a corpus was written before ids
      // existed. Left exactly as it behaved, because its own resolution is not
      // this one's business.
      const reference = parseReference(target)
      if (!reference) return open(`${target}.md`)

      // No index here (a chat bubble): "not known" is not "gone". Falling
      // through keeps the old behaviour rather than calling a live link dead.
      if (ctx.pages === undefined) return open(`${target}.md`)

      const answer = resolveReference(ctx.pages, reference)
      if (answer.kind === 'found') return open(answer.page.path)

      // Lost, or answered by several pages — in both cases the link leads
      // nowhere certain, and pretending otherwise is what the old
      // `.filter(Boolean)` did by erasing the row entirely. The LABEL stays on
      // screen: a reader who can still read what was meant can repair it.
      return (
        <span
          className="adestia-wikilink adestia-wikilink--lost"
          title={
            answer.kind === 'ambiguous'
              ? `${answer.candidates.length} pages carry this id`
              : 'this page was not found'
          }
        >
          {label}
        </span>
      )
    }
    case 'table':
      return (
        <div className="adestia-table-scroll">
          <table>{children(node, ctx)}</table>
        </div>
      )
    case 'tableRow':
      return <tr>{children(node, ctx)}</tr>
    case 'tableCell':
      return <td>{children(node, ctx)}</td>
    case 'thematicBreak':
      return <hr />
    case 'break':
      return <br />
    case 'containerDirective':
    case 'leafDirective': {
      return directive(node, ctx, children)
    }
    default:
      // Never silently dropped: an unrendered node is a visible gap somebody
      // can report, where a swallowed one is content that vanished.
      return node.value ? <p>{node.value}</p> : null
  }
}

