// Besoin : adestia-build-limite — le build d'image est borné à 120 minutes par job,
// et le README dit la durée habituelle (environ 5 minutes) à côté de la limite.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = (p: string) => readFileSync(root + p, 'utf8')
const workflow = () => parse(read('.github/workflows/docker-publish.yml')) as { jobs: Record<string, Record<string, unknown>> }

describe('adestia-build-limite : timeout du build d\'image (workflow docker-publish)', () => {
  it('le job attestation est coupé à 120 minutes', () => {
    expect(workflow().jobs.attestation?.['timeout-minutes']).toBe(120)
  })

  it('le job build est coupé à 120 minutes', () => {
    expect(workflow().jobs.build?.['timeout-minutes']).toBe(120)
  })

  it('aucun job déclaré sous jobs: n\'est sans limite, ni au-delà de 120', () => {
    const jobs = Object.entries(workflow().jobs)
    expect(jobs.length).toBeGreaterThanOrEqual(2)
    for (const [nom, job] of jobs) {
      expect(job['timeout-minutes'], nom).toBe(120)
    }
  })

  it('le YAML reste valide : les deux jobs gardent leur chaîne (build derrière attestation) et le déclencheur par tag', () => {
    const w = workflow() as unknown as { on: { push: { tags: string[] } }; jobs: Record<string, { needs?: string }> }
    expect(w.on.push.tags).toEqual(['v*'])
    expect(w.jobs.build?.needs).toBe('attestation')
  })

  it('l\'en-tête dit la raison : sans limite la forge ne coupe qu\'à 360 minutes', () => {
    const entete = read('.github/workflows/docker-publish.yml').split('\nname:')[0]
    expect(entete).toMatch(/360/)
    expect(entete).toMatch(/timeout-minutes: 120/)
  })
})

describe('adestia-build-limite : README', () => {
  it('un même paragraphe dit la durée habituelle (environ 5 minutes) et la limite de 120 minutes', () => {
    const paragraphes = read('README.md').split(/\n\s*\n/)
    const ok = paragraphes.filter((p) => /5\s+min/.test(p) && /120/.test(p) && /timeout-minutes|minutes/.test(p))
    expect(ok.length).toBeGreaterThanOrEqual(1)
    expect(ok[0]).toMatch(/about 5 minutes|environ 5 min/)
  })
})
