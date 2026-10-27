/**
 * The populated instance every seed but `empty` starts from: the pages, the
 * conversations, the MCP servers, the instruction files and catalogues, the
 * delegations, the brief and the credential that the screens of
 * docs/ecrans.md (« Seeded data for captures ») need, written as the product
 * writes them (docs/donnees.md). Only what has no file to live in is done by
 * `ready`, once the instance listens: the turns that must be running, and the
 * import the product stamps itself.
 *
 * A seed calls `populate(ctx)` for the files and `configFor(ctx, extra)` for
 * the YAML; `ready` is shared as is.
 */
import { join } from 'node:path'

import { BENCH_TOKEN, PNG, at, conversation, gitRepo, page, put, said, userDirectory } from './_lib.mjs'
import { SIGNATURE_ORIGIN } from './_scripts.mjs'

export const MCP_TOKEN = 'bench-mcp-token-0000000000'
export const SESSION_SECRET = 'bench-session-secret-0000000000'

/** The health of each outbound server, as the engine reports it. */
export const MCP_HEALTH = [
  { name: 'fichiers', state: 'connected' },
  { name: 'meteo', state: 'failed', error: 'connect ECONNREFUSED 127.0.0.1:9' },
  { name: 'agenda', state: 'needs-auth' },
  { name: 'recherche', state: 'pending' },
  { name: 'archives', state: 'disabled' },
  { name: 'calendrier', state: 'connected' },
]

/** Fixed ids: the checks and the sweep name a conversation by its title, but a stable id keeps URLs stable. */
export const CONVERSATIONS = {
  running: '00000000-0000-4000-8000-000000000001',
  unread: '00000000-0000-4000-8000-000000000002',
  idle: '00000000-0000-4000-8000-000000000003',
  archived: '00000000-0000-4000-8000-000000000004',
  long: '00000000-0000-4000-8000-000000000005',
  warn: '00000000-0000-4000-8000-000000000006',
  rich: '00000000-0000-4000-8000-000000000007',
}

const manifest = (value) => JSON.stringify({ schemaVersion: 1, ...value }, null, 2) + '\n'

async function plugins(dir) {
  // Refused: the folder says one name, the manifest another (discovery refuses it by name).
  await put(dir, 'bench-refused/adestia-plugin.json', manifest({ id: 'autre-nom', kind: 'app', description: 'Refused on purpose.' }))
  // Refused by ManifestError, without a code: the heading is the shell's word,
  // the invalid field's validator sentence stays the server's data (AD-22).
  await put(dir, 'bench-invalid/adestia-plugin.json', manifest({ id: 'bench-invalid', kind: 'app', description: 42 }))
  // Delivers an instruction file: its skill lands, stamped, in the engine's zone.
  await put(dir, 'bench-notes/adestia-plugin.json', manifest({
    id: 'bench-notes',
    kind: 'tool',
    description: 'Brings a skill and nothing else.',
    skills: ['./skills/notes/SKILL.md'],
  }))
  await put(dir, 'bench-notes/skills/notes/SKILL.md', '---\nname: notes\ndescription: How the bench keeps notes.\n---\n\nKeep notes short.\n')
  // Loaded but missing a secret it declared: degraded, not refused.
  await put(dir, 'bench-degraded/adestia-plugin.json', manifest({
    id: 'bench-degraded',
    kind: 'tool',
    description: 'Declares a secret the environment does not hold.',
    secrets: ['BENCH_MISSING_SECRET'],
  }))
}

const CORE_BLOCKS = `# Tous les blocs

Un paragraphe, puis une liste à puces :

- un premier point
- un second, avec **du gras** et un [[projet#servante]] qui existe
- un lien perdu : [[projet#introuvable]]
- un lien ambigu : [[projet#doublon]]

> Une citation, pour voir son filet.

![Un dégradé](assets/degrade.png)

:::callout{ico=💡 title="À savoir"}
Un encadré, avec un peu de texte dedans.
:::

:::figures{title="En chiffres" ico=📊}
- Avancement: 62 % — 8 lots sur 13
- Jalon: 12 oct. — dans 3 jours
:::

:::table
| Pièce | Quantité |
|---|---|
| Plaque | 2 |
| Tasseau | 14 |
:::

:::list{source=files type=pdf,image view=cards title="Fichiers" ico=📎}
:::

:::list{depth=children pull=status title="Sous-pages"}
:::

:::gallery
![Avant](assets/degrade.png)
![Après](assets/degrade.png)
:::

:::row
:::content{type=note title="À gauche" w=1/2}
Un premier bloc de la ligne.
:::
:::content{type=note title="À droite" w=1/2}
Un second.
:::
:::

:::inconnu
Un bloc que le vocabulaire ne connaît pas.
:::

:::content{type=note from=disparu title="D'un plugin absent"}
Ce bloc demande un plugin qui n'est pas là.
:::
`

