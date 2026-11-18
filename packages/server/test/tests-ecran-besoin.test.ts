import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Besoin (fiche adestia-tests-hors-ecran, « Livre » et critère de sortie): every existing screen
// test is classed in an inventory of the repository; every effect expectation is found in a test
// that does not drive a browser BEFORE its screen test is removed or lightened; no display
// expectation is removed; the screen-test duration before/after is said in the README.
// Every expected value below is written by hand from that critère, not read back from a guard.

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = (p: string) => readFileSync(join(root, p), 'utf8')
// A screen test names the browser: the words are cut so that this file is not one itself.
const MOT = new RegExp('chrom' + 'ium|play' + 'wright')

const GRAPPES = [
  'web-chat-charte',
  'web-hors-ligne-acces',
  'web-mcp-pages',
  'bench-chat',
  'bench-pages',
  'bench-plugins-shell',
  'serveur',
]
const CLASSES = ['affichage', 'effet', 'scindé', 'sans-porte']

interface Ligne {
  grappe: string
  test: string
  fichier: string
  classe: string
  horsEcran: string
  ecran: string
  raison: string
}

const cellule = (s: string) => s.trim().replace(/^`|`$/g, '').trim().replace(/\\\|/g, '|')

function lignes(): Ligne[] {
  const out: Ligne[] = []
  for (const grappe of GRAPPES) {
    for (const l of read(`docs/tests-ecran/${grappe}.md`).split('\n')) {
      if (!l.startsWith('| ') || /^\|\s*(Test|---)/.test(l)) continue
      const c = l.split(/(?<!\\)\|/).slice(1, -1)
      if (c.length !== 5) throw new Error(`${grappe}: ligne à ${c.length} cellules: ${l.slice(0, 120)}`)
      const test = cellule(c[0]!)
      out.push({
        grappe,
        test,
        fichier: test.split(' > ')[0]!,
        classe: cellule(c[1]!),
        horsEcran: cellule(c[2]!),
        ecran: cellule(c[3]!),
        raison: cellule(c[4]!),
      })
    }
  }
  return out
}

const existants = () =>
  read('docs/tests-ecran/existants.txt')
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.startsWith('#'))

