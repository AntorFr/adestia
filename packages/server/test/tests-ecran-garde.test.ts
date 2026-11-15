import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error — a plain .mjs script, without declarations
import { verifier } from '../../../scripts/tests-ecran.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

const NAVIGATEUR = 'chrom' + 'ium' // the guard recognises a screen file by this word: keep it out of this file
const ECRAN = 'packages/web/test/a-browser.test.ts'
const HORS = 'packages/server/test/a-route.test.ts'

function ecrire(racine: string, chemin: string, texte: string) {
  mkdirSync(dirname(join(racine, chemin)), { recursive: true })
  writeFileSync(join(racine, chemin), texte)
}

const entete = '| Test | Classe | Hors écran | À l\'écran | Raison |\n|---|---|---|---|---|\n'

/** A minimal repository: one grappe `g` with one screen file, one out-of-screen test file. */
function depot(opts: { statut?: string; lignes?: string; fichiers?: string[]; extra?: Record<string, string>; existants?: string } = {}) {
  const r = mkdtempSync(join(tmpdir(), 'tests-ecran-'))
  dirs.push(r)
  const fichiers = opts.fichiers ?? [ECRAN]
  ecrire(r, 'docs/tests-ecran/README.md', `# x\n\n## Grappes\n\n### g\n\n${fichiers.map((f) => `- \`${f}\`\n`).join('')}\n## Hors inventaire\n\n- \`bench/tests/garde.test.mjs\` — garde\n`)
  ecrire(r, 'docs/tests-ecran/g.md', `# g\n\nStatut : ${opts.statut ?? 'complet'}\n\n${entete}${opts.lignes ?? `| ${ECRAN} > affiche le fil | affichage | | | |\n`}`)
  ecrire(r, 'docs/tests-ecran/existants.txt', opts.existants ?? `${ECRAN} > affiche le fil\n`)
  ecrire(r, ECRAN, `import { it } from 'vitest'\nconst b = '${NAVIGATEUR}'\nit('affiche le fil', () => {})\n`)
  ecrire(r, HORS, `import { it } from 'vitest'\nit('supprime puis relit', () => {})\n`)
  ecrire(r, 'bench/tests/garde.test.mjs', `// ${NAVIGATEUR}\n`)
  for (const [chemin, texte] of Object.entries(opts.extra ?? {})) ecrire(r, chemin, texte)
  return r
}

describe('garde-fou des inventaires de tests d\'écran', () => {
  it('le dépôt tient ses inventaires', () => {
    expect(verifier(root)).toEqual([])
  })

  it('est vert sur un inventaire complet, et sur une grappe déclarée vide', () => {
    expect(verifier(depot())).toEqual([])
    expect(verifier(depot({ statut: 'vide', lignes: '' }))).toEqual([])
  })

  it('est rouge sur un fichier d\'écran ajouté sans grappe', () => {
    const r = depot({ extra: { 'packages/web/test/nouveau.test.ts': `// ${NAVIGATEUR}\n` } })
    expect(verifier(r)).toEqual(['packages/web/test/nouveau.test.ts pilote un navigateur et n\'est dans aucune grappe'])
  })

  it('est rouge sur un effet qui cite un test hors écran absent', () => {
    const ligne = (hors: string) => `| ${ECRAN} > affiche le fil | effet | ${hors} | retiré | |\n`
    expect(verifier(depot({ lignes: ligne(`${HORS} > supprime puis relit`) }))).toEqual([])
    for (const hors of [`${HORS} > un test qui n'existe pas`, 'packages/server/test/absent.test.ts > x', ECRAN + ' > affiche le fil', '']) {
      expect(verifier(depot({ lignes: ligne(hors) })), hors).toHaveLength(1)
    }
  })

  it('est rouge sur une ligne d\'un test d\'écran existant disparue de l\'inventaire', () => {
    const r = depot({ lignes: '', existants: `${ECRAN} > affiche le fil\n` })
    expect(verifier(r)).toEqual([`docs/tests-ecran/g.md: la ligne de « ${ECRAN} > affiche le fil » a disparu`])
  })

  it('est rouge sur une ligne sans-porte sans raison, verte avec sa raison', () => {
    const ligne = (raison: string) => `| ${ECRAN} > affiche le fil | sans-porte | | | ${raison} |\n`
    expect(verifier(depot({ lignes: ligne('') }))).toHaveLength(1)
    expect(verifier(depot({ lignes: ligne('le service worker ne vit que dans un navigateur') }))).toEqual([])
  })
})
