/**
 * The fake engine's scripts that produce the chat states of docs/ecrans.md
 * (E-16 to E-18). Each is keyed by the message that triggers it, so a check or
 * a sweep asks for a state by typing its word. Deterministic: the same words
 * give the same events.
 *
 *   fini                finished turn, two text parts
 *   outil               tool outcomes: a Read that worked, a Bash that failed
 *   erreur              the turn ends on an error
 *   permission          a permission question, then the turn waits (E-17)
 *   signature           a consent and a grant card (E-18)
 *   en cours            a turn that stays open until it is stopped
 *   long contexte       a result whose context weighs 150k tokens (pill: hot)
 *   contexte moyen      ... 75k tokens (pill: warn)
 */
import { untilStopped } from '../fake-engine.mjs'

/** Exact origin the seeds put in `signatures.origins`: a card is drawn only for it. */
export const SIGNATURE_ORIGIN = 'https://signatures.bench.invalid'

const result = (contextTokens) => ({
  type: 'result',
  sessionId: 'bench-session',
  stopped: false,
  usage: { inputTokens: 1200, outputTokens: 340, contextTokens },
})

export const chatScripts = [
  {
    when: 'fini',
    events: [
      { type: 'text-delta', text: 'Voici la liste des courses de la semaine.' },
      { type: 'text-delta', text: ' Rien ne manque pour samedi.' },
      result(4200),
    ],
  },
  {
    when: 'outil',
    events: [
      { type: 'text-delta', text: 'Je regarde la page.' },
      { type: 'tool-use', name: 'Read', target: 'pages/voyages/lisbonne.md', id: 't1' },
      { type: 'tool-result', name: 'Read', ok: true, id: 't1' },
      { type: 'tool-use', name: 'Bash', target: 'grep -r vol pages', id: 't2' },
      { type: 'tool-result', name: 'Bash', ok: false, id: 't2' },
      { type: 'text-delta', text: 'La recherche a échoué, mais la page se lit.' },
      result(9800),
    ],
  },
  {
    when: 'erreur',
    events: [
      { type: 'text-delta', text: 'Je commence…' },
      { type: 'error', message: 'The engine stopped: rate limit reached, try again later.', fatal: true },
    ],
  },
  {
    when: 'permission',
    events: async function* (_prompt, request) {
      yield { type: 'text-delta', text: 'Je dois lancer une commande.' }
      yield {
        type: 'permission-request',
        id: 'bench-ask-1',
        tool: 'Bash',
        title: 'Run `rm -rf pages/brouillons`?',
        reason: 'The command deletes a folder.',
        remembering: true,
      }
      await untilStopped(request.signal)
    },
  },
  {
    when: 'signature',
    events: [
      { type: 'text-delta', text: 'Deux actions attendent votre signature.' },
      { type: 'tool-use', name: 'calendar_write', id: 's1' },
      { type: 'tool-result', name: 'calendar_write', ok: false, id: 's1' },
      {
        type: 'signature-request',
        id: 'consent-0001',
        kind: 'consent',
        url: `${SIGNATURE_ORIGIN}/consent/consent-0001`,
        expiresAt: '2099-01-01T10:00:00Z',
      },
      {
        type: 'signature-request',
        id: 'grant-0002',
        kind: 'grant',
        url: `${SIGNATURE_ORIGIN}/grant/grant-0002`,
        expiresAt: '2099-01-02T10:00:00Z',
      },
      result(5100),
    ],
  },
  {
    when: 'en cours',
    events: async function* (_prompt, request) {
      yield { type: 'text-delta', text: 'Je travaille sur votre demande' }
      yield { type: 'tool-use', name: 'Read', target: 'pages/maison/travaux.md', id: 'r1' }
      await untilStopped(request.signal)
    },
  },
  { when: 'long contexte', events: [{ type: 'text-delta', text: 'Le fil est long.' }, result(150_000)] },
  { when: 'contexte moyen', events: [{ type: 'text-delta', text: 'Le fil grossit.' }, result(75_000)] },
]
