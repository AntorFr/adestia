/**
 * Document validation against the closed vocabulary.
 *
 * The decision this file encodes (spike 1 verdict, adopted mitigation): an
 * unknown or malformed block never causes a hard refusal and never causes a
 * silent rewrite. It produces a diagnostic, and the page opens read-only. A
 * refusal loses the user their file; a silent rewrite loses them their content.
 * Telling them exactly what is wrong loses them nothing.
 */

import type { Root, RootContent } from 'mdast'
import type { ContainerDirective, LeafDirective } from 'mdast-util-directive'
import { visit } from 'unist-util-visit'

import {
  shapesOf, blockSpec, isKnownBlock, RESERVED } from './vocabulary.js'

export type DiagnosticSeverity = 'error' | 'warning'

export interface Diagnostic {
  readonly severity: DiagnosticSeverity
  readonly message: string
  /** Additive wire metadata; the English message stays useful to agents and older clients. */
  readonly code?: string
  readonly args?: Readonly<Record<string, string>>
  /**
   * 1-indexed, when the parser knows it. Explicitly `| undefined` because
   * `exactOptionalPropertyTypes` is on: a position the parser did not give us
   * is a real, expressible state, not an absent field.
   */
  readonly line?: number | undefined
  readonly block?: string | undefined
}

type AnyDirective = ContainerDirective | LeafDirective

function hasContent(node: AnyDirective): boolean {
  return 'children' in node && Array.isArray(node.children) && node.children.length > 0
}

/** What a container may sit in, and the columns a band may have (AD-32). */
export const COLUMN_COUNTS: readonly number[] = [2, 3]

