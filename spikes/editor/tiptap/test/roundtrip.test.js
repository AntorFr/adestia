/**
 * Spike 1 harness — Tiptap headless candidate.
 *
 * For every fixture in ../fixtures:
 *   1. parse markdown into the Tiptap document model (schema-validated),
 *   2. serialize back to markdown,
 *   3. write the result to out/<fixture>.md,
 *   4. byte-diff against the input -> non-zero exit on ANY difference
 *      (declared normalizations in REPORT.md; none rewrite the comparison).
 *
 * Plus structural assertions proving that typed blocks, wikilinks and
 * frontmatter are first-class nodes (not raw text that survived by luck),
 * and a negative test proving the directive vocabulary is closed.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { Editor } from '@tiptap/core'

import { extensions, parseMarkdown, serializeMarkdown } from '../src/pipeline.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = process.env.FIXTURES_DIR || path.resolve(here, '../../fixtures')
const outDir = path.resolve(here, '../out')
mkdirSync(outDir, { recursive: true })

let failures = 0

function fail(msg) {
  failures += 1
  console.log(`FAIL  ${msg}`)
}
function pass(msg) {
  console.log(`ok    ${msg}`)
}

/** Collect every node of a given type. */
function collectNodes(doc, typeName) {
  const found = []
  doc.descendants(node => {
    if (node.type.name === typeName) found.push(node)
  })
  return found
}

/** True if any text node contains the needle (raw-text survival detector). */
function textContains(doc, needle) {
  let hit = false
  doc.descendants(node => {
    if (node.isText && node.text.includes(needle)) hit = true
  })
  return hit
}

function printDiff(name, expected, actual) {
  const e = expected.split('\n')
  const a = actual.split('\n')
  const max = Math.max(e.length, a.length)
  for (let i = 0; i < max; i += 1) {
    if (e[i] !== a[i]) {
      console.log(`  ${name}:${i + 1}`)
      console.log(`    - ${JSON.stringify(e[i] ?? '<missing line>')}`)
      console.log(`    + ${JSON.stringify(a[i] ?? '<missing line>')}`)
    }
  }
}

// ---------------------------------------------------------------- fixtures
const docs = {}

for (const file of readdirSync(fixturesDir).filter(f => f.endsWith('.md')).sort()) {
  const input = readFileSync(path.join(fixturesDir, file), 'utf8')
  let json
  let doc
  try {
    ;({ json, doc } = parseMarkdown(input))
  } catch (err) {
    fail(`${file}: parse threw: ${err.message}`)
    continue
  }
  docs[file] = doc

  const output = serializeMarkdown(json)
  writeFileSync(path.join(outDir, file), output)

  if (output === input) {
    pass(`${file}: byte-identical round-trip`)
  } else {
    fail(`${file}: round-trip diff`)
    printDiff(file, input, output)
  }

  // -- full editor loop: file -> model -> real Editor instance -> markdown --
  try {
    const editor = new Editor({ element: null, extensions, content: json })
    const fromEditor = serializeMarkdown(editor.getJSON())
    editor.destroy()
    if (fromEditor === input) {
      pass(`${file}: byte-identical through a live headless Editor instance`)
    } else {
      fail(`${file}: serializing from a live Editor instance diverges`)
      printDiff(`${file} (editor)`, input, fromEditor)
    }
  } catch (err) {
    fail(`${file}: headless Editor instantiation threw: ${err.message}`)
  }

  // -- shared structural assertions ----------------------------------------
  const fm = collectNodes(doc, 'frontmatter')
  if (fm.length === 1 && input.startsWith(`---\n${fm[0].attrs.content}\n---\n`)) {
    pass(`${file}: frontmatter is a dedicated node, raw YAML preserved byte-perfect`)
  } else {
    fail(`${file}: frontmatter node missing or raw YAML altered`)
  }

  if (textContains(doc, ':::')) {
    fail(`${file}: ':::' found in text nodes — directives survived as raw text`)
  } else {
    pass(`${file}: no ':::' in any text node`)
  }

  if (textContains(doc, '[[') || textContains(doc, ']]')) {
    fail(`${file}: '[[ ]]' found in text nodes — wikilinks are not modeled`)
  } else {
    pass(`${file}: no '[[' or ']]' in any text node`)
  }
}

