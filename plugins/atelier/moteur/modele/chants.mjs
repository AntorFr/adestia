/* ── Le retrait de chant : on cote FINI, on coupe en retrait ─────────────────
   Le modèle raisonne en cotes FINIES — la place qu'une pièce occupe une fois
   plaquée. Deux pièces qui doivent affleurer ont donc la même cote finie,
   quel que soit le nombre de chants que chacune porte : un côté chanté sur un
   seul bord et un dessous chanté sur ses deux abouts se rejoignent au même
   nu. La cote de COUPE se déduit en dernier, en rendant d'avance l'épaisseur
   des bandes que cette pièce-là recevra.

   Il n'y a donc pas de « bord libre » qui dispenserait du retrait. La règle
   est celle de l'atelier et elle ne souffre pas d'exception : **pas de
   surépaisseur visible sur le meuble**. Une pièce qui déborde d'un
   millimètre est une DÉROGATION — elle s'écrit, elle se justifie — jamais un
   défaut du calcul.

   (Une version antérieure de ce fichier tenait la profondeur d'un caisson à
   façade ouverte pour un axe « libre », sans ajustement. C'était une
   invention : le meuble poubelle, ouvert sur ses DEUX grandes faces, coupe
   quand même ses côtés à 648 « pour finir à 650, l'enveloppe exacte ».)

   L'épaisseur n'est pas gravée non plus. ABS 0,8 plus le trait de colle fait
   ~1 mm, mais une bande de 2 mm existe : elle se déclare par projet, et par
   pièce quand une seule change. */

import { BORDS } from './ancrages.mjs'

/** Le défaut : ABS 0,8 mm + le trait de colle. Une bande de 2 mm se déclare. */
export const RETRAIT_PAR_BORD = 1

/**
 * Ce qu'une pièce porte comme chants, et de quelle épaisseur.
 *
 * `['rive-avant']` ou `{ bords: ['rive-avant'], epaisseur: 2 }` — la forme
 * courte pour le cas ordinaire, la longue quand une pièce sort du lot.
 */
export const bordsEtEpaisseur = (declare, defaut = RETRAIT_PAR_BORD) => {
  if (Array.isArray(declare)) return { bords: declare, epaisseur: defaut }
  if (declare && typeof declare === 'object')
    return { bords: declare.bords ?? [], epaisseur: declare.epaisseur ?? defaut }
  return { bords: [], epaisseur: defaut }
}

/** `abouts` est un raccourci du contrat pour les deux bords de la longueur. */
export const bordsPlaques = (chants = []) =>
  chants.flatMap((c) => (c === 'abouts' ? BORDS.longueur : [c]))

/**
 * De combien couper en retrait sur chaque cote de débit d'une pièce.
 *
 * `ancres` : les ancrages posés pour cette pièce, tels que les ancrages les
 * rendent. `chants` : les bords plaqués, dans le vocabulaire du contrat.
 */
export function retraitsDe(piece, chants = [], defaut = RETRAIT_PAR_BORD) {
  const { bords, epaisseur } = bordsEtEpaisseur(chants, defaut)
  const plaques = bordsPlaques(bords)
  const retraits = {}
  for (const cote of ['longueur', 'largeur'])
    retraits[cote] = BORDS[cote].filter((b) => plaques.includes(b)).length * epaisseur
  return retraits
}

/**
 * Le linéaire de chant à commander, par pièce et au total.
 *
 * La revue des chants demande de le poser au BOM. Il se compte sur les cotes
 * de COUPE — c'est le bord NU qu'une bande vient couvrir, et il est déjà en
 * retrait de ce que cette bande ajoutera.
 */
export function lineaireDeChant(pieces, chantsPar = {}) {
  const detail = []
  for (const p of pieces) {
    const { bords: chants } = bordsEtEpaisseur(chantsPar[p.etiquette])
    if (!chants.length) continue
    const longueurDe = { 'about-gauche': p.largeur, 'about-droit': p.largeur, 'rive-avant': p.longueur, 'rive-arriere': p.longueur }
    const mm = bordsPlaques(chants).reduce((n, b) => n + (longueurDe[b] ?? 0), 0)
    detail.push({ etiquette: p.etiquette, chants, mm })
  }
  return { detail, total: detail.reduce((n, d) => n + d.mm, 0) }
}
