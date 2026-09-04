/* ── Le retrait de chant : une bande plaquée se rend d'avance ────────────────
   Une bande ajoute son épaisseur au bord — ABS 0,8 mm plus le trait de colle,
   soit environ 1 mm par côté. Sur une cote d'AJUSTEMENT — une pièce qui doit
   arriver exactement au ras d'un extérieur — il faut donc couper en retrait
   d'autant, sinon la pièce plaquée ressort trop longue.

   Sur un bord LIBRE, rien à compenser : la façade est simplement repoussée
   d'un millimètre, uniformément, et personne ne le voit. C'est pourquoi la
   règle ne peut pas se réduire à « retirer 1 mm par bord chanté » — appliquée
   ainsi elle rétrécirait des pièces qui n'ont pas à l'être.

   Ce qui distingue les deux tient à deux faits, et aucun ne se déclare pièce
   par pièce. **L'ancrage** d'abord : une pièce qui TRAVERSE le meuble sur un
   axe affleure ses deux extérieurs, quand une pièce qui passe ENTRE des
   voisines est déjà en retrait. Le **meuble** ensuite : un axe qu'aucune pièce
   ne ferme n'ajuste rien. Sur un caisson à façade ouverte, la profondeur est
   un axe libre — la rive avant du bas est chantée et ne rencontre personne,
   donc « rien à compenser : on garde des cotes de coupe rondes ».

   Un bas traversant a donc ses ABOUTS en ajustement (ils affleurent les faces
   extérieures des côtés) et sa RIVE AVANT libre. La même pièce, deux bords
   chantés, deux traitements — et c'est ce que la fiche dit déjà.

   L'erreur que ça reprend est datée : un bas traversant, ses deux abouts
   chantés, sorti à 1120 au lieu de 1118 — « le même mécanisme que le dessous
   d'un autre meuble, celui-là je l'avais fait, juste oublié ici sur une pièce
   pourtant identique dans son principe ». Une règle appliquée à la main est
   appliquée partiellement ; celle-ci ne peut plus sauter une pièce. */

import { BORDS, axesDe } from './ancrages.mjs'

/** Le retrait par bord plaqué : bande ABS + trait de colle. */
export const RETRAIT_PAR_BORD = 1

/** `abouts` est un raccourci du contrat pour les deux bords de la longueur. */
export const bordsPlaques = (chants = []) =>
  chants.flatMap((c) => (c === 'abouts' ? BORDS.longueur : [c]))

/**
 * De combien couper en retrait sur chaque cote de débit d'une pièce.
 *
 * `ancres` : les ancrages posés pour cette pièce, tels que les ancrages les
 * rendent. `chants` : les bords plaqués, dans le vocabulaire du contrat.
 */
export function retraitsDe(piece, chants = [], ancres = [], parBord = RETRAIT_PAR_BORD, axesLibres = []) {
  const axes = axesDe(piece.orientation)
  const traverse = new Set(ancres.filter((a) => a.verbe === 'traverse').map((a) => a.axe))
  const retraits = {}

  for (const cote of ['longueur', 'largeur']) {
    // Pas d'ajustement : soit la pièce ne touche aucun extérieur sur cet axe,
    // soit c'est le meuble qui n'y ferme rien.
    if (!traverse.has(axes[cote]) || axesLibres.includes(axes[cote])) { retraits[cote] = 0; continue }
    const plaques = bordsPlaques(chants)
    retraits[cote] = BORDS[cote].filter((b) => plaques.includes(b)).length * parBord
  }
  return retraits
}

/**
 * Le linéaire de chant à commander, par pièce et au total.
 *
 * La revue des chants demande de le poser au BOM ; il se compte sur les cotes
 * FINIES, celles qu'on débite, pas sur la place occupée.
 */
export function lineaireDeChant(pieces, chantsPar = {}) {
  const detail = []
  for (const p of pieces) {
    const chants = chantsPar[p.etiquette] ?? []
    if (!chants.length) continue
    const longueurDe = { 'about-gauche': p.largeur, 'about-droit': p.largeur, 'rive-avant': p.longueur, 'rive-arriere': p.longueur }
    const mm = bordsPlaques(chants).reduce((n, b) => n + (longueurDe[b] ?? 0), 0)
    detail.push({ etiquette: p.etiquette, chants, mm })
  }
  return { detail, total: detail.reduce((n, d) => n + d.mm, 0) }
}