async function pages(w, famille) {
  const p = (path, front, body) => put(w, `pages/${path}`, page(front, body))
  // The brief itself is a JSON file, the way the agent writes it.
  await put(w, 'pages/home/brief.json', JSON.stringify({
    generatedAt: '2026-10-14T07:30:00Z',
    items: [
      { ico: '✈️', title: 'Lisbonne dans 12 jours', reason: 'Le vol n’est pas encore réservé.', target: { type: 'page', path: 'voyages/lisbonne' } },
      { ico: '🔧', title: 'Étagère du salon', reason: 'Trois planches à débiter.', target: { type: 'projet', id: 'servante' } },
      { ico: '📅', title: 'Semaine du 12', reason: 'Quatre rendez-vous.', target: { type: 'section', path: 'voyages' } },
      { ico: '🧾', title: 'Impôts', reason: 'Date limite le 20.', target: { type: 'url', path: 'https://www.impots.gouv.fr' } },
    ],
  }, null, 2) + '\n')

  await p('voyages/INDEX.md', { title: 'Voyages', type: 'index', ico: '✈️' }, 'Les départs, passés et à venir.')
  await p('voyages/lisbonne.md', { title: 'Lisbonne, avril', type: 'voyage', status: 'en cours', tags: ['ville', 'avion'], domaine: 'loisirs', ico: '🇵🇹' }, 'Quatre jours, un appartement près d’Alfama.')
  await p('voyages/vercors.md', { title: 'Week-end Vercors', type: 'voyage', status: 'à décider', tags: ['montagne'] }, 'Deux nuits en gîte.')
  await p('voyages/italie.md', { title: 'Voyage Italie', type: 'voyage', status: 'en cours' }, 'Le même nom existe dans l’autre magasin.')
  await put(famille, 'voyages/italie.md', page({ title: 'Voyage Italie', type: 'voyage', status: 'réservé' }, 'La version du magasin partagé.'))
  await put(famille, 'voyages/baden.md', page({ title: 'Baden 2026', type: 'voyage', status: 'réservé' }, 'Réservé pour la famille.'))

  await p('maison/INDEX.md', { title: 'Maison', type: 'index' }, 'Ce qui se répare, se range, se planifie.')
  await p('maison/rangement.md', { title: 'Rangement du garage', type: 'projet', status: 'clos', id: 'rangement' }, 'Fini en juin.')
  await p('maison/travaux/INDEX.md', { title: 'Travaux', type: 'index', app: 'todo' }, 'Un `app:` écrit trop bas : le shell le signale, il ne le suit pas.')
  await p('maison/travaux/cuisine.md', { title: 'Cuisine', type: 'projet', status: 'en cours' }, 'Plan de travail à poser.')
  await p('maison/travaux/jardin.md', { title: 'Jardin', type: 'projet', status: 'à faire' }, 'Tailler la haie.')

  await p('blocs/tous-les-blocs.md', { title: 'Tous les blocs', type: 'fiche', id: 'blocs' }, CORE_BLOCKS)
  await put(w, 'pages/blocs/assets/degrade.png', PNG)
  await put(w, 'pages/blocs/assets/plan.pdf', '%PDF-1.4\n% bench\n')
  await p('blocs/doublon-a.md', { title: 'Doublon A', type: 'projet', id: 'doublon' }, 'Le même id que la page voisine.')
  await p('blocs/doublon-b.md', { title: 'Doublon B', type: 'projet', id: 'doublon' }, 'Le même id que la page voisine.')
  await p('blocs/servante.md', { title: 'Servante d’atelier', type: 'projet', id: 'servante', status: 'en cours', tags: ['etabli'] }, 'Un projet cible des liens.')
  // A vocabulary the product refuses to save: an error diagnostic makes the page read-only.
  await p('blocs/vocabulaire-casse.md', { title: 'Vocabulaire cassé', type: 'fiche' }, ':::table{w=beaucoup}\n| a | b |\n|---|---|\n| 1 | 2 |\n:::\n\n:::callout{ico=}\n:::\n\n:::figures\nnot a list\n:::')

  await p('proprietes/toutes.md', {
    title: 'Chaque genre de champ', type: 'projet', id: 'proprietes', ico: '🧪', couleur: 'violet', status: 'en cours',
    domaine: 'atelier', cat: 'menuiserie', tags: ['etabli', 'rangement'], date: '2026-10-12', inconnu: 'gardé tel quel',
  }, 'Un champ de chaque genre, et un champ que personne ne déclare.')
  // The product refuses to write this frontmatter, so it goes straight to disk.
  await put(w, 'pages/proprietes/illisible.md', '---\ntitle: [oups\ntype: : :\n  - mal\n---\n\nUn frontmatter que personne ne sait lire.\n')

  await p('pieces/dossier.md', { title: 'Dossier avec fichiers', type: 'projet', status: 'en cours' }, ':::list{source=files title="Pièces jointes"}\n:::')
  await put(w, 'pages/pieces/assets/photo.png', PNG)
  await put(w, 'pages/pieces/devis.pdf', '%PDF-1.4\n% devis\n')
  await put(w, 'pages/pieces/sources.zip', 'PK')

  await p('projets/INDEX.md', { title: 'Projets', type: 'collection', ico: '🗂', of: 'chantier', groupBy: 'cat', labels: 'menuiserie=Menuiserie, jardin=Jardin', into: 'projets/membres' }, 'Les chantiers, rangés par métier.')
  await p('projets/membres/etagere.md', { title: 'Étagère du salon', type: 'chantier', cat: 'menuiserie', status: 'en-cours' }, 'Chêne, trois planches.')
  await p('projets/membres/terrasse.md', { title: 'Terrasse', type: 'chantier', cat: 'menuiserie', status: 'clos' }, 'Posée en juin.')
  await p('projets/membres/haie.md', { title: 'Haie', type: 'chantier', cat: 'jardin', status: 'a-faire' }, 'À tailler.')
  await p('termines/INDEX.md', { title: 'Terminés', type: 'collection', ico: '✅', of: 'archive', into: 'termines/membres' }, 'Tout est fini ici.')
  await p('termines/membres/a.md', { title: 'Peinture', type: 'archive', status: 'clos' }, 'Fait.')
  await p('termines/membres/b.md', { title: 'Plomberie', type: 'archive', status: 'clos' }, 'Fait.')
}

