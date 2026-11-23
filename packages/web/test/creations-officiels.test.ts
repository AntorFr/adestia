// Review of the official plugins (B-34, P-21 step 4): what each manifest declares, read from the
// files a plugin ships — not from the loader — and what the + of the home then lists.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { readTemplateDeclaration, splitFrontmatter } from '@antorfr/adestia-content'
import { parsePluginManifest } from '@antorfr/adestia-schemas'

import { creationsFor, pluginCreations } from '../src/app/creations.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'plugins')
const ids = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'adestia-plugin.json')))
  .map((d) => d.name)
const manifest = (id: string) => parsePluginManifest(JSON.parse(readFileSync(join(root, id, 'adestia-plugin.json'), 'utf8')), id)
const read = (id: string, file: string) => readFileSync(join(root, id, file), 'utf8')
const SHIPPING = ['journal', 'project-management', 'todo']

describe('official plugins: creations (B-34)', () => {
  it('only journal, todo and project-management declare a creation; the other eight declare none', () => {
    expect(ids.length).toBe(11)
    expect(ids.filter((id) => (manifest(id).creations ?? []).length > 0).sort()).toEqual(SHIPPING)
    for (const id of ids.filter((i) => !SHIPPING.includes(i))) expect(manifest(id).templates ?? []).toEqual([])
  })
  it.each(SHIPPING)('%s: one creation, a template action on a model its templates key lists, shown from the home', (id) => {
    const m = manifest(id)
    expect(m.creations).toHaveLength(1)
    const c = m.creations![0]!
    expect(c.action).toEqual({ template: expect.stringMatching(/^templates\/[^/]+\.md$/) })
    expect(m.templates).toEqual([(c.action as { template: string }).template])
    expect(existsSync(join(root, id, (c.action as { template: string }).template))).toBe(true)
    expect(c.where === undefined || c.where.includes('home')).toBe(true)
    const label = c.label as { en: string; fr: string }
    expect(label.en).toBeTruthy()
    expect(label.fr).toBeTruthy()
  })
  it.each([['journal', 'templates/journal.md', 'journal.svg'], ['todo', 'templates/task-list.md', 'task-list.svg'], ['project-management', 'templates/project-status.md', 'project-status.svg']])(
    '%s: the model declares a bilingual name and description and an image that exists',
    (id, file, image) => {
      const decl = readTemplateDeclaration(read(id, file))!
      expect(decl.image).toBe(`./${image}`)
      expect(existsSync(join(root, id, 'templates', image))).toBe(true)
      for (const text of [decl.name, decl.description]) expect(text).toEqual({ en: expect.any(String), fr: expect.any(String) })
    },
  )
  it.each([['journal', 'journal.svg'], ['todo', 'task-list.svg']])('%s: the image is a 160×72 svg', (id, image) => {
    const svg = read(id, `templates/${image}`)
    expect(svg).toMatch(/viewBox="0 0 160 72"/)
    expect(svg).not.toMatch(/<script|onload=|href=/i)
  })
  it('the home lists New folder, Journal, Task list, Project status and nothing else, each naming its plugin', () => {
    const loaded = SHIPPING.map((id) => ({ id, creations: manifest(id).creations }))
    const list = creationsFor({ at: 'home' }, [''], pluginCreations(loaded as never, 'en'))
    expect(list.map((c) => c.label).sort()).toEqual(['Journal', 'New folder', 'Project status', 'Task list'].sort())
    expect(list.filter((c) => c.plugin).map((c) => c.plugin).sort()).toEqual(SHIPPING)
  })
  it('each plugin icon is one the app draws, not the page fallback', () => {
    const loaded = SHIPPING.map((id) => ({ id, creations: manifest(id).creations }))
    expect(pluginCreations(loaded as never, 'en').map((c) => c.declaration.icon)).not.toContain('file-text')
  })
  it('in French the home says Liste de tâches, not Task', () => {
    const loaded = SHIPPING.map((id) => ({ id, creations: manifest(id).creations }))
    const labels = creationsFor({ at: 'home' }, [''], pluginCreations(loaded as never, 'fr')).map((c) => c.label)
    expect(labels).toContain('Liste de tâches')
    expect(labels).toContain('Journal')
    expect(labels).not.toContain('Task')
  })
  it('journal disabled: its entry leaves the list, the others stay', () => {
    const loaded = ['todo', 'project-management'].map((id) => ({ id, creations: manifest(id).creations }))
    const labels = creationsFor({ at: 'home' }, [''], pluginCreations(loaded as never, 'en')).map((c) => c.label)
    expect(labels).not.toContain('Journal')
    expect(labels).toHaveLength(3)
  })
})

describe('official plugins: the models (P-21 step 4)', () => {
  it('journal: a cover page typed journal, no folder created, nothing beyond the page', () => {
    const md = read('journal', 'templates/journal.md')
    const { head } = splitFrontmatter(md)
    expect(head).toMatch(/^type: journal$/m)
    expect(manifest('journal').types).toContain('journal')
    expect(readdirSync(join(root, 'journal', 'templates')).sort()).toEqual(['journal.md', 'journal.svg'])
  })
  it('todo: the page carries the checklist block, with no task type and no task.md model', () => {
    const md = read('todo', 'templates/task-list.md')
    expect(md).toMatch(/^:::checklist\n:::\s*$/m)
    expect(splitFrontmatter(md).head).not.toMatch(/^type:/m)
    expect(existsSync(join(root, 'todo', 'templates', 'task.md'))).toBe(false)
    expect(manifest('todo').templates).toEqual(['templates/task-list.md'])
  })
  it('todo: the checklist block the model uses is one the plugin declares', () => {
    expect(Object.keys(manifest('todo').vocabulary ?? {})).toContain('checklist')
  })
})
