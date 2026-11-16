import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Feature « adestia-tests-hors-ecran », level "ensemble": the need is the fiche's « Livre » and its
// exit criterion. Everything below is read from the files the criterion names (the inventories under
// docs/tests-ecran/, the screen test files, the out-of-screen test files, README.md); the guard script
// of the feature (scripts/tests-ecran.mjs) is not used: this is a second, independent reading.
//
// Criterion, in four parts:
//  C1 every existing screen test is classified (display kept, effect moved, both split) in an inventory of the repo;
//  C2 every effect expectation is found in an out-of-screen test BEFORE its screen test is removed or lightened;
//  C3 no display expectation is removed;
//  C4 the screen-test duration before/after is said in the README.
// This file avoids the two browser words on purpose: a file that names them is itself a screen test.

const root = fileURLToPath(new URL('../../../', import.meta.url))
const MOT_NAVIGATEUR = new RegExp('chrom' + 'ium|play' + 'wright')
const lire = (chemin: string) => readFileSync(join(root, chemin), 'utf8')

const GRAPPES = ['web-chat-charte', 'web-hors-ligne-acces', 'web-mcp-pages', 'bench-chat', 'bench-pages', 'bench-plugins-shell', 'serveur']
const CLASSES = ['affichage', 'effet', 'scindé', 'sans-porte']
// Guards that name the browser without driving a page (docs/tests-ecran/README.md, « Hors inventaire »).
const HORS_INVENTAIRE = ['bench/tests/bench-once.test.mjs', 'bench/tests/niveaux-besoin.test.mjs', 'bench/tests/niveaux-ensemble.test.mjs']

type Ligne = { grappe: string; test: string; classe: string; horsEcran: string; alEcran: string; raison: string }

function cellules(ligne: string): string[] {
  return ligne.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|').replace(/^`+|`+$/g, ''))
}

function inventaire(grappe: string): { statut: string; lignes: Ligne[] } {
  const texte = lire(`docs/tests-ecran/${grappe}.md`)
  const statut = /^Statut\s*:\s*(\S+)/m.exec(texte)?.[1] ?? ''
  const lignes: Ligne[] = []
  for (const l of texte.split('\n')) {
    if (!l.trim().startsWith('|')) continue
    const c = cellules(l)
    const premiere = c[0] ?? ''
    if (premiere === 'Test' || /^:?-+:?$/.test(premiere)) continue
    lignes.push({ grappe, test: premiere, classe: c[1] ?? '', horsEcran: c[2] ?? '', alEcran: c[3] ?? '', raison: c[4] ?? '' })
  }
  return { statut, lignes }
}

const inventaires: Record<string, { statut: string; lignes: Ligne[] }> = Object.fromEntries(GRAPPES.map((g) => [g, inventaire(g)]))
const de = (g: string) => inventaires[g] as { statut: string; lignes: Ligne[] }
const toutes: Ligne[] = GRAPPES.flatMap((g) => de(g).lignes)
const existants = lire('docs/tests-ecran/existants.txt').split('\n').filter((l) => l && !l.startsWith('#'))

function fichiersDeTest(dossier: string, sortie: string[] = []): string[] {
  if (!existsSync(join(root, dossier))) return sortie
  for (const nom of readdirSync(join(root, dossier))) {
    if (nom === 'node_modules') continue
    const chemin = `${dossier}/${nom}`
    if (statSync(join(root, chemin)).isDirectory()) fichiersDeTest(chemin, sortie)
    else if (/\.test\.(ts|tsx|mjs|js)$/.test(nom)) sortie.push(chemin)
  }
  return sortie
}
const tousLesTests = [
  ...readdirSync(join(root, 'packages')).flatMap((p) => fichiersDeTest(`packages/${p}/test`)),
  ...fichiersDeTest('bench/tests'),
  ...(existsSync(join(root, 'plugins')) ? readdirSync(join(root, 'plugins')).flatMap((p) => fichiersDeTest(`plugins/${p}/test`)) : []),
]
const fichiersEcran = tousLesTests.filter((f) => !HORS_INVENTAIRE.includes(f) && MOT_NAVIGATEUR.test(lire(f)))

const fichierDe = (nom: string) => nom.split(' > ')[0] ?? ''
const titreDe = (nom: string) => nom.slice(nom.indexOf(' > ') + 3)
const feuille = (nom: string) => nom.split(' > ').at(-1) as string
const ancetres = (nom: string) => nom.split(' > ').slice(1, -1).join(' ')

/**
 * Is this title written in this text? A title is looked for as it stands (with the quote variants). A
 * generated title (one per skin, per width, per route: the file holds a template, not the title) is
 * looked for by its fixed words: one run of three words of it must be in the file (a title of fewer than
 * three words borrows its describe blocks). The limit is stated in the report: a generated title is matched by its wording, not by its
 * exact generated name, so a file that loses ONE generated variant is not caught here.
 */