async function mcp(dataDir, who) {
  const owner = userDirectory(who)
  await put(dataDir, 'mcp-servers.json', JSON.stringify({
    servers: [
      { name: 'meteo', url: 'http://127.0.0.1:9/mcp', headers: { Authorization: 'Bearer meteo-secret-value' } },
      { name: 'agenda', url: 'https://agenda.bench.invalid/mcp', identity: 'user', signIn: 'oauth' },
      { name: 'calendrier', url: 'https://calendrier.bench.invalid/mcp', identity: 'user', signIn: 'oauth' },
      { name: 'recherche', url: 'https://recherche.bench.invalid/mcp' },
      { name: 'archives', command: 'node', args: ['archives.js'], env: { ARCHIVE_KEY: 'archive-secret-value' } },
      // The config file already declares this name: this one is shadowed.
      { name: 'fichiers', command: 'node', args: ['autre.js'] },
    ],
  }, null, 2) + '\n', 0o600)
  await put(dataDir, 'mcp-signin.json', JSON.stringify({
    registrations: {
      calendrier: {
        clientId: 'bench-client', authorizationEndpoint: 'https://calendrier.bench.invalid/authorize',
        tokenEndpoint: 'https://calendrier.bench.invalid/token', redirectUri: 'http://127.0.0.1/api/mcp/signin/callback',
      },
    },
    keys: { [`user|calendrier|${owner}`]: 'bench-refresh-key' },
  }, null, 2) + '\n', 0o600)
}

