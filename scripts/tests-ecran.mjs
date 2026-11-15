// Guard of the screen-test inventories (docs/tests-ecran/). Pure reading: `verifier(root)` returns
// the list of problems, empty when the inventories hold. CLI: `node scripts/tests-ecran.mjs` prints
// them and exits 1; `node scripts/tests-ecran.mjs fichiers` prints the screen files, one per line.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MOTIF_ECRAN = /chromium|playwright/
export const CLASSES = ['affichage', 'effet', 'scindé', 'sans-porte']
export const DEVENIRS = ['gardé', 'allégé', 'retiré']
const SUFFIXE = /\.test\.(?:ts|tsx|mjs|js)$/

const lire = (root, chemin) => readFileSync(join(root, chemin), 'utf8')

function listerTests(root, dossier, sortie) {
  if (!existsSync(join(root, dossier))) return
  for (const nom of readdirSync(join(root, dossier))) {
    if (nom === 'node_modules') continue
    const chemin = `${dossier}/${nom}`
    if (statSync(join(root, chemin)).isDirectory()) listerTests(root, chemin, sortie)
    else if (SUFFIXE.test(nom)) sortie.push(chemin)
  }
}

/** Every test file of the repository, sorted. */
export function fichiersDeTest(root) {
  const sortie = []
  for (const paquet of existsSync(join(root, 'packages')) ? readdirSync(join(root, 'packages')) : []) listerTests(root, `packages/${paquet}/test`, sortie)
  for (const dossier of ['bench/tests']) listerTests(root, dossier, sortie)
  for (const plugin of existsSync(join(root, 'plugins')) ? readdirSync(join(root, 'plugins')) : []) listerTests(root, `plugins/${plugin}/test`, sortie)
  return sortie.sort()
}

/** Reads docs/tests-ecran/README.md: the grappes and their files, the files kept out of the inventory. */
export function lireCadre(root) {
  const grappes = new Map()
  const hors = new Map()
  let section = ''
  let courante = ''
  for (const ligne of lire(root, 'docs/tests-ecran/README.md').split('\n')) {
    const h2 = /^## (.+?)\s*$/.exec(ligne)
    if (h2) { section = h2[1]; courante = ''; continue }
    const h3 = /^### (\S+)\s*$/.exec(ligne)
    if (h3 && section === 'Grappes') { courante = h3[1]; grappes.set(courante, []); continue }
    const puce = /^- `([^`]+)`(?:\s*[—–-]\s*(.*))?$/.exec(ligne)
    if (!puce) continue
    if (section === 'Grappes' && courante) grappes.get(courante).push(puce[1])
    if (section === 'Hors inventaire') hors.set(puce[1], puce[2] ?? '')
  }
  return { grappes, hors }
}

const cellules = (ligne) => ligne.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))

/** Reads docs/tests-ecran/<grappe>.md: its status and its rows. */
export function lireInventaire(root, grappe) {
  const chemin = `docs/tests-ecran/${grappe}.md`
  if (!existsSync(join(root, chemin))) return null
  let statut = null
  const lignes = []
  for (const ligne of lire(root, chemin).split('\n')) {
    const s = /^Statut\s*:\s*(\S+)/.exec(ligne)
    if (s) statut = s[1]
    if (!ligne.trim().startsWith('|')) continue
    const c = cellules(ligne)
    if (c[0] === 'Test' || /^:?-+:?$/.test(c[0])) continue
    lignes.push({ test: c[0], classe: c[1] ?? '', horsEcran: c[2] ?? '', alEcran: c[3] ?? '', raison: c[4] ?? '' })
  }
  return { chemin, statut, lignes }
}

/** The tests that existed before the work, as `<file> > <title>`, from docs/tests-ecran/existants.txt. */
export function lireExistants(root) {
  const chemin = 'docs/tests-ecran/existants.txt'
  if (!existsSync(join(root, chemin))) return []
  return lire(root, chemin).split('\n').filter((l) => l && !l.startsWith('#'))
}

/** A named out-of-screen test exists: its file is a test file that is not a screen file, and the title is in it. */
function horsEcranExiste(root, nom, ecran) {
  const i = nom.indexOf(' > ')
  if (i < 0) return false
  const fichier = nom.slice(0, i)
  const titre = nom.slice(i + 3)
  if (ecran.has(fichier) || !SUFFIXE.test(fichier) || !existsSync(join(root, fichier))) return false
  return lire(root, fichier).includes(titre)
}

export function verifier(root) {
  const problemes = []
  const { grappes, hors } = lireCadre(root)
  const ecran = new Set(fichiersDeTest(root).filter((f) => !hors.has(f) && MOTIF_ECRAN.test(lire(root, f))))
  const grappeDe = new Map()
  for (const [grappe, fichiers] of grappes) {
    for (const f of fichiers) {
      if (!existsSync(join(root, f))) problemes.push(`${grappe}: ${f} n'existe pas`)
      if (grappeDe.has(f)) problemes.push(`${f} est dans deux grappes (${grappeDe.get(f)}, ${grappe})`)
      grappeDe.set(f, grappe)
    }
  }
  for (const f of ecran) if (!grappeDe.has(f)) problemes.push(`${f} pilote un navigateur et n'est dans aucune grappe`)
  const existants = lireExistants(root)
  for (const [grappe, fichiers] of grappes) {
    const inv = lireInventaire(root, grappe)
    if (!inv) { problemes.push(`${grappe}: docs/tests-ecran/${grappe}.md manque`); continue }
    if (inv.statut !== 'vide' && inv.statut !== 'complet') problemes.push(`${inv.chemin}: « Statut : vide » ou « Statut : complet » manque`)
    const noms = new Set(inv.lignes.map((l) => l.test))
    for (const l of inv.lignes) {
      const ou = `${inv.chemin}: ${l.test}`
      if (!fichiers.includes(l.test.split(' > ')[0])) problemes.push(`${ou}: fichier hors de la grappe`)
      if (!CLASSES.includes(l.classe)) { problemes.push(`${ou}: classe « ${l.classe} » inconnue`); continue }
      if (l.classe === 'effet' || l.classe === 'scindé') {
        if (!horsEcran(l, root, ecran)) problemes.push(`${ou}: le test hors écran « ${l.horsEcran} » n'existe pas`)
        if (!DEVENIRS.includes(l.alEcran)) problemes.push(`${ou}: « ${l.alEcran} » n'est pas gardé, allégé ou retiré`)
      }
      if (l.classe === 'sans-porte' && !l.raison) problemes.push(`${ou}: sans-porte sans raison`)
    }
    if (inv.statut === 'complet') {
      for (const nom of existants) {
        if (fichiers.includes(nom.split(' > ')[0]) && !noms.has(nom)) problemes.push(`${inv.chemin}: la ligne de « ${nom} » a disparu`)
      }
    }
  }
  return problemes
}

const horsEcran = (l, root, ecran) => horsEcranExiste(root, l.horsEcran, ecran)

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  if (process.argv[2] === 'fichiers') {
    const { grappes } = lireCadre(root)
    for (const fichiers of grappes.values()) for (const f of fichiers) console.log(f)
  } else {
    const problemes = verifier(root)
    for (const p of problemes) console.error(p)
    process.exit(problemes.length ? 1 : 0)
  }
}
