/**
 * Blocks a plugin adds to the closed vocabulary.
 *
 * What these guard is a boundary, not a feature: the vocabulary stays closed
 * to PAGES and opens only to an activated plugin, the core never loses a name
 * to one, and a block nobody contributed keeps behaving exactly as it did
 * before any of this existed.
 */

import { afterEach, describe, expect, it } from 'vitest'

import { parse } from '../src/pipeline.js'
import { validateDocument } from '../src/validate.js'
import {
  blockSpec,
  contributedBlocks,
  forgetContributedBlocks,
  isKnownBlock,
  registerBlocks,
  resolveBlock,
} from '../src/vocabulary.js'

const PARCOURS = {
  parcours: {
    content: 'empty',
    description: 'A walk, drawn from its own file.',
    attributes: {
      source: { required: true },
      vue: { values: ['carte', 'lien'], default: 'carte' },
    },
  },
} as const

afterEach(() => forgetContributedBlocks())

/**
 * La marche de résolution — la règle du 09/09, cas par cas.
 *
 * `from=` répond seul quand il est écrit. Absent, on parcourt les définisseurs
 * du plus proche au plus lointain : l'app du domaine, les features dans l'ordre
 * déclaré, le cœur, une app étrangère. Une feature est sautée quand le cœur
 * définit aussi le nom. Et la phrase qui borne tout : on borne une
 * REDÉFINITION, jamais une définition.
 */
describe('un désaccord de forme entre définitions', () => {
  it("avertit au lieu de verrouiller, quand l'une des définitions accepte", () => {
    // La promesse du 04/09, enfin tenue par le validateur : « a mismatch is a
    // warning and a visible notice on the block, never a locked page ». Une
    // app redéfinit `list` (vide au cœur) en bloc à corps ; une page de son
    // domaine écrit ce corps ; le validateur sans contexte ne peut pas savoir
    // qui gagne — il ne verrouille donc pas.
    registerBlocks(
      { list: { content: 'flow', description: 'une liste redessinée, à corps' } },
      { plugin: 'projets', kind: 'app' },
    )
    const issues = validateDocument(parse(':::list\nUn corps.\n:::\n'))
    const shape = issues.find((one) => one.block === 'list')
    expect(shape?.severity).toBe('warning')
  })

  it('reste une ERREUR quand toutes les définitions refusent le corps', () => {
    // Sans désaccord, la garde d'origine tient : le sérialiseur perdrait ce
    // corps, et un corps perdu en silence est pire qu'une page verrouillée.
    const issues = validateDocument(parse(':::app{id=x}\nUn corps.\n:::\n'))
    const shape = issues.find((one) => one.block === 'app')
    expect(shape?.severity).toBe('error')
  })
})