async function instructions(w, base, dataDir) {
  await put(w, 'CLAUDE.md', '# Consignes\n\nRépondre en français, court.\n')
  await put(w, '.claude/skills/pain/SKILL.md', '---\nname: pain\ndescription: Faire le pain du dimanche.\n---\n\nFarine, eau, sel, patience.\n')
  await put(w, '.claude/agents/relecteur.md', '---\nname: relecteur\ndescription: Relit un texte avant envoi.\n---\n\nRelire sans réécrire.\n')

  const catalogues = join(base, 'catalogues')
  await gitRepo(join(catalogues, 'outils'), {
    'CLAUDE.md': '---\nname: consignes-outils\ndescription: Les consignes de la boîte à outils.\n---\n\nRanger après usage.\n',
    'skills/soudure/SKILL.md': '---\nname: soudure\ndescription: Souder proprement un fil.\n---\n\nChauffer le fil, pas l’étain.\n',
    'skills/perçage/SKILL.md': '---\nname: percage\ndescription: Percer droit.\n---\n\nMarquer, pointer, percer.\n',
    'agents/menuisier.agent.md': '---\nname: menuisier\ndescription: Conseille sur un assemblage.\n---\n\nChoisir l’assemblage avant la coupe.\n',
  })
  await gitRepo(join(catalogues, 'vide'), { 'README.md': '# Rien à importer ici\n' })
  await put(dataDir, 'instruction-catalogues.json', JSON.stringify({
    catalogues: [
      { id: 'outils', repo: `file://${join(catalogues, 'outils')}`, ref: 'main', imports: [] },
      { id: 'vide', repo: `file://${join(catalogues, 'vide')}`, ref: 'main', imports: [] },
      { id: 'injoignable', repo: `file://${join(catalogues, 'absent')}`, ref: 'main', imports: [] },
    ],
  }, null, 2) + '\n', 0o600)
}

async function threads(dataDir, who) {
  const me = userDirectory(who)
  const c = (key, fields) => conversation(dataDir, me, { id: CONVERSATIONS[key], ...fields })
  await c('running', {
    title: 'Conversation en cours', updatedAt: at(14, 1),
    messages: [said('user', 'Peux-tu préparer le devis ?', { at: at(14, 0) }), said('agent', 'Je commence par relire les travaux.', { at: at(14, 1) })],
  })
  await c('unread', {
    title: 'Réponse non lue', updatedAt: at(15, 3),
    messages: [said('user', 'Quel temps à Lisbonne ?', { at: at(15, 2) }), said('agent', 'Entre 17 et 21 degrés, plutôt sec.', { at: at(15, 3), usage: { contextTokens: 6200 } })],
  })
  await c('idle', {
    title: 'Au repos', updatedAt: at(10, 4),
    messages: [said('user', 'Merci pour hier.', { at: at(10, 3) }), said('agent', 'Avec plaisir.', { at: at(10, 4), usage: { contextTokens: 2100 } })],
  })
  await c('archived', {
    title: 'Archivée', archived: true, updatedAt: at(2, 5),
    messages: [said('user', 'Ancienne idée.', { at: at(2, 4) }), said('agent', 'Notée.', { at: at(2, 5) })],
  })
  await c('long', {
    title: 'Longue', updatedAt: at(13, 6),
    messages: Array.from({ length: 24 }, (_, i) =>
      i % 2 === 0
        ? said('user', `Question ${i / 2 + 1} sur le chantier.`, { at: at(13, 6) })
        : said('agent', `Réponse ${(i + 1) / 2}, détaillée, avec ce qu’il faut savoir avant de continuer.`, { at: at(13, 6), ...(i === 23 ? { usage: { contextTokens: 150_000, outputTokens: 800 } } : {}) })),
  })
  await c('warn', {
    title: 'Contexte moyen', updatedAt: at(12, 7),
    messages: [said('user', 'Reprends le dossier.', { at: at(12, 7) }), said('agent', 'Dossier repris.', { at: at(12, 7), usage: { contextTokens: 75_000 } })],
  })
  // One thread with every state of a bubble the store can keep.
  await c('rich', {
    title: 'Fil riche', updatedAt: at(11, 8),
    messages: [
      said('user', 'Fais le tour des pages.', { at: at(11, 8) }),
      said('agent', 'J’ai lu deux pages, la troisième a échoué.', {
        at: at(11, 8), turn: 'turn-a',
        tools: [{ name: 'Read', target: 'pages/voyages/lisbonne.md', ok: true }, { name: 'Bash', target: 'grep -r vol pages', ok: false }, { name: 'Glob', target: 'pages/**/*.md' }],
      }),
      said('user', 'Continue.', { at: at(11, 9) }),
      said('agent', 'Je m’arrête ici.', { at: at(11, 9), turn: 'turn-b', stopped: true }),
      said('user', 'Relance.', { at: at(11, 9) }),
      said('agent', '', { at: at(11, 9), turn: 'turn-c', error: 'The engine stopped: rate limit reached.' }),
      said('user', 'Réserve le rendez-vous.', { at: at(11, 9) }),
      said('agent', 'Deux signatures attendent.', {
        at: at(11, 9), turn: 'turn-d',
        signatures: [
          { id: 'consent-pending', kind: 'consent', url: `${SIGNATURE_ORIGIN}/consent/consent-pending`, expiresAt: '2099-01-01T10:00:00Z' },
          { id: 'grant-expired', kind: 'grant', url: `${SIGNATURE_ORIGIN}/grant/grant-expired`, expiresAt: '2020-01-01T10:00:00Z' },
        ],
      }),
      said('user', 'Et le reste ?', { at: at(11, 9), after: 'turn-d' }),
    ],
  })
}

