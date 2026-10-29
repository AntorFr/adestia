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
  // The section of the epic's unreleased work; the tag sections that follow it do not count.
  const unreleased = changelog.slice(changelog.indexOf('\n## adestia-correctifs (unreleased)'))

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
