/** One seeded trip, and the page it draws, shared by the sheet and language tests. */
import { mount, settle } from '../../test/mount.js'
import view from '../web/view.js'

export const VOYAGE = 'domaines/voyages/baden-2026/assets/voyage.json'

export const DATA = {
  titre: 'Baden 2026',
  status: 'prépa',
  debut: '2026-09-01',
  fin: '2026-09-02',
  modes: ['marche', 'voiture', 'velo', 'transport'],
  items: [
    { id: 'hotel', type: 'hebergement', titre: 'Hotel Sonne', statut: 'confirme', debut: '2026-09-01', fin: '2026-09-02', desc: 'Near the baths', gmail: true },
    { id: 'bain', type: 'activite', titre: 'Caracalla', statut: 'confirme', jour: '2026-09-01', creneau: 'matin', duree: '2h', prix: '20 €', fiche: 'bain.md', gmail: true, place_id: 'x' },
    { id: 'marche', type: 'visite', titre: 'Marché', statut: 'confirme', jour: '2026-09-01', creneau: 'apres-midi' },
    { id: 'diner', type: 'cuisine', titre: 'Zum Löwen', statut: 'suggestion', hint: 'Spätzle', prix: '30 €', web: 'https://example.test' },
    { id: 'vieux', type: 'visite', titre: 'Vieille ville', statut: 'suggestion', hint: 'Walk' },
    { id: 'ski', type: 'activite', titre: 'Ski', statut: 'ecartee', hint: 'No snow' },
  ],
}

export const respond = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })

export const apiFor = (locale, log = []) => ({
  id: 'voyages',
  base: '/plugins/voyages/',
  locale,
  trail() {},
  ask() {},
  compose() {},
  fetch: (url, init) => {
    log.push({ url, init })
    if (url.includes('/voyage?')) return respond(DATA)
    if (url.includes('/state?')) return respond({ items: {} })
    if (url.includes('/docs?')) return respond({ docs: [] })
    if (url.endsWith('/voyages')) return respond({ voyages: [{ path: VOYAGE, titre: 'Baden 2026' }] })
    if (url.includes('/api/pages/index')) return respond({ entries: [{ path: 'domaines/voyages/baden-2026/bain.md', title: 'Bain' }] })
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'nope' }) })
  },
})

/** The trip page mounted under `locale`, settled. */
export async function mountTrip(locale, log) {
  const mounted = await mount(view, apiFor(locale, log), `#/voyages/${encodeURIComponent(VOYAGE)}`)
  await settle()
  await settle()
  return mounted
}

/** Every text node, label and title of the page, in document order. */
export function texts(document) {
  const out = []
  const walker = document.createTreeWalker(document.body, 4)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = n.textContent.trim()
    if (s) out.push(s)
  }
  for (const el of document.querySelectorAll('[aria-label],[title]'))
    for (const a of ['aria-label', 'title']) if (el.getAttribute(a)) out.push(`${a}=${el.getAttribute(a)}`)
  return out
}
