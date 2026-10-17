/**
 * What the `plugins` seed writes: the data each bundled plugin draws, in the
 * shape its own contract describes (`plugins/<id>/skills/*`) and nowhere else —
 * pages through the page grammar, JSON files beside the page that cites them,
 * the listening post's queue in the data directory. Dates that a screen
 * computes against the clock (Late, Today, Next 7 days) are relative to the
 * day the seed runs; the dates of a trip or a planning are fixed.
 */
import { execFileSync } from 'node:child_process'
import { access, copyFile, mkdir, readdir, symlink } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PNG, page, put } from './_lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
export const repoRoot = join(here, '..', '..')

/** The ten bundled plugins, by the list of `extensions` that activates each. */
export const APPS = ['todo', 'planif', 'journal', 'atelier', 'voyages', 'listening-post', 'bench-noview']
export const FEATURES = ['scan', 'parcours', 'meals', 'project-management']

/** A day, `offset` days from today, as the YYYY-MM-DD the pages write. */
export const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

/**
 * The plugins directory of the instance: one link per bundled plugin, so the
 * product reads the very sources beside the seed. A link, not a copy — the
 * bench shows the plugins as they are on this branch.
 */
export async function pluginsDirectory(base) {
  const dir = join(base, 'seed-plugins')
  await mkdir(dir, { recursive: true })
  for (const entry of await readdir(join(repoRoot, 'plugins'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    try {
      await access(join(repoRoot, 'plugins', entry.name, 'adestia-plugin.json'))
    } catch {
      continue // `plugins/test` is a folder of tests, not a plugin
    }
    await symlink(join(repoRoot, 'plugins', entry.name), join(dir, entry.name), 'dir')
  }
  // E-20: an app with a tile that draws nothing of its own. Its route, `#/bench-noview`,
  // is the route of a plugin that is loaded and has no view.
  await put(dir, 'bench-noview/adestia-plugin.json', JSON.stringify({
    schemaVersion: 1,
    id: 'bench-noview',
    kind: 'app',
    description: 'Loaded, with a tile, and no view: the screen E-20 shows.',
    contract: 1,
    blocks: './blocks.js',
    vocabulary: { 'bench-noview': { content: 'empty', description: 'A block that draws nothing, so the plugin loads without a view.' } },
    tile: { label: 'Sans vue', icon: '🫥', hue: 'gris' },
  }, null, 2) + '\n')
  await put(dir, 'bench-noview/blocks.js', 'export default function create() {\n  return { tags: { \'bench-noview\': () => null } }\n}\n')
  return dir
}

// ── todo ────────────────────────────────────────────────────────────────────
async function todo(w) {
  const p = (path, front, body) => put(w, `pages/${path}`, page(front, body))
  await p('taches/poncer-porte.md', { type: 'tache', title: 'Poncer la porte du garage', due: day(-3), assignee: 'antoine', pri: 2, dom: 'atelier' },
    'Grain 120 puis 240. Vérifier les gonds avant de reposer.\n\nPenser à la cale en liège.')
  await p('taches/appeler-plombier.md', { type: 'tache', title: 'Appeler le plombier', due: day(0), assignee: 'celine', pri: 1, dom: 'maison' }, '')
  await p('taches/commander-vis.md', { type: 'tache', title: 'Commander les vis inox', due: day(3), assignee: 'antoine', dom: 'atelier' }, '')
  await p('taches/declaration.md', { type: 'tache', title: 'Déclaration de revenus', due: day(6), dom: 'admin' }, 'Personne ne l’a prise.')
  await p('taches/tailler-haie.md', { type: 'tache', title: 'Tailler la haie', start: day(30), dom: 'maison' }, 'Pas avant le printemps.')
  await p('taches/reviser-velo.md', { type: 'tache', title: 'Réviser le vélo', done: day(-2), assignee: 'celine', dom: 'maison' }, '')
  await p('taches/ranger-garage.md', { type: 'tache', title: 'Ranger le garage', done: day(-9), assignee: 'antoine', dom: 'atelier' }, '')
  await p('taches/listes/aujourdhui.md', { type: 'liste', title: 'Aujourd’hui', ico: '📌', refs: ['taches/appeler-plombier', 'taches/poncer-porte'] }, '')
  await p('taches/listes/atelier.md', { type: 'liste', title: 'Atelier', ico: '🪚', dom: 'atelier', refs: ['taches/poncer-porte', 'taches/commander-vis', 'taches/ranger-garage'] }, '')
  // A page that carries its own checklist (`:::checklist`).
  await p('chantier-cuisine.md', { title: 'Chantier cuisine', type: 'projet', id: 'cuisine' },
    'Les tâches de la maison, cochées ici comme dans la liste :\n\n:::checklist{page=taches show=all}\n:::')
}

// ── planif ──────────────────────────────────────────────────────────────────
async function planif(w, dataDir) {
  const n = (id, front, body) => put(w, `planif/${id}.md`, page(front, body))
  await n('bilan-matin', { title: 'Bilan du matin', at: '"07:30, 12:30"' }, 'Résume les rendez-vous du jour et les tâches en retard.')
  await n('veille-toutes-les-heures', { title: 'Veille des flux', every: '2h' }, 'Passe les flux de la veille en revue et dis ce qui est neuf.')
  await n('sauvegarde-nuit', { title: 'Sauvegarde de la nuit', every: '1d', enabled: 'false' }, 'Vérifie que la sauvegarde de cette nuit a bien eu lieu.')
  await n('mission-voyage', { title: 'Mission : réserver le vol', every: '1d', until: '2026-12-01' }, 'Cherche un vol Lisbonne et préviens-moi sous 200 €.')
  // Invalid on purpose: each one says why the clock refuses it.
  await n('deux-cadences', { title: 'Deux cadences', every: '1h', at: '"06:00"' }, 'Cette note porte every et at.')
  await n('trop-vite', { title: 'Trop rapide', every: '5m' }, 'En dessous du plancher de quinze minutes.')
  await n('sans-corps', { title: 'Note vide', every: '1d' }, '')
  await put(dataDir, 'schedule-state.json', JSON.stringify({
    lastRun: {
      'bilan-matin': Date.now() - 6 * 3_600_000,
      'veille-toutes-les-heures': Date.now() - 50 * 60_000,
    },
  }, null, 2) + '\n')
}

// ── journal ─────────────────────────────────────────────────────────────────
async function journal(w) {
  const p = (path, front, body) => put(w, `pages/journal/${path}`, page(front, body))
  await p('atelier/INDEX.md', { title: 'Carnet d’atelier', type: 'journal', ico: '🪚' }, 'Ce qui se passe à l’établi, au fil des séances.')
  await p('atelier/2026-10-14-1430.md', { type: 'entree', date: '2026-10-14T14:30', title: 'Réglage du guide de refente' },
    'Le guide dérivait de 0.3 mm sur la longueur. Retouché avec la cale de 123.')
  await p('atelier/2026-10-12-0910.md', { type: 'entree', date: '2026-10-12T09:10' }, 'Découpe des côtés du caisson, rien à signaler.')
  await p('atelier/2026-10-09.md', { type: 'entree', date: '2026-10-09' }, 'Journée à poncer. Les doigts s’en souviennent.')
  await p('jardin/INDEX.md', { title: 'Carnet du jardin', type: 'journal', ico: '🌱' }, 'Semis, récoltes, météo.')
  await p('jardin/2026-10-10.md', { type: 'entree', date: '2026-10-10' }, 'Dernières tomates, arrachage des pieds.')
  // A journal with a cover and no entry.
  await p('voyage-vide/INDEX.md', { title: 'Carnet de route', type: 'journal', ico: '🧭' }, 'Rien d’écrit encore.')
}

// ── atelier ─────────────────────────────────────────────────────────────────
async function atelier(w) {
  const dir = join(w, 'pages/projets/caisson/assets')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'workbook.json')
  await copyFile(join(repoRoot, 'plugins/atelier/exemples/meuble-tiroirs.workbook.json'), file)
  // The example is a 4.0 design; the pieces and the cutting plan are derived by the plugin's own tool.
  execFileSync(process.execPath, [join(repoRoot, 'plugins/atelier/tools/atelier.mjs'), 'derive', file, '--regles', join(repoRoot, 'plugins/atelier/exemples/regles'), '--ecrit'], { stdio: 'ignore' })
  await put(w, 'pages/projets/caisson/INDEX.md', page({ title: 'Caisson à tiroirs', type: 'projet', id: 'caisson', status: 'en cours', ico: '🗄️' },
    'Le meuble du bureau. Son plan de coupe est dans `assets/workbook.json`.'))
  // The bench's progress on it, kept beside the file, outside the memory's git.
  await put(w, 'pages/projets/caisson/assets/workbook-state.json', JSON.stringify({ fait: { 'IMP-C1-BAS': '2026-10-13T16:00:00Z' } }, null, 2) + '\n')
}

// ── voyages ─────────────────────────────────────────────────────────────────
async function voyages(w) {
  const trip = (folder, data) => put(w, `pages/voyages/${folder}/assets/voyage.json`, JSON.stringify(data, null, 2) + '\n')
  await put(w, 'pages/voyages/corse/INDEX.md', page({ title: 'Corse, novembre', type: 'voyage', status: 'prépa', ico: '🏝️' }, 'Une semaine entre Calvi et Bonifacio.'))
  await put(w, 'pages/voyages/corse/citadelle-calvi.md', page({ title: 'La citadelle de Calvi', type: 'fiche' }, 'Trois kilomètres, une heure, tout en haut.'))
  await put(w, 'pages/voyages/corse/assets/embarquement.pdf', '%PDF-1.4\n% embarquement\n')
  await trip('corse', {
    version: 1,
    titre: 'Corse, novembre',
    status: 'prépa',
    debut: '2026-11-07',
    fin: '2026-11-14',
    modes: ['marche', 'voiture'],
    lieux: [
      { id: 'calvi', nom: 'Calvi', lat: 42.567, lng: 8.757, arrivee: '2026-11-07', depart: '2026-11-11' },
      { id: 'bonifacio', nom: 'Bonifacio', lat: 41.387, lng: 9.159, arrivee: '2026-11-11', depart: '2026-11-14' },
    ],
    items: [
      { id: 'hotel-calvi', type: 'hebergement', statut: 'confirme', titre: 'Hôtel U Carabellu', debut: '2026-11-07', fin: '2026-11-11', lieu: 'calvi', notes: 'petit-déj inclus' },
      { id: 'ferry-aller', type: 'trajet', statut: 'confirme', titre: 'Ferry Toulon → L’Île-Rousse', jour: '2026-11-07', heure: '08:00', duree: '5 h 45', ico: '⛴',
        docs: [{ fichier: 'assets/embarquement.pdf', titre: 'Cartes d’embarquement' }] },
      { id: 'resto-bastia', type: 'resto', statut: 'confirme', titre: 'Dîner à la Citadelle', jour: '2026-11-08', heure: '20:00', ordre: 1, lieu: 'calvi' },
      { id: 'resto-anna', type: 'resto', statut: 'suggestion', titre: 'Chez Anna', creneau: 'soir', lieu: 'calvi', prix: '~60 €',
        hint: 'Terrasse sous les remparts', desc: 'Terrasse sous les remparts, cuisine corse simple — réserver dès 19 h.' },
      { id: 'boucle-calvi', type: 'activite', statut: 'suggestion', titre: 'La citadelle à pied', creneau: 'matin', lieu: 'calvi',
        hint: '3 km, une heure, tout en haut', fiche: 'citadelle-calvi.md' },
      { id: 'plongee', type: 'activite', statut: 'suggestion', titre: 'Baptême de plongée', creneau: 'apres-midi', lieu: 'bonifacio', web: 'https://example.invalid/plongee' },
      { id: 'croisiere', type: 'visite', statut: 'ecartee', titre: 'Croisière aux îles Lavezzi', lieu: 'bonifacio', hint: 'Trop cher pour ce qu’on en voit' },
    ],
  })
  // An idea: no dates, so the tray alone — and nothing can be confirmed.
  await put(w, 'pages/voyages/madere/INDEX.md', page({ title: 'Madère, un jour', type: 'voyage', status: 'idée' }, 'Pas de dates encore.'))
  await trip('madere', {
    version: 1, titre: 'Madère, un jour', status: 'idée',
    items: [
      { id: 'levadas', type: 'activite', statut: 'suggestion', titre: 'Les levadas du nord', hint: 'Marche au bord de l’eau' },
      { id: 'vin', type: 'visite', statut: 'suggestion', titre: 'Cave de Funchal' },
    ],
  })
  // A trip with every item written off: the tray is empty and the dismissed list is not.
  await put(w, 'pages/voyages/porto/INDEX.md', page({ title: 'Porto, annulé', type: 'voyage', status: 'clos' }, 'Annulé en septembre.'))
  await trip('porto', {
    version: 1, titre: 'Porto, annulé', status: 'clos', debut: '2026-09-18', fin: '2026-09-20',
    items: [{ id: 'cave', type: 'visite', statut: 'ecartee', titre: 'Cave de porto'}],
  })
}

// ── listening post ──────────────────────────────────────────────────────────
const ytid = (n) => `bench${String(n).padStart(7, '0')}`

/** A feed the seed serves itself: the queue is real, and nothing leaves the machine. */
export async function startFeeds(onClose) {
  const items = [
    [1, 'Pourquoi un filtre passe-bas colore le son', 2, '18:42'],
    [2, 'Construire un séquenceur en une soirée', 5, '42:10'],
    [3, 'Les erreurs classiques du débutant en soudure', 9, '11:05'],
  ]
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>Underscore_</title>${items
    .map(([n, title, ago]) => `<entry><id>yt:video:${ytid(n)}</id><title>${title}</title><link rel="alternate" href="https://www.youtube.com/watch?v=${ytid(n)}"/><published>${day(-ago)}T08:00:00Z</published><media:group><media:description>${title}, expliqué calmement.</media:description></media:group></entry>`)
    .join('')}</feed>`
  const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Technology Podcast</title>${[
    ['Migrer sans arrêter le service', 3, '51:20'],
    ['Ce que l’on doit à l’architecture hexagonale', 8, '47:02'],
  ]
    .map(([title, ago, length], i) => `<item><title>${title}</title><link>https://podcast.bench.invalid/ep${i + 1}</link><pubDate>${new Date(Date.now() - ago * 86_400_000).toUTCString()}</pubDate><itunes:duration>${length}</itunes:duration><enclosure url="https://podcast.bench.invalid/ep${i + 1}.mp3" type="audio/mpeg"/></item>`)
    .join('')}</channel></rss>`
  const server = createServer((request, response) => {
    const body = request.url?.startsWith('/podcast') ? rss : request.url?.startsWith('/atom') ? atom : undefined
    response.writeHead(body ? 200 : 404, { 'content-type': 'application/xml' })
    response.end(body ?? '')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  onClose(() => new Promise((resolve) => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

async function veille(w, dataDir, feeds) {
  await put(w, 'pages/veille/assets/veille.json', JSON.stringify({
    version: 1,
    sources: [
      { id: 'underscore', titre: 'Underscore_', media: 'video', flux: `${feeds}/atom`, tags: ['tech'], pourquoi: 'veille tech FR, format long' },
      { id: 'thoughtworks', titre: 'Technology Podcast', media: 'audio', flux: `${feeds}/podcast`, tags: ['archi'] },
      // Nobody listens on port 9: this source reports its failure instead of its entries.
      { id: 'muet', titre: 'Une chaîne qui ne répond pas', media: 'video', flux: 'http://127.0.0.1:9/feed.xml' },
    ],
  }, null, 2) + '\n')
  const kept = (slug, front, body, transcript) =>
    Promise.all([
      put(w, `pages/veille/${slug}.md`, page(front, body)),
      put(w, `pages/veille/assets/${slug}.transcript.txt`, transcript),
    ])
  await kept('moteur-audio', {
    title: 'Le moteur audio d’un synthé modulaire, expliqué', type: 'ecoute', media: 'video', url: 'https://www.youtube.com/watch?v=benchkept001',
    source: 'Underscore_', publie: day(-14), duree: '"18:42"', status: '"à voir"', tags: ['audio', 'synthese'], ico: '🎬',
  }, '**Pourquoi ça vaut le coup** — le filtre y est expliqué avec les mains.\n\n## Les passages qui valent le détour\n\n- [00:04:12](https://www.youtube.com/watch?v=benchkept001&t=252s) — le filtre passe-bas',
  '[00:04:12] Le filtre passe-bas n’est pas là pour couper, il est là pour donner une couleur.\n[00:04:31] Et c’est exactement ce que fait la résonance quand on la pousse trop loin.\n[00:11:38] Le moteur audio, lui, ne fait que sommer les oscillateurs.\n')
  await kept('hexagonal', {
    title: 'Architecture hexagonale, dix ans après', type: 'ecoute', media: 'audio', url: 'https://podcast.bench.invalid/kept-ep',
    source: 'Technology Podcast', publie: day(-20), duree: '"47:02"', status: 'fait', tags: ['archi'], ico: '🎧',
  }, 'Vu en entier, retenu : les ports sont des décisions.',
  '[00:02:05] Un port est une décision que l’on prend une fois et que l’on documente.\n[00:09:40] Le filtre de requêtes, c’est le vrai sujet du moteur audio de la maison.\n')
  // The queue's own state: a pasted link and a candidate waved away.
  await put(dataDir, 'listening-post/queue.json', JSON.stringify({
    version: 1,
    dropped: {
      'url:benchdrop0001': { url: 'https://blog.bench.invalid/billet', titre: 'Un billet collé à la main', source: 'blog.bench.invalid', media: 'video', note: 'à regarder ce week-end', ts: `${day(-1)}T10:00:00Z` },
    },
    dismissed: { [`yt:${ytid(3)}`]: { ts: `${day(-1)}T11:00:00Z`, titre: 'Les erreurs classiques du débutant en soudure' } },
  }, null, 1))
}

// ── parcours ────────────────────────────────────────────────────────────────
/** Encoded polyline values (precision `factor`, `dims` interleaved) — what the plugin's `decode` reads. */
function encode(values, factor, dims) {
  const previous = new Array(dims).fill(0)
  let out = ''
  for (const [index, value] of values.entries()) {
    const d = index % dims
    const scaled = Math.round(value * factor)
    let delta = scaled - previous[d]
    previous[d] = scaled
    delta = delta < 0 ? ~(delta << 1) : delta << 1
    while (delta >= 0x20) {
      out += String.fromCharCode((0x20 | (delta & 0x1f)) + 63)
      delta >>= 5
    }
    out += String.fromCharCode(delta + 63)
  }
  return out
}

async function parcours(w) {
  // A loop of 60 points around the start, with a hill on one side.
  const centre = [48.002, -2.256]
  const points = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 59) * 2 * Math.PI
    return [centre[0] + 0.006 * Math.sin(a), centre[1] + 0.009 * (Math.cos(a) - 1)]
  })
  const altitudes = points.map((_, i) => Math.round(150 + 45 * Math.sin((i / 59) * Math.PI)))
  const at = (i) => `${points[i][0].toFixed(5)},${points[i][1].toFixed(5)}`
  const reperes = [
    { nom: 'Le gîte', latlng: at(0), desc: 'Départ et arrivée.', ecart_trace_m: 4, distance_precedent_m: 0 },
    { nom: 'L’Hotié de Viviane', latlng: at(15), desc: 'Le coffre mégalithique posé sur la crête. Point haut de la boucle.', note: 'Landes découvertes, plein soleil.', picto: '🪨', couleur: 'ambre', ecart_trace_m: 12, distance_precedent_m: 2100,
      sources: { osm: { id: 'way/123', historic: 'megalith', releve: '2026-08-05' } } },
    { nom: 'Fontaine de Barenton', latlng: at(38), desc: 'On y passe deux fois.', picto: '💧', couleur: 'bleu', ecart_trace_m: 95, distance_precedent_m: 2300 },
    { nom: 'Retour au gîte', latlng: at(59), desc: 'Fin de la boucle.', ecart_trace_m: 6, distance_precedent_m: 1900 },
  ]
  await put(w, 'pages/balades/assets/val-sans-retour.parcours.json', JSON.stringify({
    version: 1,
    titre: 'Le Val sans Retour — boucle depuis le gîte',
    regime: 'rando', profil: 'rando', depart: 'Gîte de la Guette, Paimpont',
    desc: 'Boucle au départ du gîte, sans voiture.',
    reperes,
    trace: {
      moteur: 'BRouter / OpenStreetMap (profil hiking-beta)', altimetrie: 'IGN RGE ALTI', calcule_le: '2026-08-09',
      distance_m: 6384, denivele_pos_m: 196, denivele_neg_m: 196, duree_s: 4769, points_trace: points.length, escaliers_m: 0,
      revetement_m: { terre: 3760, asphalte: 726, rocher: 358 }, voies_m: { sentier: 5064, 'petite route': 796, piste: 524 },
      geometrie: encode(points.flat(), 1e5, 2),
      altitudes: encode(altitudes, 1, 1),
    },
  }, null, 2) + '\n')
  await put(w, 'pages/balades/val-sans-retour.md', page({ title: 'Le Val sans Retour', type: 'fiche', ico: '🥾' },
    'Une boucle de quelques heures.\n\n:::parcours{source="assets/val-sans-retour.parcours.json"}\n:::'))
  await put(w, 'pages/balades/week-end.md', page({ title: 'Week-end en Brocéliande', type: 'fiche' },
    'La balade n’est qu’un des plans du week-end :\n\n:::parcours{source="assets/val-sans-retour.parcours.json" vue="lien"}\n:::'))
}

// ── meals ───────────────────────────────────────────────────────────────────
async function meals(w) {
  await put(w, 'pages/sante/septembre.md', page({
    title: 'Semaine type — octobre', type: 'meals', ico: '🥗', debut: '2026-10-12', fin: '2026-10-18', sections: ['matin', 'midi', 'goûter', 'soir'],
  }, 'Une semaine de menus décidés, avec un tray d’idées.'))
  await put(w, 'pages/sante/assets/septembre.meals.json', JSON.stringify({
    version: 1,
    items: [
      { id: 'porridge', titre: 'Porridge pommes-cannelle', ico: '🥣', statut: 'confirme', jour: '2026-10-12', section: 'matin', ordre: 1, quantite: 'pour 2' },
      { id: 'burrata', titre: 'Pâtes à la burrata', ico: '🍝', statut: 'confirme', jour: '2026-10-12', section: 'soir', ordre: 1, quantite: 'pour 4',
        desc: 'Le classique. Tomates confites la veille si on y pense.', props: { pâtes: '500 g', burrata: '2 boules' } },
      { id: 'soupe', titre: 'Soupe de potimarron', ico: '🎃', statut: 'confirme', jour: '2026-10-13', section: 'midi', ordre: 1, quantite: '1 l',
        props: { énergie: '72 kcal', protéines: '4,1 g', sel: '0,06 g' }, source: 'cab:3033610060529' },
      { id: 'salade', titre: 'Salade de lentilles', ico: '🥗', statut: 'suggestion', hint: 'Prête la veille' },
      { id: 'curry', titre: 'Curry de pois chiches', ico: '🍛', statut: 'suggestion', hint: 'Une heure', desc: 'Un plat qui se réchauffe bien.' },
      { id: 'sushi', titre: 'Sushis maison', statut: 'ecartee', hint: 'Trop long un soir de semaine' },
    ],
  }, null, 1))
  // A period framed with no dates yet: a tray of ideas, no frise.
  await put(w, 'pages/sante/idees.md', page({ title: 'Idées de repas', type: 'meals', ico: '💡' }, 'Rien de calé.'))
}

// ── project-management ──────────────────────────────────────────────────────
async function projectManagement(w) {
  const p = (path, front, body) => put(w, `pages/${path}`, page(front, body))
  await p('renovation/INDEX.md', { title: 'Rénovation de la maison', type: 'project-management', app: 'project-management', ico: '🏗️', 'project-status': 'Amber' },
    ':::subproject\n:::\n\n:::timeline{depth=subtree}\n:::\n\n:::timeline{frame=card title="Jalons écrits" ico=🗓️}\n- Cadrage: 2026-09-01 → 2026-09-20\n- Réalisation: 2026-09-20 → 2026-12-15\n- Réception: 2026-12-20\n:::')
  await p('renovation/cuisine/INDEX.md', { title: 'Cuisine', type: 'project-management', start: '2026-09-20', due: '2026-11-10', status: '"en cours"', 'project-status': 'Green' }, 'Plan de travail et crédence.')
  await p('renovation/salle-de-bain/INDEX.md', { title: 'Salle de bain', type: 'project-management', start: '2026-11-02', due: '2026-12-12', status: '"en cours"', 'project-status': 'Red' }, 'Le carrelage est en retard.')
  await p('renovation/toiture.md', { title: 'Toiture', type: 'project-management', start: '2026-07-01', due: '2026-08-31', status: 'clos' }, 'Terminée en août.')
  await p('renovation/etat-des-lieux.md', { title: 'État des lieux', type: 'fiche', due: '2026-09-05' }, 'Un jalon : une seule date.')
  await p('renovation/dates-cassees.md', { title: 'Dates à l’envers', type: 'fiche', start: '2026-12-01', due: '2026-10-01' }, 'Nommée sous le graphique, pas devinée.')
  // The empty states: a timeline over a folder with no dated page, a status block with no sub-project.
  await p('petit-chantier/INDEX.md', { title: 'Petit chantier', type: 'project-management', app: 'project-management' },
    ':::subproject\n:::\n\n:::timeline{depth=children}\n:::')
  await p('petit-chantier/notes.md', { title: 'Notes', type: 'fiche' }, 'Aucune date ici.')
}

/** The camera of the scan feature belongs to the browser, so the seed only needs the feature on and an image to show. */
async function scan(w) {
  await put(w, 'pages/courses/assets/ticket.png', PNG)
  await put(w, 'pages/courses/liste.md', page({ title: 'Liste de courses', type: 'fiche', ico: '🛒' }, '- farine\n- œufs\n\n![Le dernier ticket](assets/ticket.png)'))
}

export async function writePluginData({ workspace, dataDir, feeds }) {
  await todo(workspace)
  await planif(workspace, dataDir)
  await journal(workspace)
  await atelier(workspace)
  await voyages(workspace)
  await veille(workspace, dataDir, feeds)
  await parcours(workspace)
  await meals(workspace)
  await projectManagement(workspace)
  await scan(workspace)
}
