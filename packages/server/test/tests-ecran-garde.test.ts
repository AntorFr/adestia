import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { cleanTmp, tmpDir } from './support/tmp.js'

// @ts-expect-error — a plain .mjs script, without declarations
import { lireCadre, verifier } from '../../../scripts/tests-ecran.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
afterEach(cleanTmp)

const NAVIGATEUR = 'chrom' + 'ium' // the guard recognises a screen file by this word: keep it out of this file
const NAVIGATEUR_RE = new RegExp(NAVIGATEUR + '|play' + 'wright')
const ECRAN = 'packages/web/test/a-browser.test.ts'
const HORS = 'packages/server/test/a-route.test.ts'

function ecrire(racine: string, chemin: string, texte: string) {
  mkdirSync(dirname(join(racine, chemin)), { recursive: true })
  writeFileSync(join(racine, chemin), texte)
}

const entete = '| Test | Classe | Hors écran | À l\'écran | Raison |\n|---|---|---|---|---|\n'

/** A minimal repository: one grappe `g` with one screen file, one out-of-screen test file. */
async function depot(opts: { statut?: string; lignes?: string; fichiers?: string[]; extra?: Record<string, string>; existants?: string } = {}) {
  const r = await tmpDir('tests-ecran-')
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

  it('est vert sur un inventaire complet, et sur une grappe déclarée vide', async () => {
    expect(verifier(await depot())).toEqual([])
    expect(verifier(await depot({ statut: 'vide', lignes: '' }))).toEqual([])
  })

  it('accepte les cellules Test et Hors écran entre accents graves', async () => {
    const ligne = `| \`${ECRAN} > affiche le fil\` | effet | \`${HORS} > supprime puis relit\` | retiré | |\n`
    expect(verifier(await depot({ lignes: ligne }))).toEqual([])
    expect(verifier(await depot({ lignes: `| \`${ECRAN} > affiche le fil\` | sans-porte | | | pas de route |\n` }))).toEqual([])
  })

  it('est rouge sur un fichier d\'écran ajouté sans grappe', async () => {
    const r = await depot({ extra: { 'packages/web/test/nouveau.test.ts': `// ${NAVIGATEUR}\n` } })
    expect(verifier(r)).toEqual(['packages/web/test/nouveau.test.ts pilote un navigateur et n\'est dans aucune grappe'])
  })

  it('est rouge sur un effet qui cite un test hors écran absent', async () => {
    const ligne = (hors: string) => `| ${ECRAN} > affiche le fil | effet | ${hors} | retiré | |\n`
    expect(verifier(await depot({ lignes: ligne(`${HORS} > supprime puis relit`) }))).toEqual([])
    for (const hors of [`${HORS} > un test qui n'existe pas`, 'packages/server/test/absent.test.ts > x', ECRAN + ' > affiche le fil', '']) {
      expect(verifier(await depot({ lignes: ligne(hors) })), hors).toHaveLength(1)
    }
  })

  it('est rouge sur une ligne d\'un test d\'écran existant disparue de l\'inventaire', async () => {
    const r = await depot({ lignes: '', existants: `${ECRAN} > affiche le fil\n` })
    expect(verifier(r)).toEqual([`docs/tests-ecran/g.md: la ligne de « ${ECRAN} > affiche le fil » a disparu`])
  })

  it('est rouge sur une ligne sans-porte sans raison, verte avec sa raison', async () => {
    const ligne = (raison: string) => `| ${ECRAN} > affiche le fil | sans-porte | | | ${raison} |\n`
    expect(verifier(await depot({ lignes: ligne('') }))).toHaveLength(1)
    expect(verifier(await depot({ lignes: ligne('le service worker ne vit que dans un navigateur') }))).toEqual([])
  })

  it('laisse hors inventaire les tests du script de niveaux, qui ne nomment le navigateur que dans une fixture', async () => {
    for (const f of ['bench/tests/niveaux-besoin.test.mjs', 'bench/tests/niveaux-ensemble.test.mjs']) {
      expect(readFileSync(join(root, f), 'utf8'), f).toMatch(NAVIGATEUR_RE)
      expect(lireCadre(root).hors.has(f), f).toBe(true)
      expect(verifier(root).filter((p: string) => p.includes(f)), f).toEqual([])
    }
  })
})