export function validateDocument(tree: Root): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  // `visit` reaches a parent before its children, so a child finds its parent here.
  const parents = new WeakMap<object, object>()
  const containerAbove = (node: object, names: readonly string[]): boolean => {
    for (let up = parents.get(node); up; up = parents.get(up)) {
      if (names.includes((up as { name?: string }).name ?? '')) return true
    }
    return false
  }

  const checkContainer = (directive: AnyDirective, name: string, line: number | undefined): void => {
    const refuse = (code: string, message: string, args: Record<string, string> = {}): void => {
      diagnostics.push({ severity: 'error', block: name, line, code, args: { block: name, ...args }, message })
    }
    if (name === 'section' && containerAbove(directive, ['section', 'col'])) {
      refuse(
        'container-depth',
        containerAbove(directive, ['col'])
          ? 'A section cannot sit in a column: a column holds blocks only.'
          : 'A section cannot sit in another section.',
      )
    } else if (name === 'columns' && containerAbove(directive, ['col'])) {
      refuse('container-depth', 'Columns cannot sit in a column: a column holds blocks only.')
    } else if (name === 'col') {
      const up = parents.get(directive) as { type?: string; name?: string } | undefined
      if (up?.type !== 'containerDirective' || up.name !== 'columns') {
        refuse('col-outside-columns', 'A "col" belongs in a "columns" band.')
      }
    }
    if (name === 'columns') {
      const children = (directive as ContainerDirective).children as RootContent[]
      const cols = children.filter((c) => c.type === 'containerDirective' && c.name === 'col').length
      if (!COLUMN_COUNTS.includes(cols)) {
        refuse('columns-count', `A "columns" band holds 2 or 3 "col"; this one holds ${cols}.`, { count: String(cols) })
      }
      if (children.some((c) => !(c.type === 'containerDirective' && c.name === 'col'))) {
        refuse('columns-content', 'A "columns" band holds "col" blocks only; the rest is kept but not drawn.')
      }
    }
  }

  visit(tree, (node, _index, parent) => {
    if (parent) parents.set(node, parent)
    // Only the two BLOCK forms: the grammar no longer parses an inline
    // `:name`, so a colon in prose can never reach this check.
    if (node.type !== 'containerDirective' && node.type !== 'leafDirective') {
      return
    }
    const directive = node as AnyDirective
    const line = directive.position?.start.line
    const name = directive.name

    if (!isKnownBlock(name)) {
      diagnostics.push({
        severity: 'error',
        block: name,
        line,
        code: 'unknown-block',
        args: { block: name },
        message: `Unknown block ":::${name}". The vocabulary is closed; extending it is a coded change.`,
      })
      return
    }

    const spec = blockSpec(name)!
    const attributes = directive.attributes ?? {}

    if (node.type === 'containerDirective') checkContainer(directive, name, line)

    // Judged against EVERY definition of the name, not the contextless one.
    // Definitions need not agree, and this validator has no page context: a
    // body legal under the app's definition must not be an ERROR under the
    // core's — "a mismatch is a warning, never a locked page". It stays an
    // error only when every definition agrees the shape is wrong.
    // `optional` is a definition that accepts both, so it settles the dispute
    // the same way a second plugin's disagreement does — nothing to complain
    // about in either direction.
    const shapes = shapesOf(name)
    const both = shapes.has('optional')
    if (spec.content === 'empty' && hasContent(directive) && !both) {
      const disputed = shapes.has('flow')
      diagnostics.push({
        severity: disputed ? 'warning' : 'error',
        block: name,
        line,
        code: disputed ? 'no-content-disputed' : 'no-content',
        args: { block: name },
        message: disputed
          ? `Block ":::${name}" holds a body only some of its definitions accept — it is kept, and drawn only where its definition takes one.`
          : `Block ":::${name}" takes no content — its attributes are its whole meaning.`,
      })
    }
    if (spec.content === 'flow' && !hasContent(directive) && !both) {
      const disputed = shapes.has('empty')
      diagnostics.push({
        severity: disputed ? 'warning' : 'error',
        block: name,
        line,
        code: disputed ? 'needs-content-disputed' : 'needs-content',
        args: { block: name },
        message: disputed
          ? `Block ":::${name}" is empty, which only some of its definitions allow.`
          : `Block ":::${name}" needs content.`,
      })
    }

    for (const [key, attributeSpec] of Object.entries(spec.attributes)) {
      const value = attributes[key]
      if (value === undefined || value === null || value === '') {
        if (attributeSpec.required) {
          diagnostics.push({
            severity: 'error',
            block: name,
            line,
            code: 'attribute-required',
            args: { block: name, key },
            message: `Block ":::${name}" requires the attribute "${key}".`,
          })
        }
        continue
      }
      if (attributeSpec.values && !attributeSpec.values.includes(value)) {
        diagnostics.push({
          severity: 'error',
          block: name,
          line,
          code: 'attribute-value',
          args: { block: name, key, value, accepted: attributeSpec.values.join(', ') },
          message: `":::${name}" attribute "${key}" is "${value}"; accepted: ${attributeSpec.values.join(', ')}.`,
        })
      }
    }

    for (const key of Object.keys(attributes)) {
      // RESERVED attributes belong to the DOCUMENT, not to any one rendering —
      // an id is the block's identity, `w` is how much of a line it takes —
      // so no spec declares them and every block accepts them. See
      // `vocabulary.ts`; declaring them per renderer would be one idea copied
      // as many times as there are renderers, and the ninth copy is the one
      // somebody forgets.
      if (Object.hasOwn(RESERVED, key)) {
        const accepted = RESERVED[key]
        const given = attributes[key]
        // Reserved does not mean unchecked: a closed set is still closed, and
        // a typo in `w` would otherwise lay the page out silently wrong.
        if (accepted && typeof given === 'string' && !accepted.includes(given)) {
          diagnostics.push({
            severity: 'error',
            block: name,
            line,
            code: 'attribute-value',
            args: { block: name, key, value: given, accepted: accepted.join(', ') },
            message: `":::${name}" attribute "${key}" is "${given}"; accepted: ${accepted.join(', ')}.`,
          })
        }
        continue
      }
      if (!Object.hasOwn(spec.attributes, key)) {
        // A warning, not an error: an unknown attribute is inert, and a
        // document is not worth locking down over a typo in a hint.
        diagnostics.push({
          severity: 'warning',
          block: name,
          line,
          code: 'attribute-unknown',
          args: { block: name, key },
          message: `":::${name}" has no attribute "${key}"; it will be ignored.`,
        })
      }
    }
  })

  return diagnostics
}

/** Frontmatter must be the very first thing in the file, or it is not frontmatter. */
export function frontmatterOf(tree: Root): string | undefined {
  const first: RootContent | undefined = tree.children[0]
  return first?.type === 'yaml' ? first.value : undefined
}

export function isEditable(diagnostics: readonly Diagnostic[]): boolean {
  return !diagnostics.some((d) => d.severity === 'error')
}
