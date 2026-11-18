/** Feature adestia-bloc-a-copier (B-copie-1, E-16): settled threads with `copy` fences, and a turn that streams one. */
import { configFor, populate, storeToken } from './_base.mjs'
import { at, conversation, page, put, said, userDirectory } from './_lib.mjs'
import { untilStopped } from '../fake-engine.mjs'

export const THREADS = {
  email: '00000000-0000-4000-8000-0000000c0001',
  bords: '00000000-0000-4000-8000-0000000c0002',
  live: '00000000-0000-4000-8000-0000000c0003',
  crit: '00000000-0000-4000-8000-0000000c0004',
}

const fence = (text, lang = 'copy') => '```' + lang + '\n' + text + '\n```'

export const scripts = [
  {
    when: 'reformule',
    events: [
      { type: 'text-delta', text: 'Voici ton email :\n\n' + fence('Bonjour Anne,\n\nJe confirme jeudi.') + '\n\nDis-moi si tu veux un autre ton.' },
      { type: 'result', sessionId: 'bench-session', stopped: false, usage: { inputTokens: 10, outputTokens: 10, contextTokens: 100 } },
    ],
  },
  {
    when: 'en flux',
    events: async function* (_prompt, request) {
      yield { type: 'text-delta', text: 'Voici :\n\n```copy\nBonjour Claire,\n\nJe reviens vers vous au sujet de' }
      await untilStopped(request.signal)
    },
  },
]

export default async function seed(ctx) {
  await populate(ctx)
  await storeToken(ctx.dataDir)
  await put(ctx.workspace, 'pages/copie/note.md', page({ title: 'Note copie' }, 'Avant.\n\n```copy\nTexte dans une page\n```\n\nApres.'))
  const owner = userDirectory('local')
  await conversation(ctx.dataDir, owner, {
    id: THREADS.email, title: 'Email Anne', updatedAt: at(18),
    messages: [
      said('user', 'Reformule mon email à Anne.'),
      said('agent', 'Voici une version plus claire :\n\n' + fence('Bonjour Anne,\n\nJe confirme jeudi.') + '\n\nJ\'ai gardé le ton. Une variante courte :\n\n' + fence('OK pour jeudi, Paul.') + '\n\n' + fence('npm test', 'sh') + '\n\n' + fence('Mot : https://exemple.test/' + 'a'.repeat(300))),
    ],
  })
  await conversation(ctx.dataDir, owner, {
    id: THREADS.bords, title: 'Bords', updatedAt: at(17),
    messages: [
      said('user', 'Bords'),
      said('agent', 'Vide :\n\n```copy\n```\n\nFin vide.'),
      said('user', 'Interrompu'),
      said('agent', 'Début :\n\n```copy\nBonjour Marc,\n\nLa suite manque'),
    ],
  })
  await conversation(ctx.dataDir, owner, { id: THREADS.live, title: 'Live', updatedAt: at(16), messages: [said('user', 'Salut'), said('agent', 'Salut.')] })
  await conversation(ctx.dataDir, owner, { id: THREADS.crit, title: 'Critere', updatedAt: at(15), messages: [said('user', 'Salut'), said('agent', 'Salut.')] })
  return configFor(ctx)
}
