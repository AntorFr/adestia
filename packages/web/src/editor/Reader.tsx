/**
 * Reading a page.
 *
 * A page was ALWAYS an editor: opening one to look at it mounted ProseMirror,
 * its toolbars, its drag handles and its slash menu over a document nobody
 * had asked to change. Reading and writing are two postures, and a product
 * that only has the second makes every reader feel like they might break
 * something.
 *
 * So this renders the mdast directly. Not a second grammar — the SAME parse
 * the editor and the server use, walked into React. The vocabulary is closed,
 * which is exactly what makes a hand-written renderer the right size: it is a
 * switch over known nodes, and an unknown one is drawn as what it is rather
 * than silently dropped.
 *
 * It also means reading never loads the editor at all: ProseMirror arrives
 * when somebody actually decides to write.
 */

import { createElement as h, Fragment, type ReactNode } from 'react'

import { parse, toneOf } from '@antorfr/golem-content'

/**
 * Where a link written in a page actually points.
 *
 * A page says `![Avant](assets/avant.jpg)` or `[Le devis](devis.pdf)`, and
 * means "next to me" — relative to the FOLDER the page lives in, the way it
 * reads on disk and the way the agent wrote it. Nothing in a document should
 * have to know that files are served under `/api/files`, so the translation
 * happens here, once, for images and links alike.
 *
 * Three destinations, because they behave differently: another page of this
 * instance opens IN PLACE (a document that made you leave and come back is a
 * document that lost your place), a workspace file is fetched from the file
 * route, and anything with a scheme of its own is left exactly as written.
 */
export type Href =
  | { readonly kind: 'external'; readonly href: string }
  | { readonly kind: 'page'; readonly path: string }
  | { readonly kind: 'file'; readonly href: string }

export function resolveHref(url: string | undefined, base: string | undefined): Href {
  const raw = url ?? ''
  // A scheme, a fragment, a bare query or an absolute path is already an
  // answer: rewriting it would break the one case where somebody knew exactly
  // what they meant. No base at all means no page to be relative TO — a
  // fragment rendered on its own keeps what was written rather than being
  // pointed at the root, where the file is not.
  if (base === undefined || raw === '' || /^[a-z][a-z0-9+.-]*:/i.test(raw) || /^[#?/]/.test(raw)) {
    return { kind: 'external', href: raw }
  }

  const segments = base.split('/').filter(Boolean)
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue
    // `..` climbing past the root is dropped rather than kept: the file route
    // refuses it anyway, and a path that walks out of the workspace is a typo,
    // not an intention worth transmitting.
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  const path = segments.join('/')
  if (path === '') return { kind: 'external', href: raw }
  if (/\.md$/i.test(path)) return { kind: 'page', path }
  return { kind: 'file', href: `/api/files/${path.split('/').map(encodeURIComponent).join('/')}` }
}

type Node = {
  type: string
  value?: string
  url?: string
  alt?: string
  lang?: string
  depth?: number
  ordered?: boolean
  checked?: boolean | null
  name?: string
  attributes?: Record<string, string> | null
  data?: { alias?: string }
  children?: Node[]
}

/** Frontmatter chips — the same ones the card and the editor wear. */
function Meta({ yaml }: { readonly yaml: string }) {
  const fields = new Map<string, string>()
  for (const line of yaml.split('\n')) {
    const cut = line.indexOf(':')
    if (cut < 1 || /^\s/.test(line)) continue
    fields.set(line.slice(0, cut).trim(), line.slice(cut + 1).trim().replace(/^["']|["']$/g, ''))
  }

  const status = fields.get('status') ?? fields.get('statut')
  const kinds = ['type', 'cat', 'role'].map((key) => fields.get(key)).filter(Boolean) as string[]
  const tags = (fields.get('tags') ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

  if (!status && kinds.length === 0 && tags.length === 0) return null

  return (
    <div className="golem-editor__meta">
      {status && <span className={`golem-stat golem-stat--${toneOf(status)}`}>{status}</span>}
      {kinds.map((kind) => (
        <span key={kind} className="golem-tag">
          {kind}
        </span>
      ))}
      {tags.map((tag) => (
        <span key={tag} className="golem-tag">
          #{tag}
        </span>
      ))}
    </div>
  )
}

/** What every node needs to know beyond itself: where it is, and how to leave. */
type Ctx = {
  /** The folder the page lives in — what a relative link is relative TO. */
  readonly base?: string
  readonly openPage?: (path: string) => void
}

function children(node: Node, ctx: Ctx): ReactNode {
  return (node.children ?? []).map((child, index) => (
    <Fragment key={index}>{render(child, ctx)}</Fragment>
  ))
}

function render(node: Node, ctx: Ctx): ReactNode {
  switch (node.type) {
    case 'root':
      return children(node, ctx)
    case 'yaml':
      return <Meta yaml={node.value ?? ''} />
    case 'paragraph':
      return <p>{children(node, ctx)}</p>
    case 'heading':
      // Headings shift down one level: the page's own H1 is its title, and a
      // document with two competing first-level headings reads as two
      // documents.
      return h(`h${Math.min((node.depth ?? 1) + 1, 6)}`, {}, children(node, ctx))
    case 'text':
      return node.value
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
        <li className={node.checked === null || node.checked === undefined ? undefined : 'golem-task'}>
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
            className="golem-wikilink"
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
      return (
        <button
          type="button"
          className="golem-wikilink"
          onClick={() => ctx.openPage?.(`${target}.md`)}
        >
          {label}
        </button>
      )
    }
    case 'table':
      return (
        <div className="golem-table-scroll">
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
    case 'containerDirective': {
      if (node.name === 'callout') {
        const tone = node.attributes?.['type'] ?? 'note'
        return <aside className={`golem-callout golem-callout--${tone}`}>{children(node, ctx)}</aside>
      }
      if (node.name === 'gallery') {
        return <div className="golem-gallery">{children(node, ctx)}</div>
      }
      return <div>{children(node, ctx)}</div>
    }
    case 'leafDirective':
    case 'textDirective':
      // The `app` block does not mount a plugin yet. Saying so beats drawing
      // nothing where a person expects something.
      return (
        <p className="golem-unknown-block">
          :::{node.name} — {`this block does not render yet`}
        </p>
      )
    default:
      // Never silently dropped: an unrendered node is a visible gap somebody
      // can report, where a swallowed one is content that vanished.
      return node.value ? <p>{node.value}</p> : null
  }
}

export function Reader({
  markdown,
  path,
  openPage,
}: {
  readonly markdown: string
  /**
   * The page's own path, which is what makes a relative link resolvable.
   * Absent — a fragment rendered outside any page — leaves relative links as
   * written rather than resolving them against the root, which would point
   * them at a file that is not there.
   */
  readonly path?: string
  readonly openPage?: (path: string) => void
}) {
  let tree: Node
  try {
    tree = parse(markdown) as unknown as Node
  } catch {
    // A page the grammar cannot read is shown as it was written: worse
    // looking, and strictly better than a blank screen.
    return <pre className="golem-reader__raw">{markdown}</pre>
  }
  // A page at the root has an EMPTY base, which is not the same as none: its
  // neighbours are the root's own files.
  const base = path === undefined ? undefined : path.slice(0, Math.max(path.lastIndexOf('/'), 0))
  return (
    <article className="golem-reader">
      {render(tree, { ...(base === undefined ? {} : { base }), ...(openPage ? { openPage } : {}) })}
    </article>
  )
}
