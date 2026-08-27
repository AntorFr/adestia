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

import { blockSpec, isKnownBlock } from './vocabulary.js'

export type DiagnosticSeverity = 'error' | 'warning'

export interface Diagnostic {
  readonly severity: DiagnosticSeverity
  readonly message: string
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

export function validateDocument(tree: Root): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  visit(tree, (node) => {
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
        message: `Unknown block ":::${name}". The vocabulary is closed; extending it is a coded change.`,
      })
      return
    }

    const spec = blockSpec(name)!
    const attributes = directive.attributes ?? {}

    if (spec.content === 'empty' && hasContent(directive)) {
      // Guarded rather than tolerated: the serializer would drop the body, and
      // a body silently lost is worse than a page that refuses to look normal.
      diagnostics.push({
        severity: 'error',
        block: name,
        line,
        message: `Block ":::${name}" takes no content — its attributes are its whole meaning.`,
      })
    }
    if (spec.content === 'flow' && !hasContent(directive)) {
      diagnostics.push({
        severity: 'error',
        block: name,
        line,
        message: `Block ":::${name}" needs content.`,
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
          message: `":::${name}" attribute "${key}" is "${value}"; accepted: ${attributeSpec.values.join(', ')}.`,
        })
      }
    }

    for (const key of Object.keys(attributes)) {
      if (!Object.hasOwn(spec.attributes, key)) {
        // A warning, not an error: an unknown attribute is inert, and a
        // document is not worth locking down over a typo in a hint.
        diagnostics.push({
          severity: 'warning',
          block: name,
          line,
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
