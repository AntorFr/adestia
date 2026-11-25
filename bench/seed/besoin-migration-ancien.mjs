/**
 * `adestia-dossiers-migration-agent`: an instance in the OLD folder format, staged for the
 * independent besoin tests (bench/tests/folders-migration-ensemble.test.mjs). One store, `memoire`,
 * at <base>/memoire. Data written by hand from B-41 / P-24: settings carried by pages.
 */
import { page, put } from './_lib.mjs'

export const scripts = []
export const engine = { mcp: [], auth: 'absent' }
export const config = { file: 'writable' }

export default async function seed({ base }) {
  const m = 'memoire/'
  // nested folder, upper-case index, extra field, PJ at the folder and in assets/
  await put(base, `${m}domaines/sante/INDEX.md`, page({ title: 'Santé', ico: '❤️', couleur: 'rouge', tags: ['suivi'] }, 'Le suivi de la famille.'))
  await put(base, `${m}domaines/sante/ordonnance.pdf`, '%PDF-1.4 ordonnance\n')
  await put(base, `${m}domaines/sante/assets/radio.jpg`, 'JPEGDATA')
  // index (mixed case) and homonymous page together
  await put(base, `${m}voyages/Index.md`, page({ title: 'Voyages', app: 'voyages' }, 'Avant de partir.'))
  await put(base, `${m}voyages/voyages.md`, page({ title: 'Carnet', ico: '🧳', couleur: 'turquoise' }, 'Le carnet.'))
  await put(base, `${m}voyages/billet.pdf`, '%PDF-1.4 billet\n')
  // homonymous only, ico only
  await put(base, `${m}cave/cave.md`, page({ ico: '🍷' }, 'Les bouteilles.'))
  await put(base, `${m}cave/liste.pdf`, '%PDF-1.4 liste\n')
  // a colour outside the palette: refused, page left as it is
  await put(base, `${m}bois/INDEX.md`, page({ title: 'Bois', couleur: 'fuchsia' }, 'Le bois.'))
  // ordinary folder, nothing to migrate
  await put(base, `${m}cuisine/recette.md`, page({ title: 'Gratin' }, 'Pommes de terre.'))
  // root-level index: no folder
  await put(base, `${m}INDEX.md`, page({ title: 'Racine', couleur: 'vert' }, 'A la racine.'))
  return `name: Adestia bench
auth:
  mode: none
workspace:
  stores:
    - id: memoire
      path: ${base}/memoire
      label: Mémoire
      default: true
`
}
