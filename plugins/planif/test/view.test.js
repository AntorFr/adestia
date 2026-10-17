/** Planif says its states in the reader's language and dates by that locale. */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { mount } from '../../test/mount.js'
import view, { table } from '../web/app.js'

const NOTES = [
  { id: 'a', title: 'Fini', enabled: false, done: '2026-09-01', every: 'daily', prompt: 'p' },
  { id: 'b', title: 'Perdu', enabled: false, expired: '2026-09-02', every: 'daily', prompt: 'p' },
  { id: 'c', title: 'Pause', enabled: false, every: 'daily', prompt: 'p' },
  { id: 'd', title: 'Borné', enabled: true, until: '2026-12-01', every: 'daily', prompt: 'p', lastRun: '2026-09-03T12:00:00Z' },
]
const apiFor = (locale, enabled = true) => ({
  id: 'planif', locale,
  fetch: () => Promise.resolve({ json: () => Promise.resolve({ enabled, notes: NOTES }) }),
  ask() {}, compose() {}, trail() {},
})

test('table is exported and has the French states', () => {
  assert.equal(table('fr-FR')['done %when'], 'terminée %when')
  assert.deepEqual(table('en'), {})
})

test('French: every state and button is said in French', async () => {
  const { document, root } = await mount(view, apiFor('fr'), '#/planif')
  const text = document.body.textContent
  for (const s of ['horloge en marche', 'terminée 2026-09-01', 'expirée 2026-09-02', 'suspendue',
    'jusqu’au 2026-12-01', 'Demander la reprise', 'Demander la suspension',
    '＋ Demander une nouvelle planification', 'dernier ', 'prochain ']) {
    assert.ok(text.includes(s), `missing: ${s}`)
  }
  assert.ok(!/\b(done|expired|suspended|until|last|next|Ask to)\b/.test(text), text)
  assert.match(text, /03\/09\/2026/, 'date in the French order')
  root.unmount()
})

test('English: states keep their English words, and no placeholder leaks', async () => {
  const { document, root } = await mount(view, apiFor('en'), '#/planif')
  const text = document.body.textContent
  for (const s of ['clock running', 'done 2026-09-01', 'expired 2026-09-02', 'suspended',
    'until 2026-12-01', 'Ask to resume', 'Ask to suspend', 'last ', 'next ']) {
    assert.ok(text.includes(s), `missing: ${s}`)
  }
  assert.ok(!text.includes('%'), text)
  root.unmount()
})