describe('resolveBlock', () => {
  it('donne au domaine son propre dessin, et le cœur partout ailleurs', () => {
    registerBlocks(
      { table: { content: 'flow', description: 'un tableau à gravités', attributes: { type: {} } } },
      { plugin: 'projets', kind: 'app' },
    )
    expect(resolveBlock('table', { owner: 'projets' })?.plugin).toBe('projets')
    expect(resolveBlock('table', { owner: 'voyages' })?.plugin).toBe('core')
    expect(resolveBlock('table')?.plugin).toBe('core')
  })

  it('ne laisse JAMAIS une feature prendre un nom du cœur sans être nommée', () => {
    // Une app possède un domaine : l'emplacement de la page porte le choix.
    // Une feature est partout : rien ne le porte, donc elle s'écrit.
    registerBlocks(
      { table: { content: 'flow', description: 'tableau enrichi' } },
      { plugin: 'stats', kind: 'feature' },
    )
    expect(resolveBlock('table', { features: ['stats'] })?.plugin).toBe('core')
    expect(resolveBlock('table', { features: ['stats'], from: 'stats' })?.plugin).toBe('stats')
  })

  it("fait porter le bloc custom d'une app sur TOUTE l'instance", () => {
    // « On borne une redéfinition, jamais une définition » : personne d'autre
    // ne réclame `checklist`, donc le borner ne protégerait rien et le
    // casserait partout ailleurs.
    registerBlocks(
      { checklist: { content: 'empty', description: 'les tâches du dossier' } },
      { plugin: 'todo', kind: 'app' },
    )
    expect(resolveBlock('checklist', { owner: 'voyages' })?.plugin).toBe('todo')
    expect(resolveBlock('checklist')?.plugin).toBe('todo')
  })

  it('départage deux features sur un nom sans cœur par l’ordre déclaré', () => {
    registerBlocks(
      { meteo: { content: 'empty', description: 'la météo, version A' } },
      { plugin: 'meteo-a', kind: 'feature' },
    )
    registerBlocks(
      { meteo: { content: 'empty', description: 'la météo, version B' } },
      { plugin: 'meteo-b', kind: 'feature' },
    )
    expect(resolveBlock('meteo', { features: ['meteo-b', 'meteo-a'] })?.plugin).toBe('meteo-b')
    expect(resolveBlock('meteo', { features: ['meteo-a', 'meteo-b'] })?.plugin).toBe('meteo-a')
    // Et la page peut toujours nommer, contre l'ordre.
    expect(resolveBlock('meteo', { features: ['meteo-a'], from: 'meteo-b' })?.plugin).toBe('meteo-b')
  })

  it('rend le tableau NU sur demande, dans un domaine qui le redessine', () => {
    registerBlocks(
      { table: { content: 'flow', description: 'à gravités' } },
      { plugin: 'projets', kind: 'app' },
    )
    expect(resolveBlock('table', { owner: 'projets', from: 'core' })?.plugin).toBe('core')
  })

  it('ne résout PAS un `from=` que personne ne porte', () => {
    // Un avis visible au rendu, pas une invention : nommer un plugin absent
    // doit se voir, exactement comme un lien mort.
    expect(resolveBlock('table', { from: 'disparu' })).toBeUndefined()
  })
})


describe('the registry', () => {
  it('keeps a claim on a core name, and the core stays the CONTEXTLESS answer', () => {
    // The reversal of five days: `registerBlocks` used to refuse this outright.
    // What the closed vocabulary protects is protected one level up now —
    // resolution is contextual, so the claim only ever wins inside the
    // claiming app's own domain. Without a context, the core still answers.
    const refused = registerBlocks(
      { callout: { content: 'flow', description: 'mine now' } },
      { plugin: 'projets', kind: 'app' },
    )
    expect(refused).toEqual([])
    expect(blockSpec('callout')?.description).toBe('A highlighted aside: note, tip or warning.')
  })

  it('takes a block with no attributes at all', () => {
    registerBlocks({ signature: { content: 'empty', description: 'A sign-off.' } })
    expect(blockSpec('signature')?.attributes).toEqual({})
  })

  it('gives the block back when the plugin goes away', () => {
    registerBlocks(PARCOURS)
    expect(isKnownBlock('parcours')).toBe(true)
    forgetContributedBlocks()
    expect(isKnownBlock('parcours')).toBe(false)
    expect(contributedBlocks()).toEqual([])
  })
})

describe('a page holding one', () => {
  const page = '::: is not it\n\n:::parcours{source="assets/val.parcours.json"}\n:::\n'

  it('is a diagnostic while no plugin contributes it', () => {
    const [issue] = validateDocument(parse(page))
    expect(issue?.severity).toBe('error')
    expect(issue?.block).toBe('parcours')
  })

  it('validates once one does', () => {
    registerBlocks(PARCOURS)
    expect(validateDocument(parse(page))).toEqual([])
  })

  it('still catches a missing required attribute', () => {
    registerBlocks(PARCOURS)
    const [issue] = validateDocument(parse(':::parcours\n:::\n'))
    expect(issue?.message).toContain('source')
  })

  it('still catches a value outside the closed set', () => {
    registerBlocks(PARCOURS)
    const [issue] = validateDocument(parse(':::parcours{source="x.json" vue="galerie"}\n:::\n'))
    expect(issue?.message).toContain('vue')
  })
})
