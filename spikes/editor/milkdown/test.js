// Round-trip harness (spike 1 contract):
//   for every ../fixtures/*.md
//     1. parse markdown -> Milkdown (ProseMirror) document model
//     2. serialize back to markdown
//     3. write out/<fixture>.md
//     4. strict byte diff vs the input -> non-zero exit on mismatch
//   plus: structural assertions that typed blocks / frontmatter /
//   wikilinks are FIRST-CLASS nodes in the model, not raw text.
import './bootstrap-dom.js'

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
// FIXTURES_DIR override exists so the failure path of this harness can
// itself be exercised (see REPORT.md); default is the spike contract.
const fixturesDir = process.env.FIXTURES_DIR
  ? path.resolve(process.env.FIXTURES_DIR)
  : path.join(here, '..', 'fixtures')
const outDir = path.join(here, 'out')

// Structural expectations per fixture: node types that MUST appear in
// the parsed ProseMirror document (first-class requirement).
const expectedNodeTypes = {
  'basic.md': ['frontmatter', 'wiki_link'],
  'typed-blocks.md': ['frontmatter', 'callout', 'app', 'wiki_link'],
}

function collectNodeTypes(doc) {
  const seen = new Set()
  doc.descendants((node) => {
    seen.add(node.type.name)
  })
  return seen
}

const { createRoundTripper } = await import('./editor.js')
let tripper = await createRoundTripper()

fs.mkdirSync(outDir, { recursive: true })
const fixtures = fs
  .readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.md'))
  .sort()

if (fixtures.length === 0) {
  console.error('No fixtures found in', fixturesDir)
  process.exit(1)
}

let failures = 0

for (const fixture of fixtures) {
  const inputPath = path.join(fixturesDir, fixture)
  const outputPath = path.join(outDir, fixture)
  const input = fs.readFileSync(inputPath, 'utf8')

  let doc
  let output
  try {
    ;({ doc, output } = tripper.roundTrip(input))
  } catch (error) {
    failures += 1
    console.error(`FAIL ${fixture}: parse/serialize threw: ${error.message}`)
    // Milkdown's parserCtx closure reuses one ParserState instance; a
    // throw mid-parse leaves it dirty. Rebuild before the next fixture.
    tripper.destroy()
    tripper = await createRoundTripper()
    continue
  }

  fs.writeFileSync(outputPath, output)

  // 1. structural check: typed blocks & co are first-class nodes
  const seenTypes = collectNodeTypes(doc)
  const missing = (expectedNodeTypes[fixture] ?? []).filter(
    (t) => !seenTypes.has(t)
  )
  if (missing.length > 0) {
    failures += 1
    console.error(
      `FAIL ${fixture}: expected first-class node types missing from model: ${missing.join(', ')}`
    )
    console.error(`     model contains: ${[...seenTypes].sort().join(', ')}`)
    continue
  }

  // 2. byte-diff check (declared normalizations: NONE — strict compare)
  if (output === input) {
    console.log(`PASS ${fixture} (byte-identical round-trip)`)
  } else {
    failures += 1
    console.error(`FAIL ${fixture}: output differs from input`)
    const diff = spawnSync('diff', ['-u', inputPath, outputPath], {
      encoding: 'utf8',
    })
    console.error(diff.stdout || diff.stderr)
  }
}

tripper.destroy()

if (failures > 0) {
  console.error(`\n${failures} fixture(s) failed`)
  process.exit(1)
}
console.log(`\nAll ${fixtures.length} fixture(s) round-tripped byte-identical.`)
process.exit(0)
