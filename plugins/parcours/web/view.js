/**
 * `#/parcours/<chemin>` — un parcours seul dans son écran.
 *
 * La même carte que le bloc, montée sans la fiche autour. C'est ce qui rend un
 * parcours ADRESSABLE : il n'appartient à aucun domaine, il s'accroche à la
 * fiche qui a une raison d'en parler, et un même fichier peut être cité depuis
 * plusieurs fiches (D44). Sans une page à lui, `vue="lien"` n'aurait nulle part
 * où mener et la non-duplication tomberait.
 *
 * Une vue SANS tuile, délibérément : un parcours n'est pas une app, il n'a rien
 * à lancer depuis l'accueil. La route seule suffit, et le lanceur reste la
 * liste des choses qu'on ouvre, pas la liste de ce qui existe.
 */

import { createElement as h, useEffect, useRef, useState } from 'react'

import { mountParcours } from './carte.js'
import { ficheDuParcours, parcoursDeLaRoute } from './route.js'

export default function view(api) {
  const fr = api.locale === 'fr'

  function ParcoursSeul() {
    const hote = useRef(null)
    const [chemin, setChemin] = useState(() => parcoursDeLaRoute(window.location.hash))

    useEffect(() => {
      const onHash = () => setChemin(parcoursDeLaRoute(window.location.hash))
      window.addEventListener('hashchange', onHash)
      return () => window.removeEventListener('hashchange', onHash)
    }, [])

    useEffect(() => {
      const element = hote.current
      if (!element || !chemin) return undefined
      return mountParcours(element, {
        src: `/api/files/${chemin.split('/').map(encodeURIComponent).join('/')}`,
        chemin,
        vue: 'carte',
        urls: { gpx: (p) => `/api/plugin/${api.id}/gpx?f=${encodeURIComponent(p)}` },
      })
    }, [chemin])

    if (!chemin) {
      return h(
        'section',
        { className: 'parcours-page' },
        h(
          'p',
          { className: 'pc-vide' },
          fr ? 'Aucun parcours dans cette adresse.' : 'No route in this address.',
        ),
      )
    }

    // Où ce parcours est rangé. Une ligne de CONTEXTE, pas un retour : le shell
    // en pose déjà un au-dessus, et deux chevrons empilés se lisent comme un
    // bug (constaté à la capture). Ce qu'elle apporte, le retour ne l'apporte
    // pas : un lien `#/parcours/…` partagé ou mis en favori arrive ici sans
    // rien dire du voyage auquel la balade appartient.
    const dossier = ficheDuParcours(chemin)
    const nom = dossier.split('/').filter(Boolean).at(-1)

    return h('section', { className: 'parcours-page' }, [
      dossier !== chemin &&
        h('p', { key: 'd', className: 'parcours-dans' }, [
          fr ? 'Dans ' : 'In ',
          h('a', { key: 'a', href: `#/section/${encodeURIComponent(dossier)}` }, nom),
        ]),
      h('div', { key: 'p', ref: hote, className: 'parcours' }),
    ])
  }

  // Une route sans tuile : le shell la sert, le lanceur l'ignore.
  return { component: ParcoursSeul, route: '/parcours' }
}
