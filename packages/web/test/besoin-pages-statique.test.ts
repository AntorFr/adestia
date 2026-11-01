/**
 * B-15 for the pages tranche (adestia-correctifs-pages): a changed behaviour is written in
 * CHANGELOG.md, and in the journey or screen that states it. Expectations come from the fiche
 * (what it livre) and docs/parcours.md, not from the code. Plain reads of the repository's
 * documents; the behaviours themselves are in besoin-pages-browser.test.ts.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (file: string) => readFileSync(join(repo, file), 'utf8')

describe('pages tranche, documents (B-15)', () => {
  const changelog = read('CHANGELOG.md')
  // The tranche's section: still titled "(unreleased)" before the delivery, renamed to its version
  // (the highest version title of the CHANGELOG) by it. Either way, the same four requirements below.
  const sections = changelog.split(/\n(?=## )/)
  const versionOf = (section: string) => {
    const m = /^## v(\d+)\.(\d+)\.(\d+)(?:\s|$)/.exec(section)
    return m ? m.slice(1).map(Number) : null
  }
  const compare = (a: number[], b: number[]) => (a[0]! - b[0]!) || (a[1]! - b[1]!) || (a[2]! - b[2]!)
  const highest = sections
    .filter((s) => versionOf(s))
    .sort((a, b) => compare(versionOf(b)!, versionOf(a)!))[0]
  const unreleased =
    sections.find((s) => s.startsWith('## adestia-correctifs (unreleased)')) ?? highest ?? ''

  // Breaks if the CHANGELOG does not say that a CRLF frontmatter is now read by the index and the schedule.
  it('changelog_dit_la_lecture_des_fins_de_ligne_crlf', () => {
    expect(unreleased).toMatch(/CRLF|\\r\\n/)
  })
  it('changelog_dit_le_fil_ariane_de_la_racine', () => {
    expect(unreleased).toMatch(/breadcrumb|fil d.Ariane/i)
  })
  it('changelog_dit_les_reglages_de_bloc_et_le_bandeau', () => {
    expect(unreleased).toMatch(/popover|block settings|E-6/i)
  })
  it('changelog_dit_le_diagnostic_traduit', () => {
    expect(unreleased).toMatch(/diagnostic/i)
  })

  // The journeys say what they now do.
  it('parcours_p4_dit_le_fil_ariane_de_la_racine_et_le_crlf', () => {
    const parcours = read('docs/parcours.md')
    const p4 = parcours.slice(parcours.indexOf('### P-4'), parcours.indexOf('### P-5'))
    expect(p4).toMatch(/root of the workspace/)
    expect(p4).toMatch(/\\r\\n/)
  })
  it('parcours_p5_dit_le_diagnostic_dans_la_langue_de_linstance', () => {
    const parcours = read('docs/parcours.md')
    const p5 = parcours.slice(parcours.indexOf('### P-5'), parcours.indexOf('### P-6'))
    expect(p5).toMatch(/instance's language/)
  })
})
