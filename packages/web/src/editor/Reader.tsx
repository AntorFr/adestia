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

import { createElement as h, Fragment, type ComponentType, type ReactNode } from 'react'

import {
  blockSpec,
  parse,
  parseReference,
  resolveReference,
  toneOf,
  WIDTHS,
  type Indexed,
} from '@antorfr/adestia-content'

import { PluginBoundary } from '../plugins/Boundary.js'
import type { BlockProps, LayoutProps } from '../plugins/contract.js'

/** What a plugin contributed, by block name. */
export type BlockComponents = Readonly<Record<string, ComponentType<BlockProps>>>

/** Whole-page layouts, keyed by the frontmatter `type` their plugin claims. */
export type LayoutComponents = Readonly<Record<string, ComponentType<LayoutProps>>>

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

/**
 * The same resolution, but always ending in something fetchable.
 *
 * A block asks for a FILE — `source="assets/x.parcours.json"` — and does not
 * care that a neighbour ending in `.md` would have been a page to a link. It
 * wants bytes, so a page path is served as the file it also is.
 */
export function assetUrl(path: string, base: string | undefined): string {
  const target = resolveHref(path, base)
  if (target.kind !== 'page') return target.href
  return `/api/files/${target.path.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * The same path, as the workspace spells it — no route, no encoding.
 *
 * The companion of `assetUrl`, and both are needed: a block fetches its file
 * by URL, then has to NAME that same file to its own API ("assemble the GPX
 * of this one"). Deriving the second by peeling the first apart is what the
 * ported engine used to do, and it tied a plugin to the shell's route shape.
 */
export function workspacePath(path: string, base: string | undefined): string {
  const target = resolveHref(path, base)
  if (target.kind === 'page') return target.path
  // Anything with a scheme of its own was never a workspace file; handing back
  // what was written beats inventing a path that resolves to nothing.
  return target.href.startsWith('/api/files/')
    ? target.href.slice('/api/files/'.length).split('/').map(decodeURIComponent).join('/')
    : path
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
    <div className="adestia-editor__meta">
      {status && <span className={`adestia-stat adestia-stat--${toneOf(status)}`}>{status}</span>}
      {kinds.map((kind) => (
        <span key={kind} className="adestia-tag">
          {kind}
        </span>
      ))}
      {tags.map((tag) => (
        <span key={tag} className="adestia-tag">
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
  /**
   * The page itself, for the blocks it carries: its logical path, its store,
   * its frontmatter. `base` is derived from the first and is kept beside it
   * rather than recomputed — a link needs the folder, a block needs the page.
   */
  readonly page?: { readonly path: string; readonly store?: string; readonly fields?: Readonly<Record<string, unknown>> }
  readonly openPage?: (path: string) => void
  /** Blocks the active plugins draw, beyond the core's own. */
  readonly blocks?: BlockComponents
  /**
   * The instance's pages, for resolving a `[[type#id]]` reference.
   *
   * UNDEFINED means "not known here", which is NOT the same as "the target is
   * gone" — a chat bubble renders prose without the index, and declaring every
   * reference in it dead would be a lie the reader cannot check. Absent, the
   * link keeps the behaviour it had before ids existed.
   */
  readonly pages?: readonly Indexed[]
  /**
   * The source is PROSE, not a document — see `Prose` below. Only the head of
   * the source tells the two apart, so only the head reads this.
   */
  readonly prose?: boolean
}

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
  const list = node.children ?? []
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

function render(node: Node, ctx: Ctx): ReactNode {
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
      if (node.type === 'containerDirective' && node.name === 'callout') {
        const tone = node.attributes?.['type'] ?? 'note'
        return <aside className={`adestia-callout adestia-callout--${tone}`}>{children(node, ctx)}</aside>
      }
      if (node.type === 'containerDirective' && node.name === 'gallery') {
        return <div className="adestia-gallery">{children(node, ctx)}</div>
      }
      if (node.type === 'containerDirective' && node.name === 'content') {
        return <ContentBlock node={node} ctx={ctx} />
      }
      if (node.type === 'containerDirective' && node.name === 'figures') {
        return <Figures node={node} />
      }
      if (node.type === 'containerDirective' && node.name === 'table') {
        return <TableBlock node={node} ctx={ctx} />
      }
      if (node.type === 'containerDirective' && node.name === 'list') {
        return <ListBlock node={node} ctx={ctx} />
      }
      return <Contributed node={node} ctx={ctx} />
    }
    default:
      // Never silently dropped: an unrendered node is a visible gap somebody
      // can report, where a swallowed one is content that vanished.
      return node.value ? <p>{node.value}</p> : null
  }
}

