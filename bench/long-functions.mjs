#!/usr/bin/env node
// Lists the functions longer than a limit in a folder of TypeScript sources.
//
//   node bench/long-functions.mjs <folder> [--max 250]
//
// A function is a declaration, a method, a function expression or an arrow
// function; its length is the lines from its first to its last, nested ones
// included (a component that holds a 300-line hook body is 300 lines long).
// Test files are skipped. Prints `path:line name — N lines`, longest first,
// and nothing when none is over the limit. Exits 0 either way: it reports,
// the reader of the report decides (a commit message may name a "kept: …").
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const args = process.argv.slice(2)
const maxAt = args.indexOf('--max')
const max = maxAt >= 0 ? Number(args.splice(maxAt, 2)[1]) : 250
const folder = args[0]
if (!folder || !Number.isFinite(max)) {
  console.error('usage: node bench/long-functions.mjs <folder> [--max 250]')
  process.exit(2)
}

// TypeScript is resolved from the folder asked about, then from here.
const require = createRequire(join(process.cwd(), 'package.json'))
const ts = require('typescript')

function* sources(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* sources(path)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !name.endsWith('.d.ts')) yield path
  }
}

function nameOf(node) {
  if (node.name) return node.name.getText()
  const parent = node.parent
  if (parent && ts.isVariableDeclaration(parent)) return parent.name.getText()
  if (parent && ts.isPropertyAssignment(parent)) return parent.name.getText()
  return '(anonymous)'
}

const found = []
for (const path of sources(folder)) {
  const text = readFileSync(path, 'utf8')
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (node) => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      const start = file.getLineAndCharacterOfPosition(node.getStart()).line
      const end = file.getLineAndCharacterOfPosition(node.getEnd()).line
      const lines = end - start + 1
      if (lines > max) found.push({ path, line: start + 1, name: nameOf(node), lines })
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
}
found.sort((a, b) => b.lines - a.lines)
for (const f of found) console.log(`${f.path}:${f.line} ${f.name} — ${f.lines} lines`)
