/** Static regression guard for the chat reports already repaired in e00156a (AD-21). */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = new URL('../src/', import.meta.url)
const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.(?:tsx?|css)$/.test(file))
  .map((file) => ({ file, text: readFileSync(new URL(file, root), 'utf8') }))

describe('chat reports already repaired before the tranche', () => {
  it('keeps the obsolete busy and close classes out of source and styles', () => {
    const hits = files.filter(({ text }) => /adestia-composer--busy\b|adestia-sheet__close\b/.test(text))
    expect(hits.map(({ file }) => file)).toEqual([])
  })

  it('defines the origin base rule once and uses it in the signature sheet', () => {
    const rules = files.filter(({ file }) => file.endsWith('.css')).flatMap(({ text }) =>
      [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.adestia-sheet__origin\s*\{/g)],
    )
    expect(rules).toHaveLength(1)
    const signature = readFileSync(new URL('chat/Signatures.tsx', root), 'utf8')
    expect(signature).toMatch(/className=["']adestia-sheet__origin["']/)
  })

  it('allows a literal upload failed message only as a translation key', () => {
    const hits: string[] = []
    for (const { file, text } of files.filter(({ file }) => /\.tsx?$/.test(file))) {
      const source = ts.createSourceFile(fileURLToPath(new URL(file, root)), text, ts.ScriptTarget.Latest, true)
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteralLike(node) && /upload failed/i.test(node.text)) {
          const parent = node.parent
          const translated = ts.isCallExpression(parent)
            && ts.isIdentifier(parent.expression) && parent.expression.text === 't'
            && parent.arguments[0] === node
          if (!translated) {
            const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
            hits.push(`${file}:${line + 1}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(hits).toEqual([])
  })
})
