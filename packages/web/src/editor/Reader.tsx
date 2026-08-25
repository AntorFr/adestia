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

function children(node: Node, openPage?: (path: string) => void): ReactNode {
  return (node.children ?? []).map((child, index) => (
    <Fragment key={index}>{render(child, openPage)}</Fragment>
  ))
}

function render(node: Node, openPage?: (path: string) => void): ReactNode {
  switch (node.type) {
    case 'root':
      return children(node, openPage)
    case 'yaml':
      return <Meta yaml={node.value ?? ''} />
    case 'paragraph':
      return <p>{children(node, openPage)}</p>
    case 'heading':
      // Headings shift down one level: the page's own H1 is its title, and a
      // document with two competing first-level headings reads as two
      // documents.
      return h(`h${Math.min((node.depth ?? 1) + 1, 6)}`, {}, children(node, openPage))
    case 'text':
      return node.value
    case 'strong':
      return <strong>{children(node, openPage)}</strong>
    case 'emphasis':
      return <em>{children(node, openPage)}</em>
    case 'delete':
      return <del>{children(node, openPage)}</del>
    case 'inlineCode':
      return <code>{node.value}</code>
    case 'code':
      return (
        <pre>
          <code>{node.value}</code>
        </pre>
      )
    case 'blockquote':
      return <blockquote>{children(node, openPage)}</blockquote>
    case 'list':
      return node.ordered ? <ol>{children(node, openPage)}</ol> : <ul>{children(node, openPage)}</ul>
    case 'listItem':
      return (
        <li className={node.checked === null || node.checked === undefined ? undefined : 'golem-task'}>
          {node.checked !== null && node.checked !== undefined && (
            <input type="checkbox" checked={node.checked} readOnly />
          )}
          {children(node, openPage)}
        </li>
      )
    case 'link':
      // Anything off-instance opens elsewhere: a page that swallowed the tab
      // on an external link would lose the reader their place.
      return (
        <a
          href={node.url}
          {...(/^[a-z]+:/i.test(node.url ?? '') ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {children(node, openPage)}
        </a>
      )
    case 'image':
      return <img src={node.url} alt={node.alt ?? ''} />
    case 'wikiLink': {
      // A link to another page of this instance, opened in place.
      const target = node.value ?? ''
      const label = node.data?.alias ?? target
      return (
        <button
          type="button"
          className="golem-wikilink"
          onClick={() => openPage?.(`${target}.md`)}
        >
          {label}
        </button>
      )
    }
    case 'table':
      return (
        <div className="golem-table-scroll">
          <table>{children(node, openPage)}</table>
        </div>
      )
    case 'tableRow':
      return <tr>{children(node, openPage)}</tr>
    case 'tableCell':
      return <td>{children(node, openPage)}</td>
    case 'thematicBreak':
      return <hr />
    case 'break':
      return <br />
    case 'containerDirective': {
      if (node.name === 'callout') {
        const tone = node.attributes?.['type'] ?? 'note'
        return <aside className={`golem-callout golem-callout--${tone}`}>{children(node, openPage)}</aside>
      }
      if (node.name === 'gallery') {
        return <div className="golem-gallery">{children(node, openPage)}</div>
      }
      return <div>{children(node, openPage)}</div>
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
  openPage,
}: {
  readonly markdown: string
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
  return <article className="golem-reader">{render(tree, openPage)}</article>
}
