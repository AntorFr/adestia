/* ── Les méthodes : ce qu'un nom choisi par une table fait réellement ────────
   Une table rend un NOM — `dessus-traverses`. Ici vit ce que ce nom pose :
   les pièces qu'il crée et les relations qu'il établit. C'est la moitié qui
   demande d'écrire du calcul, donc celle qui reste du code, quand ajouter une
   ligne de table ne demande que de choisir dans ce vocabulaire.

   Le registre refuse un nom qu'il ne connaît pas, en le nommant : une faute de
   frappe dans une table ne doit pas devenir une cote.

   Ce que ces deux méthodes montrent, et pourquoi ce sont celles-là qui sont
   écrites d'abord : le montage du DESSUS décide de la longueur du CÔTÉ. Une
   plaque pleine capture les côtés, deux traverses reposent dessus. C'est la
   même pièce, deux cotes, et rien dans un côté ne dit laquelle — il faut avoir
   posé la question du plan de travail. Elle ne l'avait pas été. */

import { bute, entre, traverse } from './ancrages.mjs'

/** `BLT-A1-CÔTÉ-G` — la convention d'étiquetage, tenue en un seul endroit. */
export const etiquette = (trigramme, module, role, repere) =>
  [trigramme, module, role, repere].filter(Boolean).join('-')

/**
 * Le dessus est une plaque pleine : elle coiffe le meuble et CAPTURE les côtés.
 *
 * Le cas sans plan de travail rapporté — rien d'autre ne vient fermer le
 * dessus ni assurer sa rigidité en tête, donc c'est lui qui la fait.
 */
const dessusPlaquePleine = {
  decrit: 'dessus en plaque pleine, traversant, qui capture les côtés',
  applique({ trigramme, module, cotes }) {
    const dessus = {
      etiquette: etiquette(trigramme, module, 'DESSUS'),
      role: 'DESSUS',
      orientation: 'horizontal',
    }
    return {
      pieces: [dessus],
      relations: [
        traverse(dessus, 'x'),
        traverse(dessus, 'y'),
        // Le côté perd DEUX épaisseurs : le bas dessous, le dessus dessus.
        ...cotes.map((c) => bute(c, 'z', [etiquette(trigramme, module, 'BAS'), dessus.etiquette])),
      ],
    }
  },
}

/**
 * Le dessus est deux traverses, avant et arrière, qui REPOSENT sur les côtés.
 *
 * Le cas du plan de travail rapporté : c'est lui qui fait la rigidité, comme
 * un caisson de cuisine. Le côté file alors jusqu'en haut et ne perd que
 * l'épaisseur du bas — d'où 851 et non 832.
 */
const dessusTraverses = {
  decrit: 'dessus en 2 traverses (avant + arrière) posées sur les côtés',
  applique({ trigramme, module, cotes }) {
    const traverses = ['AV', 'AR'].map((repere) => ({
      etiquette: etiquette(trigramme, module, 'TRAV-HAUT', repere),
      role: 'TRAVERSE',
      orientation: 'horizontal',
    }))
    return {
      pieces: traverses,
      relations: [
        // Entre les deux côtés : la traverse perd leurs deux épaisseurs.
        ...traverses.map((t) => entre(t, 'x', cotes.map((c) => c.etiquette))),
        // Le côté ne perd que le bas : les traverses se posent SUR lui.
        ...cotes.map((c) => bute(c, 'z', [etiquette(trigramme, module, 'BAS')])),
      ],
    }
  },
}

export const METHODES = {
  'dessus-plaque-pleine': dessusPlaquePleine,
  'dessus-traverses': dessusTraverses,
}

/**
 * Applique une méthode choisie par une table.
 *
 * `null` est une réponse — une table peut dire qu'aucune méthode ne s'applique
 * (un meuble sans fond). Un nom inconnu, lui, est une erreur : il vient d'une
 * table que quelqu'un a écrite, et il faut savoir laquelle.
 */
export function applique(nom, contexte, ou = '?') {
  if (nom === null || nom === undefined) return { pieces: [], relations: [] }
  const m = METHODES[nom]
  if (!m)
    return {
      erreur: `méthode inconnue « ${nom} » (${ou}) — connues : ${Object.keys(METHODES).join(', ')}`,
      pieces: [],
      relations: [],
    }
  return { ...m.applique(contexte), methode: nom }
}