/**
 * `plan-travail-garage` → `Plan travail garage`. The fallback when nothing
 * declares a label for a subject — declared beats guessed, guessed beats gone.
 */
function prettify(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name
}

/**
 * `:::content{type=…}` — a title and prose.
 *
 * The one rendering that makes the doctrine pay: a summary, a scope, a
 * context and a letter to Father Christmas are the same drawing, so they are
 * the same block and their difference is a word in `type`. Inventing a kind
 * of content costs nothing — no code, no manifest entry, no restart.
 *
 * The title is the subject prettified, since nothing declares labels yet. A
 * `pm-config` will one day say `summary: Synthèse`; until it does, the word
 * the author wrote is a better answer than no title at all.
 */
function ContentBlock({ node, ctx }: { readonly node: Node; readonly ctx: Ctx }) {
  const subject = node.attributes?.['type'] ?? ''
  const by = node.attributes?.['by']
  const on = node.attributes?.['on']
  return (
    <section className="adestia-content">
      {subject && <h3 className="adestia-content__title">{prettify(subject)}</h3>}
      {(by || on) && (
        <p className="adestia-content__by">{[by, on].filter(Boolean).join(' · ')}</p>
      )}
      {children(node, ctx)}
    </section>
  )
}

/**
 * `:::figures` — numbers as tiles, read from the markdown list inside it.
 *
 * `- Avancement: 62 % — 8 lots sur 13` gives a label, a figure and a caption.
 * The list is walked rather than rendered, which is the whole point: the FILE
 * stays a list somebody can read and edit by hand, and the tiles are what the
 * shell makes of it. A line that does not split on a colon is kept as a
 * caption-less tile rather than dropped — the reader never eats what it does
 * not understand.
 */