async function delegations(dataDir) {
  const root = join(dataDir, 'delegations')
  const d = (caller, id, title, messages) =>
    conversation(root, caller, { id, title, updatedAt: messages.at(-1).at, messages })
  await d('gaston', '10000000-0000-4000-8000-000000000001', 'Résume le devis de la cuisine', [
    said('user', 'Résume le devis de la cuisine', { at: at(13, 10) }), said('agent', 'Le devis de la cuisine monte à 4 200 €, pose comprise.', { at: at(13, 11) }),
  ])
  await d('gaston', '10000000-0000-4000-8000-000000000002', 'Réserve un créneau chez le plombier', [
    said('user', 'Réserve un créneau chez le plombier', { at: at(13, 12) }), said('agent', '', { at: at(13, 13), error: 'The engine stopped: the calendar server refused the write.' }),
  ])
  await d('courrier', '10000000-0000-4000-8000-000000000003', 'Trie les messages de la semaine', [
    said('user', 'Trie les messages de la semaine', { at: at(12, 14) }), said('agent', 'Quatorze messages triés, deux demandent une réponse.', { at: at(12, 15) }),
  ])
}

/** Writes every file the populated instance holds, for the person `owner` (`local` when ungated). */
export async function populate({ workspace, dataDir, base }, owner = 'local') {
  const famille = join(base, 'famille')
  await plugins(join(base, 'seed-plugins'))
  await pages(workspace, famille)
  await mcp(dataDir, owner)
  await instructions(workspace, base, dataDir)
  await threads(dataDir, owner)
  await delegations(dataDir)
}

/** The credential file the product reads at boot (`secrets/claude-code.token`). */
export const storeToken = (dataDir) => put(dataDir, 'secrets/claude-code.token', `${BENCH_TOKEN}\n`, 0o600)

/** The instance configuration of a populated seed. `extra` is appended as YAML. */
export function configFor({ base }, extra = '') {
  return `name: Adestia bench
auth:
  mode: none
workspace:
  stores:
    - id: perso
      path: pages
      label: Perso
      default: true
    - id: famille
      path: ${join(base, 'famille')}
      label: Famille
      hue: violet
extensions:
  pluginsDir: ${join(base, 'seed-plugins')}
  tools: [bench-notes, bench-degraded]
signatures:
  origins: ["${SIGNATURE_ORIGIN}"]
  embed: true
mcp:
  enabled: true
  token: ${MCP_TOKEN}
  agentName: alfred
  servers:
    - name: fichiers
      command: node
      args: [fichiers.js]
${extra}`
}

const rpc = (url, body, headers = {}) =>
  fetch(`${url}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${MCP_TOKEN}`, ...headers },
    body: JSON.stringify(body),
  })

/**
 * Once the instance listens: the two turns that must be running (a chat turn
 * and a delegated one — both held open by the script « en cours » until
 * somebody stops them) and the one import the product stamps itself.
 */
export async function ready({ url }) {
  const post = (path, body, headers = {}) =>
    fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

  const turn = await post('/api/turn', { prompt: 'en cours', conversationId: CONVERSATIONS.running })
  // The turn belongs to the desk, not to this request: reading its first frame is enough.
  const reader = turn.body?.getReader()
  await reader?.read()
  await reader?.cancel().catch(() => undefined)

  await rpc(url, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ask_alfred', arguments: { prompt: 'en cours', notify: false } } }, { 'x-adestia-caller': 'courrier' })

  const item = encodeURI('skills/soudure')
  await fetch(`${url}/api/instruction-catalogues/outils/items/${item}`, { method: 'PUT' })
}
