/* ── Le calepinage : refendre d'abord, et essayer les deux sens ──────────────
   La méthode de l'atelier est le rip-first : on règle le guide une fois par
   largeur, on refend en série, on tronçonne à 90°. Une colonne du plan est
   donc une refente, et les pièces qu'elle porte sont des tronçons.

   CE QUE L'ANCIEN OPTIMISEUR NE FAISAIT PAS : essayer l'autre sens. Il
   empilait les bandes sur la hauteur de la plaque — un budget court — quand
   les poser sur la longueur en offre bien plus. La question a fini par être
   posée à la main sur un vrai projet, et la réponse valait une plaque entière :
   « tout le MEL19 tient sur une seule plaque, plus deux ». Un optimiseur qui
   ne teste qu'un sens n'optimise pas, il range.

   Les deux sens sont donc calculés et comparés. Ils ne diffèrent que par l'axe
   des bandes — et par `rot` sur chaque pose, puisqu'une pièce dans une bande
   debout est la même pièce tournée d'un quart de tour.

   L'ORDRE DES CRITÈRES est celui de l'atelier, pas celui d'un solveur : le
   matériau prime sur le confort de réglage. Moins de plaques d'abord ; à
   égalité, la chute la plus CONSOLIDÉE (une grande chute se réutilise, dix
   petites ne servent à rien) ; à égalité encore, le moins de réglages de
   guide, parce qu'on n'y revient jamais deux fois de bon cœur. */

/** Ce qui sépare deux bandes sur une plaque. */
const KERF = 4
/** Marge de sécurité entre deux tronçons d'une même bande. */
const TRONCON = 10

const zone = (materiau) => {
  const d = materiau.derasage ?? 0
  return {
    x0: d, y0: d, d,
    l: (materiau.plaque?.l ?? 2800) - 2 * d,
    h: (materiau.plaque?.h ?? 2070) - 2 * d,
  }
}

/**
 * Un sens de débit, calculé en entier.
 *
 * `debout` : les bandes courent sur la HAUTEUR de la plaque, rangées côte à
 * côte sur sa longueur. Couché : l'inverse. Tout le reste est identique, ce
 * qui est la raison d'en faire un paramètre plutôt que deux fonctions.
 */
function unSens(pieces, materiau, debout, kerf, troncon) {
  const z = zone(materiau)
  const long = debout ? z.h : z.l // ce sur quoi les tronçons s'empilent
  const travers = debout ? z.l : z.h // ce sur quoi les bandes se rangent

  // 1. Une colonne par largeur : le guide se règle une fois, on refend en série.
  const parLargeur = new Map()
  for (const p of pieces) {
    if (!parLargeur.has(p.largeur)) parLargeur.set(p.largeur, [])
    parLargeur.get(p.largeur).push(p)
  }

  const colonnes = []
  for (const [largeur, lot] of parLargeur) {
    for (const piece of [...lot].sort((a, b) => b.longueur - a.longueur)) {
      let c = colonnes.find((x) => x.largeur === largeur
        && x.pris + (x.pieces.length ? troncon : 0) + piece.longueur <= long)
      if (!c) { c = { largeur, pris: 0, pieces: [] }; colonnes.push(c) }
      c.pris += (c.pieces.length ? troncon : 0) + piece.longueur
      c.pieces.push(piece)
    }
  }

  // 2. Les colonnes sur les plaques, la plus large d'abord : c'est ce qui laisse
  //    la chute d'un seul tenant au bout, plutôt qu'en miettes entre les bandes.
  colonnes.sort((a, b) => b.largeur - a.largeur)
  const plaques = []
  for (const c of colonnes) {
    let pl = plaques.find((x) => x.pris + (x.colonnes.length ? kerf : 0) + c.largeur <= travers)
    if (!pl) { pl = { pris: 0, colonnes: [] }; plaques.push(pl) }
    pl.pris += (pl.colonnes.length ? kerf : 0) + c.largeur
    pl.colonnes.push(c)
  }

  return {
    debout,
    plaques,
    reglages: new Set(colonnes.map((c) => c.largeur)).size,
    chute: plaques.length ? Math.round(travers - plaques[plaques.length - 1].pris) : travers,
    // Une pièce plus longue que le budget de la bande, ou plus large que la
    // plaque : ce sens ne peut pas la couper, et il faut le dire plutôt que
    // de rendre un plan où elle manque.
    impossible: pieces.some((p) => p.longueur > long || p.largeur > travers),
    zone: z,
  }
}

