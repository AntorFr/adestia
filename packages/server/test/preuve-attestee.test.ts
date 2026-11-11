import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'

import { cleanTmp, tmpDir } from './support/tmp.js'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = (p: string) => readFileSync(root + p, 'utf8')
afterEach(cleanTmp)

async function report(steps: string, extra: Record<string, string> = {}): Promise<string> {
  const dir = await tmpDir('rapport-')
  writeFileSync(join(dir, 'steps.tsv'), steps)
  for (const [f, c] of Object.entries(extra)) writeFileSync(join(dir, f), c)
  const out = join(dir, 'resultats.xml')
  execFileSync('node', [root + 'scripts/suite-rapport.mjs', dir, out])
  return readFileSync(out, 'utf8')
}

describe('la suite attestée (R15)', () => {
  it('.sdlc.yaml déclare tests: (script, rapport junit) et garde deploiement:', () => {
    const y = parse(read('.sdlc.yaml'))
    expect(y.tests).toMatchObject({ commande: 'scripts/suite-attestee.sh', rapport: 'resultats.xml', format: 'junit' })
    expect(y.tests.delai).toBeTruthy()
    expect(y.deploiement.images).toContain('ghcr.io/antorfr/adestia')
  })

  it('aucun workflow ne se déclenche sur push de branche ni pull_request, et ci.yml a disparu', () => {
    const files = readdirSync(root + '.github/workflows')
    expect(files).not.toContain('ci.yml')
    for (const f of files) {
      const on = parse(read(`.github/workflows/${f}`)).on
      expect(Object.keys(on), f).not.toContain('pull_request')
      expect(on.push?.branches, f).toBeUndefined()
    }
  })

  it('docker-publish ne construit que sur v* ou à la main, derrière un job qui lit tests-complets', () => {
    const w = parse(read('.github/workflows/docker-publish.yml'))
    expect(w.on.push.tags).toEqual(['v*'])
    expect(Object.keys(w.on).sort()).toEqual(['push', 'workflow_dispatch'])
    expect(w.jobs.build.needs).toBe('attestation')
    const text = read('.github/workflows/docker-publish.yml')
    expect(text).toContain('tests-complets')
    expect(text).toContain('attester --publier')
    expect(text).not.toMatch(/type=ref,event=branch/)
  })

  it('CLAUDE.md dit R15 et attester --publier, plus la CI ; B-12 ne dit plus « in CI »', () => {
    const c = read('CLAUDE.md')
    expect(c).not.toMatch(/also in CI|CI plays/)
    expect(c).toContain('attester --cible main --publier')
    const b12 = /- \*\*B-12\*\*[\s\S]*?(?=\n- \*\*B-13|\n\n)/.exec(read('docs/parcours.md'))![0]
    expect(b12).not.toMatch(/in CI/)
    expect(b12).toContain('attester --publier')
  })

  it('le script joue les étapes install, typecheck, lint, build, boot', () => {
    const s = read('scripts/suite-attestee.sh')
    for (const n of ['install npm ci', 'typecheck npm run typecheck', 'lint npm run lint']) expect(s).toMatch(new RegExp(`^step ${n}`, 'm'))
    expect(s).toMatch(/^step build /m)
    expect(s).toMatch(/^step boot boot$/m)
    expect(s).toMatch(/api\/health/)
  })

  it('le rapport porte une entrée par étape, rouge pour une étape en échec', async () => {
    const xml = await report('install\tok\t3\ntypecheck\tko\t2\nlint\tok\t1\nbuild\tok\t1\nboot\tok\t1\n', { 'typecheck.log': 'TS2322 <boom>' })
    for (const n of ['install', 'typecheck', 'lint', 'build', 'boot']) expect(xml).toContain(`name="${n}"`)
    expect(xml).toMatch(/name="typecheck"[^>]*><failure/)
    expect(xml).toMatch(/name="install"[^>]*><\/testcase>/)
    expect(xml).toContain('failures="1"')
    expect(xml).toContain('&lt;boom&gt;')
  })

  it('une étape jamais jouée (install en échec) est rouge, pas absente ; un test sauté est compté', async () => {
    const xml = await report('install\tko\t5\n', {
      'vitest.xml': '<testsuite><testcase name="a"><skipped/></testcase><testcase name="b"/></testsuite>',
    })
    for (const n of ['typecheck', 'lint', 'build', 'boot']) expect(xml).toMatch(new RegExp(`name="${n}"[^>]*><failure`))
    expect(xml).toContain('skipped="1"')
    expect(xml).toContain('name="b"')
  })
})
