/** Feature adestia-bloc-a-copier (B-copie-1, E-16): extreme contents of the copy box, a very long text and a one-line text. */
import { configFor, populate, storeToken } from './_base.mjs'
import { at, conversation, said, userDirectory } from './_lib.mjs'

export const THREADS = {
  long: '00000000-0000-4000-8000-0000000c0011',
  court: '00000000-0000-4000-8000-0000000c0012',
}

const fence = (text) => '```copy\n' + text + '\n```'
export const LONG = Array.from({ length: 120 }, (_, i) => `Ligne ${i + 1} du texte tres long.`).join('\n')

export default async function seed(ctx) {
  await populate(ctx)
  await storeToken(ctx.dataDir)
  const owner = userDirectory('local')
  await conversation(ctx.dataDir, owner, {
    id: THREADS.long, title: 'Long', updatedAt: at(14),
    messages: [said('user', 'Long'), said('agent', 'Voici :\n\n' + fence(LONG) + '\n\nFin.')],
  })
  await conversation(ctx.dataDir, owner, {
    id: THREADS.court, title: 'Court', updatedAt: at(13),
    messages: [said('user', 'Court'), said('agent', 'Voici :\n\n' + fence('Merci.') + '\n\nFin.')],
  })
  return configFor(ctx)
}
