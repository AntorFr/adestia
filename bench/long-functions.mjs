#!/usr/bin/env node
/**
 * Lists the functions and components longer than 250 lines.
 *
 *   node bench/long-functions.mjs <file-or-folder>...
 *
 * A folder is walked for .ts/.tsx (tests and declarations skipped); a file is
 * read as given. Every function declaration, arrow or function expression bound
 * to a name, and method is counted from its first to its last line. Exits 1 if
 * it lists any. Uses the repository's own TypeScript compiler.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { argv, exit } from 'node:process'
import ts from 'typescript'

const LIMIT = 250

function files(target) {
  if (statSync(target).isFile()) return [target]
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const path = join(target, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : files(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : []
  })
}

function nameOf(node) {
  if (node.name) return node.name.getText()
  const parent = node.parent
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) return parent.name.getText()
  return undefined
}

function measure(path) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found = []
  const visit = (node) => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      const name = nameOf(node)
      if (name !== undefined) {
        const from = source.getLineAndCharacterOfPosition(node.getStart()).line
        const to = source.getLineAndCharacterOfPosition(node.getEnd()).line
        const lines = to - from + 1
        if (lines > LIMIT) found.push({ path, name, lines, line: from + 1 })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

const targets = argv.slice(2)
if (targets.length === 0) {
  console.error('usage: node bench/long-functions.mjs <file-or-folder>...')
  exit(2)
}
const long = targets.flatMap(files).flatMap(measure)
for (const item of long) console.log(`${item.path}:${item.line}  ${item.name}  ${item.lines} lines`)
exit(long.length > 0 ? 1 : 0)
