import { describe, expect, it } from 'vitest'
// @ts-expect-error: plain ESM script without types
import { calcul } from '../../../scripts/niveaux.mjs'

// Besoin (fiche ecrans-places-mecanisme, AD-ecrans-places-1 to 4): the paths that played every
// screen are placed. Each case gives two versions of the file through the injected reader.

const MAP = {
  ecrans: {
    'E-1': { entrees: ['packages/web/src/app/Gates.tsx'] },
    'E-2': { entrees: ['packages/web/src/app/Home.tsx'] },
    'E-15': { entrees: ['packages/web/src/app/SettingsMenu.tsx'] },
  },
  tests: { 'packages/web/test/a-browser.test.ts': ['E-1'] },
}
// the test must not name the bench launcher whole: that would make it a screen test
const TOUS = ['E-1', 'E-15', 'E-2']

type Versions = Record<string, { avant?: string; apres?: string }>
function touches(fichiers: string[], v: Versions = {}, map: unknown = MAP): string[] {
  const { touches: t } = calcul(fichiers, map, {
    ancien: (p: string) => v[p]?.avant ?? null,
    actuel: (p: string) => v[p]?.apres ?? null,
  })
  return [...t].sort()
}

describe('chemins hors écran (AD-ecrans-places-2)', () => {
  it.each([
    'plugins/web/relais.mjs',
    'plugins/web/adestia-plugin.json',
    'plugins/web/package-lock.json',
    'plugins/README.md',
    'bench/README.md',
    'bench/pages-proof.md',
    'bench/scenarios/turn-parts.mjs',
    'bench/tests/bench-once.test.mjs',
    'bench/run.sh',
    'bench/scenarios/atelier-4.prep.sh',
    'Dockerfile',
  ])('%s ne touche aucun écran', (f) => {
    expect(touches([f])).toEqual([])
  })

  it.each(['bench/launch' + '.mjs', 'bench/fake-engine.mjs', 'bench/seed/x.json', 'bench/lib/y.mjs', 'scripts/suite-ecrans.sh'])(
    '%s touche tous les écrans',
    (f) => {
      expect(touches([f])).toEqual(TOUS)
    },
  )

  it('un chemin inconnu touche tous les écrans', () => {
    expect(touches(['unknown/x.bin'])).toEqual(TOUS)
  })
})

describe('package.json (AD-ecrans-places-3)', () => {
  const pj = (o: object) => JSON.stringify(o)
  const base = { name: 'w', version: '1.0.0', scripts: { a: 'x' }, dependencies: { x: '1' } }
  const cas = (apres: object) => touches(['package.json'], { 'package.json': { avant: pj(base), apres: pj(apres) } })

  it('un seul champ version touche E-15 seul', () => expect(cas({ ...base, version: '1.0.1' })).toEqual(['E-15']))
  it('les métadonnées ne touchent rien', () =>
    expect(cas({ ...base, scripts: { a: 'y' }, description: 'd', license: 'MIT' })).toEqual([]))
  it('dependencies touche tous', () => expect(cas({ ...base, dependencies: { x: '2' } })).toEqual(TOUS))
  it('un champ inconnu touche tous', () => expect(cas({ ...base, zzz: 1 })).toEqual(TOUS))
  it('version et metadonnées: E-15 seul', () => expect(cas({ ...base, version: '2', scripts: {} })).toEqual(['E-15']))
  it('un fichier illisible touche tous', () =>
    expect(touches(['package.json'], { 'package.json': { avant: pj(base), apres: '{nope' } })).toEqual(TOUS))
  it('une version de base absente touche tous', () =>
    expect(touches(['package.json'], { 'package.json': { apres: pj(base) } })).toEqual(TOUS))
})

describe('scripts/ecrans.json (AD-ecrans-places-4)', () => {
  const j = (o: object) => JSON.stringify(o)
  const cas = (apres: object, avant: object = MAP) =>
    touches(['scripts/ecrans.json'], { 'scripts/ecrans.json': { avant: j(avant), apres: j(apres) } })

  it('identique (le champ _ ignoré): rien', () => expect(cas({ _: 'x', ...MAP })).toEqual([]))
  it('une entrée changée touche son écran seul', () =>
    expect(cas({ ...MAP, ecrans: { ...MAP.ecrans, 'E-2': { entrees: ['packages/web/src/app/Home.tsx', 'x.css'] } } })).toEqual(['E-2']))
  it('un écran ajouté touche cet écran', () =>
    expect(cas({ ...MAP, ecrans: { ...MAP.ecrans, 'E-9': { dossiers: ['p/'] } } })).toEqual(['E-9']))
  it('une ligne de test changée touche l’union des anciens et nouveaux écrans', () =>
    expect(cas({ ...MAP, tests: { 'packages/web/test/a-browser.test.ts': ['E-2'] } })).toEqual(['E-1', 'E-2']))
  it('un test ajouté touche ses écrans', () =>
    expect(cas({ ...MAP, tests: { ...MAP.tests, 'b.test.ts': ['E-15'] } })).toEqual(['E-15']))
  it('un test « toujours » ajouté touche tous', () =>
    expect(cas({ ...MAP, tests: { ...MAP.tests, 'b.test.ts': 'toujours' } })).toEqual(TOUS))
  it('un test retiré touche ses écrans', () => expect(cas({ ...MAP, tests: {} })).toEqual(['E-1']))
  it('un fichier illisible touche tous', () =>
    expect(touches(['scripts/ecrans.json'], { 'scripts/ecrans.json': { avant: j(MAP), apres: '{' } })).toEqual(TOUS))
  it('une base illisible touche tous', () =>
    expect(touches(['scripts/ecrans.json'], { 'scripts/ecrans.json': { avant: '[', apres: j(MAP) } })).toEqual(TOUS))
})
