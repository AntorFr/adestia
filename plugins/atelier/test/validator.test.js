/**
 * The ported rules, against a real workbook.
 *
 * `tools/atelier.mjs` came across verbatim from the shell this plugin was
 * lifted out of, where it had been settled over months of actual cutting. The
 * point of this test is not to re-specify woodwork — it is to notice if a
 * future edit to the port changes what the validator accepts, which is the
 * one thing about it that must not drift.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const tool = join(here, '..', 'tools', 'atelier.mjs')
const fixturePath = join(here, 'fixture-workbook.json')

/** A mutated fixture, written where the tool can read it. */
const write = (workbook) => {
  const path = join(mkdtempSync(join(tmpdir(), 'atelier-')), 'workbook.json')
  writeFileSync(path, JSON.stringify(workbook))
  return path
}

const validate = (path) => {
  try {
    return { out: execFileSync(process.execPath, [tool, 'valide', path], { encoding: 'utf8' }), ok: true }
  } catch (error) {
    return { out: `${error.stdout ?? ''}${error.stderr ?? ''}`, ok: false }
  }
}

test('a sound workbook validates', () => {
  const { out, ok } = validate(fixturePath)
  assert.ok(ok, out)
  assert.match(out, /✓ valide/)
  assert.match(out, /4 pièces/)
})

test('a piece nobody can cut is reported', () => {
  const workbook = JSON.parse(readFileSync(fixturePath, 'utf8'))
  // Declared, but absent from every step of the cutting plan: it would never
  // come off the sheet, and nothing on screen would say so.
  workbook.pieces.push({ ...workbook.pieces[0], etiquette: 'GAR-C1-ORPHELINE' })
  const { out, ok } = validate(write(workbook))
  assert.equal(ok, false, out)
  assert.match(out, /jamais débitée/)
  assert.match(out, /GAR-C1-ORPHELINE/)
})

test('a piece that no longer fits its band is reported', () => {
  const workbook = JSON.parse(readFileSync(fixturePath, 'utf8'))
  // The cutting plan is unchanged — only the piece grew. What the validator
  // catches is the geometry that follows: it no longer fits the band it was
  // placed in, nor the usable area of the sheet.
  workbook.pieces[0].longueur = 9000
  const { out, ok } = validate(write(workbook))
  assert.equal(ok, false, 'a piece larger than its sheet must not pass')
  assert.match(out, /hors zone utile|déborde/)
  assert.match(out, new RegExp(workbook.pieces[0].etiquette))
})

test('the edge-banding vocabulary is closed', () => {
  // A typo in `chants` would otherwise reach the diagram as an edge silently
  // not drawn — the kind of error you find at the saw.
  const workbook = JSON.parse(readFileSync(fixturePath, 'utf8'))
  workbook.pieces[0].chants = ['rive-avant', 'rive-du-milieu']
  const { out, ok } = validate(write(workbook))
  assert.equal(ok, false, out)
  assert.match(out, /chant inconnu/)
})
