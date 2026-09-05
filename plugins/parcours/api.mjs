/**
 * Parcours — le GPX assemblé à la demande, jamais stocké.
 *
 * Un parcours vit dans `…/assets/<nom>.parcours.json`, frère de `voyage.json`,
 * et porte deux matières que rien ne doit mélanger :
 *
 * - `reperes[]` : la prose de l'agent — nom, description, note de contexte,
 *   lien, et les sources tierces (Google, OSM) datées, gardées séparées de sa
 *   parole. Elles se corrigent à la main, sans rien recalculer ;
 * - `trace` : la géométrie encodée et ses chiffres, écrits par un routeur et
 *   par lui seul. Une trace de 3 km fait 328 points ; recopiés par un modèle,
 *   un caractère perdu décale toute la fin du parcours.
 *
 * Le `.gpx`, lui, n'est PAS un fichier de la mémoire : c'est un dérivé, monté
 * ici à chaque téléchargement. Deux raisons, dans cet ordre. Ce qui se commite
 * doit être le fait — les repères rédigés et la géométrie mesurée — pas son
 * rendu ; et un GPX figé se désynchronise de la fiche à la première correction
 * de description.
 *
 * Rien n'est écrit ici : ce module lit l'espace de travail et rend un fichier.
 * La seule entrée est un chemin, et un chemin qui arrive par une chaîne de
 * requête est une entrée utilisateur d'où qu'il ait l'air de venir.
 */

import { readFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

const SUFFIXE = '.parcours.json'

/**
 * Valide le NOM d'un parcours, sans toucher au disque.
 *
 * Le suffixe est vérifié, pas seulement la forme : cette route ne doit pouvoir
 * servir qu'un parcours, pas n'importe quel JSON de l'espace de travail. Sans
 * ça, un plugin qui assemble des GPX devient une façon de lire des fichiers.
 *
 * Où le fichier se trouve n'est plus l'affaire de ce plugin : la mémoire peut
 * être composée de plusieurs magasins, et c'est le noyau qui sait lesquels,
 * dans quel ordre, et où s'applique la garde de traversée.
 */
export function parcoursName(requested) {
  if (typeof requested !== 'string' || requested === '' || requested.includes('\0')) {
    return undefined
  }
  const path = requested.replace(/^\/+/, '')
  if (path === '' || !path.endsWith(SUFFIXE)) return undefined
  // Refusé ici AUSSI, alors que le noyau le refuse déjà : une fonction qui se
  // teste seule vaut mieux qu'une garde qu'il faut monter un magasin pour voir.
  if (path.split('/').some((segment) => segment === '..' || segment.startsWith('.'))) {
    return undefined
  }
  return path
}

/**
 * Polyline encodée → valeurs.
 *
 * `dims = 2` pour la trace (lat, lng) ; `dims = 1, factor = 1` pour la série
 * d'altitudes, en mètres entiers. Même algorithme des deux côtés, ce qui est ce
 * qui permet aux deux séries de vivre dans le même fichier sans se ressembler.
 */
export function decode(encoded, factor = 1e5, dims = 2) {
  const out = []
  const acc = new Array(dims).fill(0)
  let i = 0
  while (i < encoded.length) {
    for (let d = 0; d < dims; d += 1) {
      let shift = 0
      let result = 0
      let byte = 0
      do {
        byte = encoded.charCodeAt(i) - 63
        i += 1
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20 && i < encoded.length)
      acc[d] += result & 1 ? ~(result >> 1) : result >> 1
    }
    out.push(acc.map((v) => v / factor))
  }
  return out
}

/**
 * Deux échappements, pas un.
 *
 * Un contenu textuel n'a que `& < >` à craindre ; une valeur d'attribut, entre
 * guillemets doubles, y ajoute `"`. Échapper l'apostrophe partout serait légal
 * et resterait du bruit dans la prose — et de la prose, un `<desc>` n'est que
 * ça.
 */
const esc = (value) =>
  String(value ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const escAttr = (value) => esc(value).replace(/"/g, '&quot;')

/**
 * Un repère → son `<wpt>`.
 *
 * Le `web` devient un vrai `<link>` GPX 1.1 : il survit dans Organic Maps ou
 * OsmAnd, où il est cliquable. La note de contexte rejoint la description dans
 * `<desc>` — un lecteur de GPX n'a qu'un champ, et perdre la note serait perdre
 * précisément ce que l'agent a ajouté de sa main.
 */
function wpt(n, repere) {
  const [lat, lng] = String(repere.latlng ?? '')
    .split(',')
    .map((x) => x.trim())
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || !lat || !lng) return []

  const nom = repere.nom || `Repère ${n}`
  const desc = [repere.desc, repere.note]
    .filter((part) => part && String(part).trim())
    .map((part) => String(part).trim())
    .join('\n\n')

  const out = [
    `  <wpt lat="${escAttr(lat)}" lon="${escAttr(lng)}">`,
    `    <name>${esc(`${n}. ${nom}`)}</name>`,
  ]
  if (desc) out.push(`    <desc>${esc(desc)}</desc>`)
  if (repere.web) out.push(`    <link href="${escAttr(repere.web)}"><text>${esc(nom)}</text></link>`)
  if (repere.sym) out.push(`    <sym>${esc(repere.sym)}</sym>`)
  out.push('  </wpt>')
  return out
}

/**
 * Le parcours → un GPX 1.1 : les repères en `<wpt>`, le chemin en `<trk>`.
 *
 * ⚠️ La trace `<trk>` n'est pas décorative : beaucoup d'applications refusent
 * d'afficher un fichier qui ne porte que des waypoints. Un parcours sans
 * géométrie calculée sort donc avec ses repères seuls, mais LE DIT dans sa
 * description plutôt que de laisser croire à un chemin jamais routé.
 */
export function buildGpx(data) {
  const trace = data.trace ?? {}
  const reperes = data.reperes ?? []
  const titre = data.titre || 'Parcours'

  const coords = trace.geometrie ? decode(trace.geometrie) : []
  const altitudes = trace.altitudes ? decode(trace.altitudes, 1, 1).map(([v]) => v) : []

  let desc = coords.length
    ? `${((trace.distance_m ?? 0) / 1000).toFixed(2)} km, ${reperes.length} repères, ` +
      `D+ ${trace.denivele_pos_m ?? '?'} m. Trace calculée le ${trace.calcule_le ?? '?'} ` +
      `(${trace.moteur ?? 'routeur inconnu'}), altimétrie ${trace.altimetrie ?? 'inconnue'}.`
    : `${reperes.length} repères. AUCUNE trace calculée : ce fichier ne porte que des points, ` +
      'pas de chemin.'
  if (data.desc) desc = `${data.desc}\n\n${desc}`

  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Adestia" xmlns="http://www.topografix.com/GPX/1/1"',
    '     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 ' +
      'http://www.topografix.com/GPX/1/1/gpx.xsd">',
    '  <metadata>',
    `    <name>${esc(titre)}</name>`,
    `    <desc>${esc(desc)}</desc>`,
    '  </metadata>',
  ]

  for (const [index, repere] of reperes.entries()) out.push(...wpt(index + 1, repere))

  if (coords.length > 0) {
    out.push('  <trk>', `    <name>${esc(titre)}</name>`, '    <trkseg>')
    for (const [index, [lat, lng]] of coords.entries()) {
      const point = `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"`
      const ele = index < altitudes.length ? altitudes[index] : undefined
      out.push(ele === undefined ? `${point}/>` : `${point}><ele>${ele.toFixed(0)}</ele></trkpt>`)
    }
    out.push('    </trkseg>', '  </trk>')
  }

  out.push('</gpx>')
  return `${out.join('\n')}\n`
}

export default async function api(app, opts) {
  // La mémoire est servie par le noyau : chemins LOGIQUES, jamais de racine.
  const pages = opts.pages

  app.get('/gpx', async (request, reply) => {
    const path = parcoursName(request.query?.f)
    if (!path) return reply.code(404).send({ error: 'not a parcours' })

    const raw = await pages.read(path)
    if (raw === undefined) return reply.code(404).send({ error: 'not a parcours' })

    let data
    try {
      data = JSON.parse(raw)
    } catch {
      // Le fichier existe mais ne se lit pas : c'est une fiche à corriger, pas
      // une adresse fausse — 422 le dit, 404 mentirait.
      return reply.code(422).send({ error: 'unreadable parcours' })
    }

    const nom = path.split('/').pop().replace(SUFFIXE, '.gpx')
    return reply
      .type('application/gpx+xml')
      .header('Content-Disposition', `attachment; filename="${nom}"`)
      // Un dérivé ne se met pas en cache : la fiche change, le GPX doit suivre.
      .header('Cache-Control', 'no-store')
      .send(buildGpx(data))
  })
}