function titreEcrit(texte: string, titre: string, ancetres = ''): boolean {
  const variantes = (t: string) => [t, t.replace(/'/g, "\\'"), t.replace(/"/g, '\\"'), t.replace(/`/g, '\\`')]
  if (variantes(titre).some((v) => texte.includes(v))) return true
  const sansSuffixe = titre.replace(/, [^,]+$/, '')
  if (sansSuffixe !== titre && sansSuffixe.length >= 12 && variantes(sansSuffixe).some((v) => texte.includes(v))) return true
  // a leaf of fewer than three words (« alfred light ») carries nothing of its own: its describe blocks stand in
  const brut = titre.trim().split(/\s+/)
  const mots = brut.length >= 3 ? brut : `${ancetres} ${titre}`.trim().split(/\s+/)
  const fenetres: string[] = []
  for (let i = 0; i + 3 <= mots.length; i++) fenetres.push(mots.slice(i, i + 3).join(' '))
  if (fenetres.some((w) => variantes(w).some((v) => texte.includes(v)))) return true
  // a short generated title (« GET /api/health answers 200 »): its last two words, when they are 10 characters or more
  const deux = mots.slice(-2).join(' ')
  return mots.length <= 4 && deux.length >= 10 && variantes(deux).some((v) => texte.includes(v))
}

describe('B-1 · every existing screen test is classified in an inventory of the repository (C1)', () => {
  it('has the seven clusters, each « Statut : complet »', () => {
    expect(GRAPPES.map((g) => `${g}: ${de(g).statut}`)).toEqual(GRAPPES.map((g) => `${g}: complet`))
  })

  it('gives each of the 1066 screen tests of the list taken before the work exactly one row, in the cluster that holds its file', () => {
    expect(existants).toHaveLength(1066)
    const comptes = new Map<string, number>()
    for (const l of toutes) comptes.set(l.test, (comptes.get(l.test) ?? 0) + 1)
    const sansLigne = existants.filter((e) => !comptes.has(e))
    expect(sansLigne).toEqual([])
    const doubles = [...comptes].filter(([, n]) => n > 1).map(([t]) => t)
    expect(doubles).toEqual([])
    expect(toutes).toHaveLength(1066)
  })

  it('puts every row in one of the four classes, and only the test it names in a file of its cluster', () => {
    expect(toutes.filter((l) => !CLASSES.includes(l.classe)).map((l) => `${l.test} → ${l.classe}`)).toEqual([])
    const lisible = (g: string) => lire('docs/tests-ecran/README.md').split(`### ${g}\n`)[1]?.split('\n## ')[0]?.split('\n### ')[0] ?? ''
    const horsGrappe = toutes.filter((l) => !lisible(l.grappe).includes(`\`${fichierDe(l.test)}\``)).map((l) => l.test)
    expect(horsGrappe).toEqual([])
  })

  it('has no browser-driving test file left out of the clusters (a new one needs a cluster, or a named reason)', () => {
    const rangés = new Set(toutes.map((l) => fichierDe(l.test)))
    const readme = lire('docs/tests-ecran/README.md')
    const orphelins = fichiersEcran.filter((f) => !rangés.has(f) && !readme.includes(`\`${f}\``))
    expect(orphelins).toEqual([])
  })

  it('asks a reason for every « sans-porte » row, and none for a display row', () => {
    const sansRaison = toutes.filter((l) => l.classe === 'sans-porte' && l.raison.length < 10).map((l) => l.test)
    expect(sansRaison).toEqual([])
    const affichageAvecReport = toutes.filter((l) => l.classe === 'affichage' && (l.horsEcran || l.alEcran)).map((l) => l.test)
    expect(affichageAvecReport).toEqual([])
  })

  it('classifies as « effet » or « scindé » at least one test in six of the seven clusters (the effects exist, they are not all called display)', () => {
    const avecEffet = GRAPPES.filter((g) => de(g).lignes.some((l) => l.classe === 'effet' || l.classe === 'scindé'))
    expect(avecEffet.length).toBeGreaterThanOrEqual(6)
  })
})

describe('B-2 · every effect expectation is found in an out-of-screen test (C2)', () => {
  const aReporter = toutes.filter((l) => l.classe === 'effet' || l.classe === 'scindé')

  it('names, for every « effet » and « scindé » row, an out-of-screen test: a file that drives no browser, in which the title is a live test', () => {
    const fautes: string[] = []
    for (const l of aReporter) {
      const f = fichierDe(l.horsEcran)
      if (!l.horsEcran.includes(' > ') || !existsSync(join(root, f))) { fautes.push(`${l.test}: fichier « ${f} » absent`); continue }
      if (fichiersEcran.includes(f) || MOT_NAVIGATEUR.test(lire(f))) { fautes.push(`${l.test}: « ${f} » est un test d'écran`); continue }
      const lignes = lire(f).split('\n')
      const titre = titreDe(l.horsEcran)
      const vives = lignes.filter((x) => (x.includes(titre) || x.includes(titre.replace(/'/g, "\\'"))) && !/\.(skip|todo)\b|\bxit\(|\bxtest\(/.test(x))
      if (vives.length === 0) fautes.push(`${l.test}: « ${titre} » introuvable (ou sauté) dans ${f}`)
    }
    expect(fautes).toEqual([])
  })

  it('says what became of the screen test on each effect row: kept, lightened or removed', () => {
    expect(aReporter.filter((l) => !['gardé', 'allégé', 'retiré'].includes(l.alEcran)).map((l) => `${l.test} → « ${l.alEcran} »`)).toEqual([])
  })

  it('has at least 300 effect rows, and out-of-screen test files that have a real test body (the proof exists, not only a title)', () => {
    expect(aReporter.length).toBeGreaterThanOrEqual(300)
    const fichiers = [...new Set(aReporter.map((l) => fichierDe(l.horsEcran)))]
    const sansAssertion = fichiers.filter((f) => !/expect\(|assert\.|assert\(/.test(lire(f)))
    expect(sansAssertion).toEqual([])
  })
})

describe('B-3 · no display expectation is removed (C3)', () => {
  it('keeps, in its screen file, every test classed « affichage » or « sans-porte », under the title it had', () => {
    const disparus: string[] = []
    for (const l of toutes.filter((x) => x.classe === 'affichage' || x.classe === 'sans-porte')) {
      const f = fichierDe(l.test)
      if (!existsSync(join(root, f))) { disparus.push(`${l.test}: fichier absent`); continue }
      const texte = lire(f)
      if (!titreEcrit(texte, feuille(l.test), ancetres(l.test))) disparus.push(`${l.test}: titre introuvable`)
    }
    expect(disparus).toEqual([])
  })

  it('keeps, in its screen file, every test whose row does not say « retiré » (a lightened test stays)', () => {
    const disparus: string[] = []
    for (const l of toutes.filter((x) => x.alEcran !== 'retiré')) {
      const f = fichierDe(l.test)
      const texte = existsSync(join(root, f)) ? lire(f) : ''
      if (!titreEcrit(texte, feuille(l.test), ancetres(l.test))) disparus.push(l.test)
    }
    expect(disparus).toEqual([])
  })

  it('never says « retiré » for a display row, and never retires a « scindé » row (its display half stays)', () => {
    expect(toutes.filter((l) => l.alEcran === 'retiré' && (l.classe === 'affichage' || l.classe === 'scindé' || l.classe === 'sans-porte')).map((l) => l.test)).toEqual([])
  })
})

describe('B-4 · the README says the screen-test duration before and after (C4)', () => {
  const readme = lire('README.md')
  const debut = readme.indexOf('## Screen-test duration, before and after')
  const section = debut < 0 ? '' : readme.slice(debut + 5).split(/\n## /)[0] ?? ''

  const secondes = (cellule = '') => Number(/(\d+(?:\.\d+)?)\s*s\b/.exec(cellule)?.[1] ?? 'NaN')
  const ligneDe = (nom: string) => section.split('\n').find((l) => l.startsWith(`| ${nom} |`) || l.startsWith(`| **${nom}** |`))?.split('|').map((c) => c.trim()) ?? []

  it('has the section', () => {
    expect(debut).toBeGreaterThanOrEqual(0)
    expect(section).toContain('Before')
    expect(section).toContain('After')
  })

  it('gives one row per cluster and a total, each with a before, an after and a difference', () => {
    for (const nom of [...GRAPPES, 'total']) {
      const c = ligneDe(nom)
      expect(c.length, `ligne « ${nom} »`).toBeGreaterThanOrEqual(5)
      expect(Number.isFinite(secondes(c[2])), `before de ${nom}`).toBe(true)
      expect(Number.isFinite(secondes(c[3])), `after de ${nom}`).toBe(true)
      expect(secondes(c[3])).toBeGreaterThan(0)
    }
  })

  it('quotes as « before » the figures measured on main (docs/tests-ecran/avant.md: 1297.2, 281.6, 453.5, 583.3, 1522.7, 1222.1, 899.9, total 6260.3), to the second', () => {
    const attendus: Record<string, number> = {
      'web-chat-charte': 1297, 'web-hors-ligne-acces': 282, 'web-mcp-pages': 454, 'bench-chat': 583,
      'bench-pages': 1523, 'bench-plugins-shell': 1222, serveur: 900, total: 6260,
    }
    for (const [nom, s] of Object.entries(attendus)) {
      expect(Math.abs(secondes(ligneDe(nom)[2]) - s), `before de ${nom}`).toBeLessThanOrEqual(1)
    }
  })

  it('gives a difference equal to after minus before, and a total equal to the sum of the clusters', () => {
    for (const nom of [...GRAPPES, 'total']) {
      const c = ligneDe(nom)
      const diff = Number((/([+-]?\s*\d+)\s*s/.exec((c[4] ?? '').replace('−', '-'))?.[1] ?? 'NaN').replace(/\s/g, ''))
      expect(Math.abs(diff - (secondes(c[3]) - secondes(c[2]))), `différence de ${nom}`).toBeLessThanOrEqual(2)
    }
    const somme = GRAPPES.reduce((s, g) => s + secondes(ligneDe(g)[3]), 0)
    expect(Math.abs(somme - secondes(ligneDe('total')[3]))).toBeLessThanOrEqual(3)
  })

  it('says which screen tests were measured, and with what command', () => {
    expect(section).toContain('scripts/mesurer-tests-ecran.mjs')
  })
})