// ------------------------------------------- basic.md structural checks
{
  const doc = docs['basic.md']
  if (doc) {
    const wikilinks = collectNodes(doc, 'wikilink')
    if (wikilinks.length === 1 && wikilinks[0].attrs.target === 'wikilink') {
      pass('basic.md: wikilink is an inline atom node with target attr')
    } else {
      fail('basic.md: expected exactly one wikilink node with target="wikilink"')
    }

    const tasks = collectNodes(doc, 'taskItem')
    const checkedStates = tasks.map(n => n.attrs.checked)
    if (tasks.length === 2 && checkedStates[0] === false && checkedStates[1] === true) {
      pass('basic.md: task items are taskItem nodes with checked attr [false, true]')
    } else {
      fail(`basic.md: expected 2 taskItem nodes [unchecked, checked], got ${JSON.stringify(checkedStates)}`)
    }

    const bulletLists = collectNodes(doc, 'bulletList')
    const mixed = bulletLists.find(list => {
      const types = []
      list.forEach(child => types.push(child.type.name))
      return types.includes('listItem') && types.includes('taskItem')
    })
    if (mixed) {
      pass('basic.md: mixed plain/task markdown list stays a single bulletList node')
    } else {
      fail('basic.md: mixed list was split — no bulletList contains both listItem and taskItem')
    }

    if (collectNodes(doc, 'table').length === 1) {
      pass('basic.md: table is a table node')
    } else {
      fail('basic.md: expected one table node')
    }
  }
}

// ------------------------------------- typed-blocks.md structural checks
{
  const doc = docs['typed-blocks.md']
  if (doc) {
    const callouts = collectNodes(doc, 'callout')
    const types = callouts.map(n => n.attrs.type)
    if (callouts.length === 2 && types[0] === 'warning' && types[1] === 'note') {
      pass('typed-blocks.md: 2 callout nodes with type attrs ["warning", "note"]')
    } else {
      fail(`typed-blocks.md: expected callout nodes [warning, note], got ${JSON.stringify(types)}`)
    }

    const warning = callouts[0]
    if (warning && warning.childCount >= 2 && collectNodes(warning, 'bulletList').length === 1
        && collectNodes(warning, 'wikilink').length === 1) {
      pass('typed-blocks.md: callout content is parsed markdown (paragraph + list + wikilink inside)')
    } else {
      fail('typed-blocks.md: callout content is not fully parsed block content')
    }

    const apps = collectNodes(doc, 'app')
    if (apps.length === 1 && apps[0].attrs.id === 'workbench' && apps[0].attrs.project === 'rangement-garage') {
      pass('typed-blocks.md: app directive is a leaf node with id/project attrs')
    } else {
      fail('typed-blocks.md: expected one app node with id="workbench" project="rangement-garage"')
    }
  }
}

// -------------------------------------------- closed-vocabulary negative
{
  let threw = false
  try {
    parseMarkdown(':::mystery{x="1"}\nboom\n:::\n')
  } catch {
    threw = true
  }
  if (threw) {
    pass('closed vocabulary: parsing an unknown directive (:::mystery) throws')
  } else {
    fail('closed vocabulary: unknown directive was accepted silently')
  }
}

// -------------------------------------------- schema rejects bad attrs
{
  let threw = false
  try {
    // content 'block+' forbids an empty callout; nodeFromJSON + check() must reject
    const { schema } = await import('../src/pipeline.js')
    schema.nodeFromJSON({ type: 'doc', content: [{ type: 'callout', attrs: { type: 'warning' }, content: [] }] }).check()
  } catch {
    threw = true
  }
  if (threw) {
    pass('schema validation: empty callout (content violates block+) is rejected by doc.check()')
  } else {
    fail('schema validation: invalid callout content was accepted')
  }
}

// ---------------------------------------- attribute validation hook
{
  let threw = false
  try {
    const { schema } = await import('../src/pipeline.js')
    schema.nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'callout',
        attrs: { type: 42 }, // validate: 'string|null' must reject a number
        content: [{ type: 'paragraph', content: [] }],
      }],
    }).check()
  } catch {
    threw = true
  }
  if (threw) {
    pass('schema validation: callout attr type=42 rejected by PM attribute validate')
  } else {
    fail('schema validation: non-string callout type was accepted')
  }
}

console.log(failures > 0 ? `\n${failures} failure(s)` : '\nAll checks passed')
process.exit(failures > 0 ? 1 : 0)
