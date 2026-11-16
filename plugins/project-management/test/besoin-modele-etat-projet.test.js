/**
 * The shipped "Project status" template (B-30, AD-36), read as docs/donnees.md fixes it
 * ("The shipped template") and not as the code draws it: where it lives, its frontmatter,
 * the order of its body, and that it carries no dated placeholder.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const dir = new URL('..', import.meta.url)
const file = (p) => readFileSync(new URL(p, dir), 'utf8')
const template = file('templates/project-status.md')
const manifest = JSON.parse(file('adestia-plugin.json'))

test('the manifest transmits the template and the three project blocks in the group Project', () => {
  assert.ok(manifest.templates.includes('templates/project-status.md'))
  for (const block of ['progress', 'milestones', 'risks']) {
    assert.equal(manifest.gallery[block].group, 'Project', block)
    assert.ok(manifest.gallery[block].name, block)
    assert.ok(manifest.gallery[block].line, block)
  }
})

test('the frontmatter names the template in en and fr, points at an existing picture and types the page', () => {
  const front = template.split('\n---\n')[0] + '\n'
  assert.match(front, /name: \{en: Project status, fr: État du projet\}/)
  assert.match(front, /image: \.\/project-status\.svg/)
  assert.ok(existsSync(new URL('templates/project-status.svg', dir)))
  assert.match(front, /\ntype: project-management\n/)
  assert.match(front, /\nproject-status: Green\n/)
})

test('the body is a summary section, a band of two columns (progress then milestones; risks), then the timeline over the children', () => {
  const body = template.split('\n---\n').slice(1).join('\n---\n')
  const at = (s) => body.indexOf(s)
  const order = [':::section{title="Summary"}', ':::::columns', ':::progress', ':::milestones', ':::risks', ':::timeline{depth=children source=children}']
  const positions = order.map(at)
  assert.ok(positions.every((p) => p >= 0), `all pieces present: ${positions}`)
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
  assert.equal((body.match(/^::::col$/gm) ?? []).length, 2)
  const lines = body.split('\n')
  const cols = lines.map((l, i) => (l === '::::col' ? i : -1)).filter((i) => i >= 0)
  const lineOf = (s) => lines.findIndex((l) => l.startsWith(s))
  const second = cols[1]
  assert.ok(lineOf(':::risks') > second, 'risks sit in the second column')
  assert.ok(lineOf(':::milestones') < second && lineOf(':::progress') < second, 'progress and milestones sit in the first')
})

test('the two written blocks start with one empty "-" line and nothing carries a date', () => {
  const body = template.split('\n---\n').slice(1).join('\n---\n')
  assert.match(body, /:::milestones\n-\n:::/)
  assert.match(body, /:::risks\n-\n:::/)
  assert.doesNotMatch(body, /\d{4}-\d{2}-\d{2}/)
})
