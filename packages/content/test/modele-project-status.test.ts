/**
 * Task `adestia-pages-etat-projet-gabarit` (B-30, AD-36), from its exit criterion and not from the template's code:
 * the shipped "Project status" model parses without a diagnostic once the plugin's vocabulary is registered,
 * declares its names in both languages, an image and a description, holds a summary, a two-column band
 * (progress + milestones, risks) and a timeline in that order, and carries no date written in advance.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readTemplateDeclaration } from '../src/index.js'
import { parse } from '../src/pipeline.js'
import { forgetContributedBlocks, registerBlocks } from '../src/vocabulary.js'
import { validateDocument } from '../src/validate.js'

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'plugins', 'project-management')
const manifest = JSON.parse(readFileSync(join(plugin, 'adestia-plugin.json'), 'utf8')) as { templates?: string[]; vocabulary: Record<string, never> }
const text = readFileSync(join(plugin, 'templates', 'project-status.md'), 'utf8')

beforeEach(() => registerBlocks(manifest.vocabulary, { plugin: 'project-management', kind: 'feature' }))
afterEach(() => forgetContributedBlocks())

describe('the shipped Project status model', () => {
  it('is declared by the manifest, directly under templates/', () => {
    expect(manifest.templates).toEqual(['templates/project-status.md'])
  })

  it('parses with no diagnostic', () => {
    expect(validateDocument(parse(text))).toEqual([])
  })

  it('declares its name in English and French, a description and an image that exists', () => {
    const declared = readTemplateDeclaration(text)
    expect(declared?.name).toEqual({ en: 'Project status', fr: 'État du projet' })
    expect(declared?.description).toBeTruthy()
    expect(declared?.image).toBe('./project-status.svg')
    expect(readFileSync(join(plugin, 'templates', 'project-status.svg'), 'utf8')).toMatch(/<svg/)
  })

  it('holds the summary, then the band progress+milestones | risks, then the timeline', () => {
    const blocks = [...text.matchAll(/^(:{3,})(\w+)/gm)].map((m) => `${m[1]!.length}${m[2]}`)
    expect(blocks).toEqual(['3section', '5columns', '4col', '3progress', '3milestones', '4col', '3risks', '3timeline'])
  })

  it('writes no date in advance', () => {
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(text).not.toMatch(/\b(due|start)\s*:/)
  })
})
