#!/usr/bin/env node
// Longest function in each given file, by the TypeScript AST (a component is a function).
// usage: node scripts/function-lines.mjs [--max 250] <file>...   — exits 1 over the limit.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const ts = createRequire(import.meta.url)('typescript')
const args = process.argv.slice(2)
const at = args.indexOf('--max')
const max = at >= 0 ? Number(args.splice(at, 2)[1]) : 250
let over = 0
for (const file of args) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  let longest = { name: '(none)', lines: 0 }
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node.body) {
      const from = source.getLineAndCharacterOfPosition(node.getStart()).line
      const to = source.getLineAndCharacterOfPosition(node.getEnd()).line
      const lines = to - from + 1
      if (lines > longest.lines) longest = { name: node.name?.getText() ?? `<anonymous@${from + 1}>`, lines }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (longest.lines > max) over += 1
  console.log(`${longest.lines > max ? 'OVER' : 'ok  '} ${file}: ${longest.name} ${longest.lines}`)
}
process.exit(over ? 1 : 0)
