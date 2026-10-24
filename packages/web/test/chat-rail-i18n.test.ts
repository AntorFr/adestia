/**
 * The chat rail speaks one language (E-16, Q-9): every key the rail passes to t() has a
 * French wording, and the English one is the key itself. Expected values are written by hand.
 * Fails if a key is dropped from the French table, or a new rail string ships untranslated.
 */
import { describe, expect, it } from 'vitest'

import { translator } from '../src/app/i18n.js'

const FR: Record<string, string> = {
  'New conversation': 'Nouvelle conversation',
  'Open apps': 'Ouvrir les apps',
  'Close tab': 'Fermer l’onglet',
  Working: 'En cours',
  Idle: 'Au repos',
  Waiting: 'En attente',
  Unread: 'Non lu',
  Failed: 'Échec',
  '%n tool call': '%n appel d’outil',
  '%n tool calls': '%n appels d’outil',
  'Weight of the context your next message re-pays': 'Poids du contexte repris par votre prochain message',
}

describe('chat rail strings', () => {
  const en = translator('en')
  const fr = translator('fr')
  it.each(Object.entries(FR))('%s: English is the key, French is the hand-written wording', (key, french) => {
    expect(en(key)).toBe(key)
    expect(fr(key)).toBe(french)
  })
  it('has a French wording for every other t() key of the rail', () => {
    for (const key of ['Archive', 'Model', 'No conversation yet.', 'Turn interrupted.', 'Not now', 'Connect']) {
      expect(fr(key), key).not.toBe(key)
    }
  })
})
