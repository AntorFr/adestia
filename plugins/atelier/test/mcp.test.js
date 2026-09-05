/**
 * Le moteur vu par l'agent — une vraie poignée de main JSON-RPC.
 *
 * Ce que ces tests protègent : que les cinq outils soient annoncés, qu'un
 * appel rende du texte lisible par un modèle, et surtout qu'une erreur revienne
 * en `isError` avec son texte plutôt qu'en erreur de protocole. Une erreur
 * JSON-RPC finit dans un journal que personne ne regarde pendant un tour ;
 * `isError` atteint le modèle, qui peut alors corriger.
 *
 * Et cinq outils, pas trente : chaque outil déclaré coûte du contexte à chaque
 * tour, et l'économie de contexte est la moitié du sujet.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const serveur = join(here, '..', 'mcp', 'serveur.mjs')

/** Une copie jetable de l'exemple livré. */
const bac = () => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-mcp-'))
  cpSync(join(here, '..', 'exemples'), dir, { recursive: true })
  return { wb: join(dir, 'meuble-tiroirs.workbook.json'), regles: join(dir, 'regles') }
}

/** Envoie des messages, rend les réponses, ferme. */
const dialogue = (messages) => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [serveur])
  let sortie = ''
  p.stdout.on('data', (c) => { sortie += c })
  p.on('error', reject)
  p.on('close', () => resolve(sortie.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))))
  for (const m of messages) p.stdin.write(`${JSON.stringify(m)}\n`)
  p.stdin.end()
})

test('la poignée de main annonce des outils', async () => {
  const [init] = await dialogue([{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }])
  assert.equal(init.result.serverInfo.name, 'atelier')
  assert.deepEqual(init.result.capabilities, { tools: {} })
})

test('cinq outils, pas trente — le contexte se paie à chaque tour', async () => {
  const [liste] = await dialogue([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }])
  const noms = liste.result.tools.map((t) => t.name).sort()
  assert.deepEqual(noms, [
    'atelier_chant', 'atelier_derive', 'atelier_etat', 'atelier_explique', 'atelier_questions',
  ])
  for (const t of liste.result.tools) {
    assert.ok(t.description.length > 40, `${t.name} : une description qui dit quand s'en servir`)
    assert.equal(t.inputSchema.type, 'object')
  }
})

test('dériver rend les cotes, le plan de débit et le delta', async () => {
  const { wb, regles } = bac()
  const [{ result }] = await dialogue([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'atelier_derive', arguments: { workbook: wb, regles } } },
  ])
  assert.equal(result.isError, undefined)
  const texte = result.content[0].text
  assert.match(texte, /BLT-A1-CÔTÉ-G\s+851/)
  assert.match(texte, /MEL19 : 1 plaque\(s\)/)
  assert.match(texte, /en couché : 1 plaque/)
})

test('expliquer une cote nomme les règles qui la déterminent', async () => {
  const { wb, regles } = bac()
  const [{ result }] = await dialogue([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'atelier_explique', arguments: { workbook: wb, regles, piece: 'BLT-A1-CÔTÉ-G' } } },
  ])
  const texte = result.content[0].text
  assert.match(texte, /bute-z/)
  assert.match(texte, /meuble\/hauteur-hors-tout/)
  assert.match(texte, /dessus ligne 1 → dessus-traverses/)
})

test('une pièce inconnue revient en isError, avec la liste des vraies', async () => {
  const { wb, regles } = bac()
  const [{ result }] = await dialogue([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'atelier_explique', arguments: { workbook: wb, regles, piece: 'BLT-A1-LICORNE' } } },
  ])
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /n'est pas une pièce de ce meuble/)
  assert.match(result.content[0].text, /BLT-A1-CÔTÉ-G/)
})

test('une table cassée revient en isError, pas en panne de protocole', async () => {
  const { wb } = bac()
  const [{ result }] = await dialogue([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'atelier_derive', arguments: { workbook: wb, regles: '/nulle/part' } } },
  ])
  assert.equal(result.isError, true)
  assert.ok(result.content[0].text.length > 0, 'et le modèle lit de quoi corriger')
})

test('changer les faces chantées recalcule, et le dit', async () => {
  const { wb, regles } = bac()
  const [{ result }] = await dialogue([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'atelier_chant', arguments: { workbook: wb, regles, faces: 'avant' } } },
  ])
  assert.match(result.content[0].text, /BLT-A1-BAS\s+1120/, 'plus d\'abouts chantés, plus de retrait')
})

test('sans rien écrire, le fichier reste intact', async () => {
  const { wb, regles } = bac()
  const [{ result }] = await dialogue([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'atelier_derive', arguments: { workbook: wb, regles } } },
  ])
  assert.match(result.content[0].text, /ecrit: true pour enregistrer/)
})

test('un ping ne bloque pas la poignée de main', async () => {
  const [pong] = await dialogue([{ jsonrpc: '2.0', id: 7, method: 'ping' }])
  assert.equal(pong.id, 7)
})
