/**
 * The base instance plus a conversation whose second agent message carries
 * `contextLost: true` (what the server stores after a refused resume), a
 * second mark further down, and a long list. No engine, no token needed.
 */
import { configFor, populate, storeToken } from './_base.mjs'
import { at, conversation, said, userDirectory } from './_lib.mjs'

export const MARKED = '00000000-0000-4000-8000-0000000000a1'
export const PLAIN = '00000000-0000-4000-8000-0000000000a2'
export const config = { file: 'none' }

export default async function seed(ctx) {
  await populate(ctx)
  const owner = userDirectory('local')
  await conversation(ctx.dataDir, owner, {
    id: MARKED, title: 'Marque — le moteur a perdu le contexte', updatedAt: at(17),
    messages: [
      said('user', 'Reprends le devis de la salle de bain.'),
      said('agent', 'Voici le devis, poste par poste.'),
      said('user', 'Et pour la cuisine ?'),
      said('agent', 'Je n’ai plus les messages précédents sous les yeux, mais voici ce que je propose pour la cuisine : reprendre la crédence, changer le plan de travail et poser un éclairage sous les meubles hauts, le tout en une semaine.', { contextLost: true }),
      said('user', 'Merci.'),
      said('agent', 'Avec plaisir.'),
      said('user', 'Encore une chose.'),
      said('agent', 'Je t’écoute — une seconde reprise à froid, donc une seconde marque.', { contextLost: true }),
    ],
  })
  await conversation(ctx.dataDir, owner, {
    id: PLAIN, title: 'Sans marque', updatedAt: at(16),
    messages: [said('user', 'Bonjour.'), said('agent', 'Bonjour !')],
  })
  for (let i = 10; i < 30; i++) {
    await conversation(ctx.dataDir, owner, {
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      title: `Conversation semée ${i} — un titre volontairement long`, updatedAt: at(8),
      messages: [said('user', `Question ${i}.`)],
    })
  }
  await storeToken(ctx.dataDir)
  return configFor(ctx)
}
