/**
 * L'outil en ligne de commande, sur les deux schémas qu'il sert.
 *
 * Ce que ces tests protègent : qu'un workbook dont la source a bougé depuis le
 * dernier calcul ne puisse pas passer pour bon. Sa géométrie est cohérente
 * avec elle-même — le validateur du 3.0 n'a rien à lui reprocher — et il
 * décrit pourtant un meuble que le design ne décrit plus. C'est le seul cas où
 * une suite verte mentirait.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { normalise } from '../web/convert.js'
import { signature } from '../moteur/design.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const outil = join(here, '..', 'tools', 'atelier.mjs')
const fixture = () => JSON.parse(readFileSync(join(here, 'fixture-workbook.json'), 'utf8'))

const ecrit = (wb) => {
  const chemin = join(mkdtempSync(join(tmpdir(), 'atelier-')), 'workbook.json')
  writeFileSync(chemin, JSON.stringify(wb))
  return chemin
}

const lance = (cmd, chemin) => {
  try {
    return { out: execFileSync(process.execPath, [outil, cmd, chemin], { encoding: 'utf8' }), code: 0 }
  } catch (e) {
    return { out: `${e.stdout ?? ''}${e.stderr ?? ''}`, code: e.status }
  }
}

const design = { famille: 'caisson', pose: 'fixe', hors_tout: { l: 1120, p: 600, h: 870 } }

/** La fixture, passée en 4.0 et signée de son propre design. */
const frais = () => ({ ...fixture(), schemaVersion: '4.0', design, derive: signature(design, 'test') })

test('un 4.0 traverse `normalise` sans être ramené au 3.0', () => {
  const wb = frais()
  const sorti = normalise(wb)
  assert.equal(sorti.schemaVersion, '4.0')
  assert.deepEqual(sorti.design, design)
})

test('un workbook d\'avant le moteur est orphelin, et ça n\'est pas un échec', () => {
  const { out, code } = lance('etat', ecrit(fixture()))
  assert.equal(code, 0)
  assert.match(out, /orphelin/)
})

test('un 4.0 signé de son design est annoncé à jour', () => {
  const { out, code } = lance('etat', ecrit(frais()))
  assert.equal(code, 0)
  assert.match(out, /à jour/)
  assert.match(out, /4\.0/)
})

test('changer le design périme le dérivé, et l\'outil le dit avec les deux empreintes', () => {
  const wb = frais()
  wb.design = { ...design, hors_tout: { ...design.hors_tout, h: 900 } }
  const { out, code } = lance('etat', ecrit(wb))
  assert.equal(code, 1)
  assert.match(out, /PÉRIMÉ/)
  assert.match(out, /le design vaut fnv1a64:/)
})

test('valider un 4.0 frais applique les mêmes règles de géométrie qu\'un 3.0', () => {
  const { out, code } = lance('valide', ecrit(frais()))
  assert.equal(code, 0)
  assert.match(out, /✓ valide/)
})

test('une géométrie juste ne suffit pas si le dérivé ne vient plus de ce design', () => {
  const wb = frais()
  wb.design = { ...design, pose: 'mobile' }
  const { out, code } = lance('valide', ecrit(wb))
  assert.equal(code, 1)
  assert.match(out, /géométrie valide, mais le dérivé ne vient plus de ce design/)
})

test('un design sans dérivation qui s\'en réclame passe, mais est signalé', () => {
  const wb = { ...fixture(), schemaVersion: '4.0', design }
  const { out, code } = lance('valide', ecrit(wb))
  assert.equal(code, 0)
  assert.match(out, /non signé/)
})