/** Le meilleur des deux sens, et ce que l'autre aurait donné. */
export function compareLesSens(pieces, materiau, kerf = KERF, troncon = TRONCON) {
  const deux = [
    unSens(pieces, materiau, true, kerf, troncon),
    unSens(pieces, materiau, false, kerf, troncon),
  ].sort((a, b) =>
    Number(a.impossible) - Number(b.impossible)
    || a.plaques.length - b.plaques.length
    || b.chute - a.chute
    || a.reglages - b.reglages)
  return { retenu: deux[0], ecarte: deux[1] }
}

/**
 * Le `debit[]` du contrat, matière par matière.
 *
 * Les positions sont absolues sur la plaque, et `rot` suit le sens : dans une
 * bande debout, une pièce présente sa largeur en x, donc elle est tournée.
 */
export function calepine(pieces, materiaux, meta = {}) {
  const kerf = meta.kerf ?? KERF
  const troncon = meta.tronconnage ?? TRONCON
  const debit = []
  const journal = []
  let n = 0

  for (const materiau of materiaux) {
    const siennes = pieces.filter((p) => p.materiau === materiau.id)
    if (!siennes.length) continue

    const { retenu, ecarte } = compareLesSens(siennes, materiau, kerf, troncon)
    journal.push({
      materiau: materiau.id,
      sens: retenu.debout ? 'debout' : 'couché',
      plaques: retenu.plaques.length,
      reglages: retenu.reglages,
      chute: retenu.chute,
      // Ce que l'autre sens aurait coûté. Sans ça, « on a comparé les deux »
      // n'est qu'une affirmation.
      autre: {
        sens: ecarte.debout ? 'debout' : 'couché',
        plaques: ecarte.plaques.length,
        reglages: ecarte.reglages,
      },
      ...(retenu.impossible ? { impossible: 'une pièce ne tient dans aucun sens' } : {}),
    })

    for (const plaque of retenu.plaques) {
      n += 1
      const pid = `P${n}`
      const z = retenu.zone
      const etapes = z.d
        ? [{ id: `${pid}-derasage`, type: 'derasage', titre: `Déraser le pourtour (−${z.d} mm)` }]
        : []

      let transverse = retenu.debout ? z.x0 : z.y0
      const bandes = []
      const tronconnages = []

      plaque.colonnes.forEach((c, i) => {
        const bid = `${pid}-C${i + 1}`
        let avance = retenu.debout ? z.y0 : z.x0
        const poses = []
        for (const piece of c.pieces) {
          poses.push({
            etiquette: piece.etiquette,
            x: retenu.debout ? transverse : avance,
            y: retenu.debout ? avance : transverse,
            rot: retenu.debout,
          })
          avance += piece.longueur + troncon
        }
        const utilise = avance - (retenu.debout ? z.y0 : z.x0) - troncon

        bandes.push({
          id: bid,
          label: String(c.largeur),
          x: retenu.debout ? transverse : z.x0,
          y: retenu.debout ? z.y0 : transverse,
          w: retenu.debout ? c.largeur : utilise,
          h: retenu.debout ? utilise : c.largeur,
          axe: retenu.debout ? 'y' : 'x',
        })
        tronconnages.push({
          id: `${pid}-tronc-C${i + 1}`,
          type: 'tronconnage',
          entree: bid,
          titre: `Tronçonner ${bid} → ${poses.length} pièce${poses.length > 1 ? 's' : ''}`,
          pieces: poses,
        })
        transverse += c.largeur + kerf
      })

      // Une refente par largeur de guide : c'est le GESTE qu'on compte, pas la
      // bande — deux bandes au même réglage sortent de la même passe.
      const parGuide = new Map()
      for (const b of bandes) {
        if (!parGuide.has(b.label)) parGuide.set(b.label, [])
        parGuide.get(b.label).push(b)
      }
      for (const [guide, lot] of parGuide) {
        etapes.push({
          id: `${pid}-refente-${guide}`,
          type: 'refente',
          entree: 'plaque',
          titre: `Guide ${guide} · refendre ${lot.length} bande${lot.length > 1 ? 's' : ''}`,
          bandes: lot,
        })
      }
      etapes.push(...tronconnages)
      debit.push({ plaque: pid, materiau: materiau.id, etapes })
    }
  }
  return { debit, journal }
}