function Figures({ node }: { readonly node: Node }) {
  const tiles: { label: string; value: string; caption?: string }[] = []
  const walk = (kids: readonly Node[] | undefined) => {
    for (const kid of kids ?? []) {
      if (kid.type === 'listItem') {
        const text = plain(kid)
        const cut = text.indexOf(':')
        const label = cut === -1 ? '' : text.slice(0, cut).trim()
        const rest = (cut === -1 ? text : text.slice(cut + 1)).trim()
        const [value, ...tail] = rest.split(/\s+—\s+/)
        tiles.push({
          label,
          value: value ?? '',
          ...(tail.length > 0 ? { caption: tail.join(' — ') } : {}),
        })
        continue
      }
      walk(kid.children)
    }
  }
  walk(node.children)
  if (tiles.length === 0) return null
  return (
    <div className="adestia-figures">
      {tiles.map((tile, index) => (
        <div className="adestia-figure" key={`${tile.label}-${index}`}>
          <b className="adestia-figure__value">{tile.value}</b>
          <span className="adestia-figure__label">
            {tile.label}
            {tile.caption ? <em> · {tile.caption}</em> : null}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The text a node carries, however deep — labels, cells, titles. */
function plain(node: Node): string {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(plain).join('')
}

/**
 * `:::table{type=…}` — a markdown table whose FIRST COLUMN is read as a tone.
 *
 * `Moyen`, `Levé`, `En cours`: the same vocabulary `status:` uses on a page,
 * so a grid of risks is scanned down its left edge with the colours the rest
 * of the product already taught. `toneOf` is the content engine's, not a
 * second table that would drift from it.
 *
 * The body is rendered by the ordinary table branch; this only dresses it.
 */
function TableBlock({ node, ctx }: { readonly node: Node; readonly ctx: Ctx }) {
  return (
    <div className="adestia-table-scroll adestia-tableblock">{children(node, ctx)}</div>
  )
}

/**
 * `:::list{from=children}` — the pages under this one.
 *
 * It answers from the INDEX the shell already holds, which is why it costs
 * nothing: `fields` is published for every page, so `pull=status,due` is a
 * lookup rather than a fetch. A block of a child's BODY is not published, and
 * this block deliberately cannot ask for one — see the letter.
 *
 * `closed=fold` is the default because a finished thing is exactly what
 * somebody opens to see how the last one went. Hidden, it is gone; folded, it
 * is out of the way and one click from being read.
 */
function ListBlock({ node, ctx }: { readonly node: Node; readonly ctx: Ctx }) {
  const attrs = node.attributes ?? {}
  const base = ctx.page?.path ? folderOf(ctx.page.path) : (ctx.base ?? '')
  const depth = attrs['depth'] ?? 'children'
  const closed = attrs['closed'] ?? 'fold'
  const pull = (attrs['pull'] ?? '').split(',').map((one) => one.trim()).filter(Boolean)

  // No index here — a chat bubble, a preview. Saying so beats drawing an
  // empty list, which would read as "this folder holds nothing".
  if (ctx.pages === undefined) {
    return <p className="adestia-block-note">Cette liste a besoin de l’index des pages.</p>
  }

  const rows = ctx.pages.filter(
    (page) => page.path !== ctx.page?.path && under(page.path, base, depth),
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
    <div className="adestia-list">
      {shown.map((page) => (
        <Row key={page.path} page={page} pull={pull} ctx={ctx} />
      ))}
      {closed === 'fold' && done.length > 0 && (
        <details className="adestia-list__fold">
          <summary>
            {done.length} {done.length === 1 ? 'page close' : 'pages closes'}
          </summary>
          {done.map((page) => (
            <Row key={page.path} page={page} pull={pull} ctx={ctx} />
          ))}
        </details>
      )}
    </div>
  )
}

function Row({
  page,
  pull,
  ctx,
}: {
  readonly page: Indexed
  readonly pull: readonly string[]
  readonly ctx: Ctx
}) {
  const pulled = pull
    .map((name) => ({ name, value: page.fields[name] }))
    .filter((one) => one.value !== undefined && one.value !== '')
  return (
    <button
      type="button"
      className="adestia-list__row"
      onClick={() => ctx.openPage?.(page.path)}
    >
      <span className="adestia-list__title">{titleOf(page)}</span>
      {pulled.length > 0 && (
        <span className="adestia-list__pulled">
          {pulled.map((one) => (
            <span key={one.name} className="adestia-tag">
              {String(one.value)}
            </span>
          ))}
        </span>
      )}
    </button>
  )
}

/** `domaines/voyages/baden.md` → `domaines/voyages`. */
function folderOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut)
}

/**
 * Whether a page belongs in the list, at the depth asked for.
 *
 * The subtlety is that **a child is not always a file**. This product files a
 * sub-subject as a FOLDER — that is the whole hierarchy, decided 2026-09-04 —
 * so the row standing for a child chantier is that folder's own index page,
 * not a page beside it. A rule that only looked at files would list a project's
 * loose notes and miss every one of its sub-projects.
 *
 * Hence three answers rather than a depth counter:
 *
 * - `self`     the pages filed directly here, and nothing that stands for a folder
 * - `children` the same, PLUS the index of each direct sub-folder — the children
 * - `subtree`  everything below, at any depth
 *
 * An index page is never listed as a content page of its own folder: it IS the
 * folder. Which also keeps the page carrying the block out of its own list.
 */
function under(path: string, base: string, depth: string): boolean {
  const folder = folderOf(path)
  const inside = base === '' ? folder !== '' || true : folder === base || folder.startsWith(`${base}/`)
  if (!inside) return false
  if (depth === 'subtree') return true

  const rest = base === '' ? folder : folder.slice(base.length + 1).replace(/^\//, '')
  if (folder === base) return !isIndexPage(path)
  if (depth === 'self') return false
  // One folder down: only its index stands for it, the rest is that folder's business.
  return !rest.includes('/') && isIndexPage(path)
}

/** A folder's own index page is the folder, not one of its contents. */
function isIndexPage(path: string): boolean {
  const parts = path.split('/')
  const file = parts.at(-1)?.replace(/\.md$/i, '') ?? ''
  return /^index$/i.test(file) || (parts.length > 1 && file === parts.at(-2))
}

function finished(page: Indexed): boolean {
  return page.fields['finished'] === true || toneOf(page.fields['status']) === 'settled'
}

function titleOf(page: Indexed): string {
  const declared = page.fields['title']
  if (typeof declared === 'string' && declared !== '') return declared
  return prettify(page.path.split('/').at(-1)?.replace(/\.md$/i, '') ?? page.path)
}

/**
 * A block the core does not draw — a plugin's, or nobody's.
 *
 * Behind a boundary, deliberately: a block renders INSIDE somebody's page,
 * and a plugin that throws must cost its own rectangle rather than the text
 * around it. That is the same bargain the loader already makes for a factory.
 */
function Contributed({ node, ctx }: { readonly node: Node; readonly ctx: Ctx }) {
  const name = node.name ?? ''
  const Block = ctx.blocks?.[name]
  // A `flow` block gets its body; an `empty` one is its attributes and
  // nothing else, so it is not handed an empty fragment to wonder about.
  const body = blockSpec(name)?.content === 'flow' ? children(node, ctx) : undefined

  if (!Block) {
    // Two ways to land here, and the reader cannot act on either: a block no
    // plugin claims, or one whose plugin is off. Saying so beats drawing
    // nothing where a person expects something.
    //
    // The BODY is kept underneath. A block that holds prose holds somebody's
    // words, and losing them to a missing plugin would be a worse answer than
    // an ugly one — the same reason a refused page shows its raw source.
    return (
      <>
        <p className="adestia-unknown-block">
          :::{name} — {`this block does not render yet`}
        </p>
        {body}
      </>
    )
  }
  return (
    <PluginBoundary id={name} what="block">
      <Block
        attributes={node.attributes ?? {}}
        resolve={(target) => assetUrl(target, ctx.base)}
        locate={(target) => workspacePath(target, ctx.base)}
        {...(ctx.page ? { path: ctx.page.path } : {})}
        {...(ctx.page?.store ? { store: ctx.page.store } : {})}
        {...(ctx.page?.fields ? { fields: ctx.page.fields } : {})}
        {...(ctx.openPage ? { openPage: ctx.openPage } : {})}
      >
        {body}
      </Block>
    </PluginBoundary>
  )
}

/**
 * A source the grammar could not read, shown as it was written.
 *
 * Worse looking, and strictly better than a blank rectangle: whoever wrote it
 * still gets their words, and the failure is visible rather than silent.
 */
function raw(markdown: string): ReactNode {
  return <pre className="adestia-reader__raw">{markdown}</pre>
}

/**
 * The same grammar and the same switch, on something that is not a page.
 *
 * A chat message is markdown too. The agent writes `**gras**` and
 * `[label](url)` in it for the same reason it writes them in a page: markdown
 * is the only thing it writes. Rendering the two through one renderer is what
 * keeps a link written in a message and the same link written in a page from
 * meaning two different things — and it is why this costs no new dependency
 * and no second vocabulary.
 *
 * Two things separate the postures, and both are about the source being a
 * FRAGMENT rather than a document:
 *
 * - It has no frontmatter (see the `yaml` case above).
 * - It is relative to the workspace ROOT, not to a folder. An agent naming
 *   `voyages/baden-2026.md` in a message means the file at that path, so the
 *   base is `''` — present, and empty. That is what turns "j'ai écrit la
 *   fiche X" into something you can click.
 *
 * Plugin blocks are deliberately NOT passed: a `:::` block belongs to a page
 * that holds it, and one drawn inside a chat bubble would be a live control
 * in a transcript of a conversation that has already happened.
 */
export function Prose({
  markdown,
  openPage,
}: {
  readonly markdown: string
  readonly openPage?: (path: string) => void
}) {
  let tree: Node
  try {
    tree = parse(markdown) as unknown as Node
  } catch {
    return raw(markdown)
  }
  return (
    <div className="adestia-prose">
      {render(tree, { base: '', prose: true, ...(openPage ? { openPage } : {}) })}
    </div>
  )
}

export function Reader({
  markdown,
  path,
  store,
  fields,
  openPage,
  blocks,
  pages,
}: {
  readonly markdown: string
  /**
   * The page's own path, which is what makes a relative link resolvable.
   * Absent — a fragment rendered outside any page — leaves relative links as
   * written rather than resolving them against the root, which would point
   * them at a file that is not there.
   */
  readonly path?: string
  /** Which store carries it, when the instance composes more than one. */
  readonly store?: string
  /** Its frontmatter, for the blocks it carries. See `BlockProps`. */
  readonly fields?: Readonly<Record<string, unknown>>
  readonly openPage?: (path: string) => void
  /** What the active plugins draw. Absent means the core's vocabulary only. */
  readonly blocks?: BlockComponents
  /** The instance's pages, so a `[[type#id]]` reference can find its target. */
  readonly pages?: readonly Indexed[]
}) {
  let tree: Node
  try {
    tree = parse(markdown) as unknown as Node
  } catch {
    return raw(markdown)
  }
  // A page at the root has an EMPTY base, which is not the same as none: its
  // neighbours are the root's own files.
  const base = path === undefined ? undefined : path.slice(0, Math.max(path.lastIndexOf('/'), 0))
  return (
    <article className="adestia-reader">
      {render(tree, {
        ...(base === undefined ? {} : { base }),
        ...(path === undefined
          ? {}
          : { page: { path, ...(store ? { store } : {}), ...(fields ? { fields } : {}) } }),
        ...(openPage ? { openPage } : {}),
        ...(blocks ? { blocks } : {}),
        ...(pages ? { pages } : {}),
      })}
    </article>
  )
}