describe('tests d\'écran hors écran — inventaire (docs/tests-ecran)', () => {
  it('chaque grappe de l\'inventaire est déclarée complète', () => {
    for (const g of GRAPPES) expect(read(`docs/tests-ecran/${g}.md`), g).toMatch(/^Statut : complet$/m)
  })

  it('chacun des 1066 tests d\'écran existants a une ligne, et une seule', () => {
    const attendus = existants()
    expect(attendus).toHaveLength(1066)
    const comptes = new Map<string, number>()
    for (const l of lignes()) comptes.set(l.test, (comptes.get(l.test) ?? 0) + 1)
    const manquants = attendus.filter((t) => !comptes.has(t))
    expect(manquants).toEqual([])
    const doubles = [...comptes].filter(([, n]) => n > 1).map(([t]) => t)
    expect(doubles).toEqual([])
    expect(lignes()).toHaveLength(1066)
  })

  it('les 44 fichiers d\'écran des grappes existent, et aucun fichier qui nomme le navigateur n\'est hors inventaire', () => {
    const classes = new Set(lignes().map((l) => l.fichier))
    expect(classes.size).toBe(44)
    for (const f of classes) expect(existsSync(join(root, f)), f).toBe(true)
    const suivis = execFileSync('git', ['ls-files', '--', 'packages', 'bench/tests', 'plugins'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /(^|\/)test\/.*\.test\.(tsx?|mjs)$|^bench\/tests\/.*\.test\.mjs$/.test(f))
    const nomment = suivis.filter((f) => MOT.test(read(f)))
    const horsInventaire = nomment.filter((f) => !classes.has(f))
    // the declared exceptions: files that name the browser without driving a screen (a guard of the
    // suite; two tests of scripts/niveaux.mjs that only carry it in a fixture string; the screen tests
    // born after the inventory (epic/adestia-pages, feature adestia-coller-tableau), listed in docs/tests-ecran/README.md and still to classify)
    expect(horsInventaire).toEqual([
      'bench/tests/bench-once.test.mjs',
      'bench/tests/niveaux-besoin.test.mjs',
      'bench/tests/niveaux-ensemble.test.mjs',
      'packages/web/test/besoin-coller-tableau-browser.test.ts',
      'packages/web/test/besoin-pages-structure-browser.test.ts',
      'packages/web/test/besoin-popover-bandeau-tardif-browser.test.ts',
      'packages/web/test/besoin-rouge-23-spinner-config.test.ts',
      'packages/web/test/besoin-rouge-25-menu-rouage-browser.test.ts',
      'packages/web/test/blocs-projet-browser.test.ts',
      'packages/web/test/complement-formulaires-browser.test.ts',
      'packages/web/test/ensemble-pages-deplacer-browser.test.ts',
      'packages/web/test/ensemble-pages-deplacer-cartes-browser.test.ts',
      'packages/web/test/ensemble-pages-formulaires-browser.test.ts',
      'packages/web/test/ensemble-pages-structure-browser.test.ts',
      'packages/web/test/etat-projet-gabarit-browser.test.ts',
      'packages/web/test/galerie-formulaire-browser.test.ts',
      'packages/web/test/nouveau-modele-browser.test.ts',
      'packages/web/test/pages-structure-edition-browser.test.ts',
      'packages/web/test/recette-formulaires-browser.test.ts',
      'packages/web/test/reglages-undo-browser.test.ts',
      'packages/web/test/verify-formulaires-browser.test.ts',
    ])
  })

  it('chaque ligne a une classe connue, et l\'affichage garde ses cellules de report vides', () => {
    for (const l of lignes()) {
      expect(CLASSES, l.test).toContain(l.classe)
      if (l.classe === 'affichage') {
        expect([l.horsEcran, l.ecran], l.test).toEqual(['', ''])
      }
    }
  })

  it('un attendu d\'effet cite un test vert hors écran qui existe, dans un fichier qui ne pilote pas de navigateur', () => {
    const cites = lignes().filter((l) => l.classe === 'effet' || l.classe === 'scindé')
    expect(cites.length).toBe(309)
    for (const l of cites) {
      const i = l.horsEcran.indexOf(' > ')
      expect(i, `${l.test}: « Hors écran » vide ou sans nom`).toBeGreaterThan(0)
      const f = l.horsEcran.slice(0, i)
      const nom = l.horsEcran.slice(i + 3).split(' > ').pop()!
      expect(existsSync(join(root, f)), `${l.test}: ${f} absent`).toBe(true)
      expect(MOT.test(read(f)), `${l.test}: ${f} nomme le navigateur`).toBe(false)
      expect(read(f).includes(nom), `${l.test}: « ${nom} » absent de ${f}`).toBe(true)
    }
  })

  it('une ligne sans porte dit sa raison', () => {
    const sp = lignes().filter((l) => l.classe === 'sans-porte')
    expect(sp.length).toBe(89)
    for (const l of sp) expect(l.raison.length, l.test).toBeGreaterThan(10)
  })

  it('aucun test d\'affichage n\'est allégé ni retiré', () => {
    for (const l of lignes()) {
      if (l.classe === 'affichage' || l.classe === 'sans-porte') expect(['', 'gardé'], l.test).toContain(l.ecran)
      if (l.classe === 'effet' || l.classe === 'scindé') expect(['gardé', 'allégé', 'retiré'], l.test).toContain(l.ecran)
    }
  })

  it('un test d\'écran retiré ou allégé a son effet dans un test hors écran', () => {
    for (const l of lignes().filter((x) => x.ecran === 'retiré' || x.ecran === 'allégé')) {
      expect(['effet', 'scindé'], l.test).toContain(l.classe)
      expect(l.horsEcran, l.test).not.toBe('')
    }
  })

  it('le dossier de l\'inventaire ne porte que ses grappes, existants, avant et README', () => {
    expect(readdirSync(join(root, 'docs/tests-ecran')).sort()).toEqual(
      [...GRAPPES.map((g) => `${g}.md`), 'README.md', 'avant.md', 'existants.txt'].sort(),
    )
  })
})

describe('tests d\'écran hors écran — durée avant/après dite dans le README', () => {
  const section = () => {
    const t = read('README.md')
    const i = t.indexOf('## Screen-test duration, before and after')
    expect(i, 'section absente du README').toBeGreaterThanOrEqual(0)
    return t.slice(i).split(/\n## /)[0]!
  }
  const secondes = (cell: string) => {
    const m = /(\d+) s \((\d+) min (\d+) s\)/.exec(cell)
    expect(m, `durée illisible: ${cell}`).not.toBeNull()
    expect(Math.abs(Number(m![2]) * 60 + Number(m![3]) - Number(m![1])), cell).toBeLessThanOrEqual(1)
    return Number(m![1])
  }

  it('dit, pour chacune des 7 grappes et le total, une durée avant et une durée après', () => {
    const rows = section().split('\n').filter((l) => /^\| \*{0,2}(web-|bench-|serveur|total)/.test(l))
    expect(rows.map((r) => r.split('|')[1]!.replace(/\*/g, '').trim())).toEqual([...GRAPPES, 'total'])
    const avant = rows.map((r) => secondes(r.split('|')[2]!.replace(/\*/g, '')))
    const apres = rows.map((r) => secondes(r.split('|')[3]!.replace(/\*/g, '')))
    for (let i = 0; i < 7; i++) {
      expect(avant[i]).toBeGreaterThan(100)
      expect(apres[i]).toBeGreaterThan(100)
    }
    // the total is the sum of the clusters (the README rounds each file: one second of slack)
    expect(Math.abs(avant.slice(0, 7).reduce((a, b) => a + b, 0) - avant[7]!)).toBeLessThanOrEqual(1)
    expect(Math.abs(apres.slice(0, 7).reduce((a, b) => a + b, 0) - apres[7]!)).toBeLessThanOrEqual(1)
  })

  it('la colonne « avant » est celle que mesure avant.md', () => {
    const attendu: Record<string, number> = {
      'web-chat-charte': 1297,
      'web-hors-ligne-acces': 282,
      'web-mcp-pages': 454,
      'bench-chat': 583,
      'bench-pages': 1523,
      'bench-plugins-shell': 1222,
      serveur: 900,
    }
    const rows = section().split('\n').filter((l) => /^\| (web-|bench-|serveur)/.test(l))
    for (const r of rows) {
      const c = r.split('|')
      expect(secondes(c[2]!), c[1]).toBe(attendu[c[1]!.trim()])
    }
    const avant = read('docs/tests-ecran/avant.md')
    expect(avant).toMatch(/6260\.3 s \(104 min 20 s\)/)
    expect(avant).toMatch(/pour 44 fichiers/)
  })

  it('l\'écart dit est celui des deux colonnes, à une seconde près', () => {
    const rows = section().split('\n').filter((l) => /^\| \*{0,2}(web-|bench-|serveur|total)/.test(l))
    for (const r of rows) {
      const c = r.split('|').map((x) => x.replace(/\*/g, '').trim())
      const avant = secondes(c[2]!)
      const apres = secondes(c[3]!)
      const dit = Number(c[4]!.replace(/ s$/, '').replace('+', ''))
      expect(Math.abs(apres - avant - dit), `${c[1]}: ${c[4]}`).toBeLessThanOrEqual(1)
    }
  })
})
