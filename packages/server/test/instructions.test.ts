/**
 * The instruction zone.
 *
 * The property under test is the one the design turns on: what a PERSON wrote
 * is editable, what the PRODUCT delivered is not — and the difference is read
 * from the file's own marker, never guessed from where it sits. Both live in
 * the same folders, which is exactly why guessing would fail.
 */

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { isManaged, listInstructions, safeInstructionPath } from '../src/instructions.js'
import { MANAGED_MARKER } from '../src/skills.js'

const ZONE = ['CLAUDE.md', '.claude/skills']
let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'adestia-instructions-'))
  await mkdir(join(root, '.claude/skills/page-author'), { recursive: true })
  await mkdir(join(root, '.claude/skills/mes-regles'), { recursive: true })
  await mkdir(join(root, 'pages'), { recursive: true })

  await writeFile(join(root, 'CLAUDE.md'), '# Comment travailler ici\n')
  // Delivered by the product, rewritten at every start.
  await writeFile(
    join(root, '.claude/skills/page-author/SKILL.md'),
    `${MANAGED_MARKER}\n# page-author\n`,
  )
  // Written by a person.
  await writeFile(join(root, '.claude/skills/mes-regles/SKILL.md'), '# Relis mes emails\n')
  await writeFile(join(root, 'pages/note.md'), '# une fiche\n')
})

describe('what the zone offers', () => {
  it('lists what the product delivered too, and says which is which', async () => {
    // Both files sit in `.claude/skills`. Only the marker tells them apart,
    // which is why the listing reads them instead of pattern-matching names.
    //
    // Delivered files used to be dropped here. That answered "what is this
    // agent reading?" with half the truth: on an instance whose behaviour
    // comes mostly from plugin contracts, the rule somebody was hunting for
    // was invisible because it was not theirs. So they are listed, flagged,
    // and refused a write further up.
    const files = await listInstructions(root, ZONE)
    const owned = Object.fromEntries(files.map((file) => [file.path, file.managed]))
    expect(owned['CLAUDE.md']).toBe(false)
    expect(owned['.claude/skills/mes-regles/SKILL.md']).toBe(false)
    expect(Object.values(owned).some((managed) => managed === true)).toBe(true)
  })

  it('leaves the content surface alone', async () => {
    // Pages are the other half of the product and have their own screens.
    const files = await listInstructions(root, ZONE)
    expect(files.some((file) => file.path.startsWith('pages/'))).toBe(false)
  })

  it('says nothing about a declared path nobody has written yet', async () => {
    // `AGENTS.md` is absent until somebody writes one; that is not an error.
    const files = await listInstructions(root, ['AGENTS.md'])
    expect(files).toEqual([])
  })

  it('carries what a listing needs to render a row', async () => {
    const [first] = await listInstructions(root, ZONE)
    expect(first).toMatchObject({ path: expect.any(String), modified: expect.any(String) })
    expect(first!.bytes).toBeGreaterThan(0)
  })
})

describe('what may be addressed', () => {
  it('resolves a file inside the declared zone', () => {
    expect(safeInstructionPath(root, ZONE, 'CLAUDE.md')).toBe(join(root, 'CLAUDE.md'))
    expect(safeInstructionPath(root, ZONE, '.claude/skills/mes-regles/SKILL.md')).toBe(
      join(root, '.claude/skills/mes-regles/SKILL.md'),
    )
  })

  it('admits a file that does not exist yet', () => {
    // A zone you can read but never add to is a viewer, not an editor — so
    // membership is checked against the DECLARED paths, not the listing.
    expect(safeInstructionPath(root, ZONE, '.claude/skills/neuf/SKILL.md')).toBe(
      join(root, '.claude/skills/neuf/SKILL.md'),
    )
  })

  it('refuses everything outside it', () => {
    for (const attempt of [
      'pages/note.md',
      '../escape.md',
      '.claude/skills/../../etc/passwd.md',
      '',
      42,
    ]) {
      expect(safeInstructionPath(root, ZONE, attempt), String(attempt)).toBeUndefined()
    }
  })

  it('refuses anything that is not prose', () => {
    // The authority gate guards `.claude/settings.json`; this route must not
    // become a second way to reach it.
    expect(safeInstructionPath(root, ['.claude'], '.claude/settings.json')).toBeUndefined()
    expect(safeInstructionPath(root, ['.claude'], '.claude/hooks/run.sh')).toBeUndefined()
  })

  it('does not let a zone claim a neighbour that merely starts the same way', () => {
    expect(safeInstructionPath(root, ZONE, 'CLAUDE.md.bak')).toBeUndefined()
  })
})

describe('ownership', () => {
  it('reads the marker rather than the location', async () => {
    expect(await isManaged(join(root, '.claude/skills/page-author/SKILL.md'))).toBe(true)
    expect(await isManaged(join(root, '.claude/skills/mes-regles/SKILL.md'))).toBe(false)
    // A file that is not there is not the product's.
    expect(await isManaged(join(root, 'absent.md'))).toBe(false)
  })
})

describe('paths as the API speaks them', () => {
  it('uses forward slashes whatever the platform stores', async () => {
    // The client sends these back in a URL, so a Windows separator reaching a
    // path would round-trip to something that resolves nowhere.
    const files = await listInstructions(root, ZONE)
    expect(files.some((file) => file.path.includes('\\'))).toBe(false)
    expect(files.some((file) => file.path.includes('/'))).toBe(true)
  })
})
