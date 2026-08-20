/**
 * The round-trip pipeline: markdown -> Tiptap document model -> markdown.
 *
 * - Model: the real Tiptap/ProseMirror schema built with `getSchema()`;
 *   every parsed document is materialized with `schema.nodeFromJSON()` and
 *   validated with `doc.check()` (content expressions + attribute checks).
 * - Markdown: the official `@tiptap/markdown` MarkdownManager (marked-based),
 *   used standalone — fully headless, no DOM, no jsdom.
 */
import { getSchema } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'

import { Callout, AppBlock, UnknownDirectiveGuard } from './directives.js'
import {
  Frontmatter,
  DocumentWithFrontmatter,
  Wikilink,
  MixedBulletList,
  BulletTaskItem,
  TightTable,
} from './extensions.js'

export const extensions = [
  StarterKit.configure({
    document: false, // replaced by DocumentWithFrontmatter
    bulletList: false, // replaced by MixedBulletList
  }),
  DocumentWithFrontmatter,
  Frontmatter,
  MixedBulletList,
  BulletTaskItem,
  Wikilink,
  Callout,
  AppBlock,
  UnknownDirectiveGuard,
  TightTable,
  TableRow,
  TableHeader,
  TableCell,
  Image.configure({ inline: true }),
]

export const schema = getSchema(extensions)

const manager = new MarkdownManager({ extensions })

/**
 * Parse markdown into the editor model.
 * Returns both the JSON form and the validated ProseMirror node.
 * Throws if the document does not satisfy the schema.
 */
export function parseMarkdown(markdown) {
  const json = manager.parse(markdown)
  const doc = schema.nodeFromJSON(json)
  doc.check() // enforce content expressions + attribute validity
  return { json, doc }
}

/** Serialize the editor model back to markdown (one trailing newline). */
export function serializeMarkdown(json) {
  const out = manager.serialize(json)
  return out.endsWith('\n') ? out : `${out}\n`
}
