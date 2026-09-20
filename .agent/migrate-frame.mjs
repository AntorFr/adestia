#!/usr/bin/env node
// Migrate pages written before 0.65 to the `frame=` / `show=` spellings.
//
//   node migrate-frame.mjs <root> [--write] [--frame-lists]
//
// Without --write it only prints what it would change. It is idempotent: a
// page already migrated comes out untouched.
//
//   content{view=cards}          -> content{frame=card}
//   content{view=plain}          -> content{}            (the old default)
//   checklist|timeline{view=cards} -> {frame=card}
//   checklist{view=open|late|today|later|all} -> {show=…}
//   list{…}                      -> view left alone; --frame-lists adds
//                                   frame=card to rows lists (the box they
//                                   used to get for free)

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const [root, ...flags] = process.argv.slice(2)
if (!root) { console.error('usage: migrate-frame.mjs <root> [--write] [--frame-lists]'); process.exit(2) }
const WRITE = flags.includes('--write')
const FRAME_LISTS = flags.includes('--frame-lists')

const FILTERS = new Set(['open', 'late', 'today', 'later', 'all'])
const CARDABLE = new Set(['content', 'checklist', 'timeline', 'table', 'figures', 'gallery', 'callout'])

/** Split an attribute string into tokens, keeping quoted values whole. */
function tokens(attrs) {
  return attrs.match(/(?:[^\s"']+(?:"[^"]*"|'[^']*')?)+/g) ?? []
}
const unquote = (v) => v.replace(/^["']|["']$/g, '')

function migrateLine(line) {
  const m = line.match(/^(:::+)([a-z][a-z0-9-]*)\{([^}]*)\}(\s*)$/)
  if (!m) return line
  const [, fence, name, attrs, tail] = m
  const parts = tokens(attrs)
  const has = (key) => parts.some((p) => p.startsWith(key + '='))
  const out = []
  let changed = false

  for (const p of parts) {
    const eq = p.indexOf('=')
    const key = eq === -1 ? p : p.slice(0, eq)
    const value = eq === -1 ? '' : unquote(p.slice(eq + 1))

    if (key !== 'view' || name === 'list') { out.push(p); continue }

    if (value === 'cards' && CARDABLE.has(name)) {
      if (!has('frame')) out.push('frame=card')
      changed = true
    } else if (value === 'plain' && name === 'content') {
      changed = true // the old default: nothing replaces it
    } else if (name === 'checklist' && FILTERS.has(value)) {
      if (!has('show')) out.push(`show=${value}`)
      changed = true
    } else {
      out.push(p) // a `view` this migration does not know: leave it, and say so
      console.error(`  ? ${name}{… view=${value}} laissé tel quel`)
    }
  }

  if (name === 'list' && FRAME_LISTS && !has('frame')) {
    const view = parts.find((p) => p.startsWith('view='))
    if (!view || unquote(view.slice(5)) === 'rows') { out.push('frame=card'); changed = true }
  }

  if (!changed) return line
  return `${fence}${name}{${out.join(' ')}}${tail}`
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.isFile() && e.name.endsWith('.md')) yield p
  }
}

let files = 0, blocks = 0
for (const file of walk(root)) {
  const before = readFileSync(file, 'utf8')
  const lines = before.split('\n')
  const after = lines.map(migrateLine)
  if (after.every((l, i) => l === lines[i])) continue
  files++
  console.log(file)
  after.forEach((l, i) => { if (l !== lines[i]) { blocks++; console.log(`  - ${lines[i]}\n  + ${l}`) } })
  if (WRITE) writeFileSync(file, after.join('\n'))
}
console.log(`\n${blocks} bloc(s) dans ${files} page(s)${WRITE ? ' — RÉÉCRITS' : ' — essai à blanc'}`)
if (statSync(root).isDirectory() === false) process.exit(2)
