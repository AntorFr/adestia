/**
 * Le bloc `:::parcours` — l'adaptateur entre le contrat de Golem et le moteur.
 *
 * LE CONTRAT, en deux moitiés qui ne se répètent pas. Le manifeste déclare ce
 * qu'un parcours EST — son nom, ses attributs, le fait qu'il n'a pas de corps —
 * parce que le serveur valide les fiches et ne peut pas exécuter un module
 * écrit pour un navigateur. Ce fichier n'apporte donc que ce qu'un manifeste
 * ne peut pas porter : le composant qui le dessine.
 *
 * POURQUOI UNE ANCRE ET PAS UN DESSIN. Une boucle de 3 km fait 328 points de
 * trace. Les écrire dans la fiche ferait repasser toute la géométrie par le
 * modèle à chaque retouche — précisément le coût que le `.parcours.json` existe
 * pour éviter (cf. PARCOURS.md, et D44 côté cerveau). Le bloc résout le chemin,
 * pose un élément et s'arrête là ; `carte.js` va chercher le fichier et peint.
 *
 * DEUX VUES, et c'est ce qui évite un domaine « balades ». Un parcours n'a pas
 * de maison : il s'accroche à la fiche qui a une raison d'en parler — un
 * week-end, une forêt, un voyage — et reste adressable seul par
 * `#/parcours/<chemin>`. `vue="lien"` pose une carte compacte qui y mène, pour
 * qu'une fiche puisse en citer trois sans empiler trois cartes.
 */

import { createElement as h, useEffect, useRef } from 'react'

import { mountParcours } from './carte.js'
import { routeDuParcours } from './route.js'

export default function createParcoursBlocks(api) {
  // Les deux URL de l'hôte, fabriquées ici et injectées dans le moteur : un
  // plugin qui écrirait `/api/plugin/parcours/` en dur ne pourrait plus être
  // renommé, et le moteur n'a aucune raison de connaître sa propre adresse.
  const urls = {
    gpx: (chemin) => `/api/plugin/${api.id}/gpx?f=${encodeURIComponent(chemin)}`,
    page: routeDuParcours,
  }

  function Parcours({ attributes, resolve, locate }) {
    const hote = useRef(null)
    const source = attributes.source ?? ''
    const vue = attributes.vue === 'lien' ? 'lien' : 'carte'

    useEffect(() => {
      const element = hote.current
      if (!element) return undefined
      return mountParcours(element, {
        src: resolve(source),
        chemin: locate(source),
        vue,
        urls,
      })
      // `resolve` et `locate` sont refabriqués à chaque rendu de la fiche : les
      // mettre en dépendance remonterait la carte à chaque frappe dans la page.
      // Ce qui décide vraiment du contenu, c'est le fichier et la vue.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source, vue])

    // Le moteur écrit dans cet élément et rien d'autre n'y touche — ce qui est
    // ce qui laisse React et une peinture impérative cohabiter sans se disputer
    // le DOM. Le texte d'attente est du contenu de React, remplacé au montage.
    return h(
      'div',
      { ref: hote, className: 'parcours' },
      h('div', { className: 'pc-vide' }, api.locale === 'fr' ? 'Parcours…' : 'Route…'),
    )
  }

  return { tags: { parcours: Parcours } }
}
