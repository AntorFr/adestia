/* ── Le squelette : où une pièce s'accroche, plutôt que combien elle mesure ──
   Une pièce ne déclare pas sa longueur, elle déclare comment elle tient dans
   le meuble : elle le traverse de bord à bord, ou elle passe entre deux
   voisines. Sa cote en découle — et surtout, elle en découle UNE FOIS. C'est
   ce qui rend impossible la double soustraction qui avait donné 832 : le
   nombre n'est plus écrit, il tombe du montage.

   Deux repères, et c'est tout le sujet de ce fichier :

   - celui du MEUBLE : x = largeur, y = profondeur, z = hauteur ;
   - celui de la PIÈCE : longueur, largeur, épaisseur — les cotes de débit,
     celles qu'on lit sur la fiche à l'atelier.

   Une pièce est un panneau, donc son épaisseur tombe sur UN axe du meuble, et
   c'est son orientation qui dit lequel. Le reste suit, par une convention qui
   n'est pas arbitraire : elle est relevée sur les workbooks déjà coupés — un
   CÔTÉ y porte « longueur 851 » pour sa hauteur et « largeur 600 » pour la
   profondeur du meuble. On garde ce que la fiche de débit dit déjà. */

/** meuble.x = largeur, meuble.y = profondeur, meuble.z = hauteur. */
export const AXES = ['x', 'y', 'z']

/**
 * Quel axe du meuble porte quelle cote de la pièce, selon son orientation.
 *
 * `horizontal` — bas, dessus, tablettes, traverses : l'épaisseur est verticale.
 * `lateral`    — côtés, séparateurs : l'épaisseur est en travers du meuble.
 * `frontal`    — fond, façades, portes : l'épaisseur est dans la profondeur.
 */
export const ORIENTATIONS = {
  horizontal: { ep: 'z', longueur: 'x', largeur: 'y' },
  lateral: { ep: 'x', longueur: 'z', largeur: 'y' },
  frontal: { ep: 'y', longueur: 'z', largeur: 'x' },
}

/**
 * L'orientation fixe l'axe de l'ÉPAISSEUR ; `echange` dit laquelle des deux
 * dimensions restantes est la longueur.
 *
 * Un côté de caisson est plus haut que profond, un côté de tiroir plus profond
 * que haut — même orientation, longueur sur un axe différent. Ce n'est pas
 * déductible : c'est ce qu'on veut voir courir le long de la bande au débit, et
 * ça se déclare.
 */
export const axesDe = (orientation, echange = false) => {
  const a = ORIENTATIONS[orientation]
  if (!a) throw new Error(`orientation inconnue « ${orientation} » (${Object.keys(ORIENTATIONS).join(', ')})`)
  return echange ? { ep: a.ep, longueur: a.largeur, largeur: a.longueur } : a
}

/** `BLT-A1-CÔTÉ-G` — la convention d'étiquetage, tenue en un seul endroit. */
export const etiquette = (trigramme, module, role, repere) =>
  [trigramme, module, role, repere].filter(Boolean).join('-')

/** `BLT-A1-CÔTÉ-G.x` — une cote de pièce vue dans le repère du meuble. */
export const v = (etiquette, quoi) => `${etiquette}.${quoi}`

/**
 * Les relations qui attachent les cotes de débit d'une pièce aux axes du meuble.
 *
 * Elles ne calculent rien : elles disent que « la longueur » et « l'étendue en
 * z » sont deux noms de la même chose. C'est ce qui permet ensuite de raisonner
 * en axes (les sommes d'un montage) et de couper en cotes de débit.
 */
export function relationsDOrientation(piece, retraits = {}) {
  const { ep, longueur, largeur } = axesDe(piece.orientation, piece.echange)
  const e = piece.etiquette
  return [
    // Zéro par défaut, et posé ici plutôt que laissé libre : un retrait absent
    // est une cote qu'on ne coupe pas, alors qu'un retrait NUL est la réponse
    // ordinaire — la plupart des bords ne tombent sur aucun ajustement.
    constante(`${e}/retrait-longueur`, v(e, 'retrait_longueur'), retraits.longueur ?? 0),
    constante(`${e}/retrait-largeur`, v(e, 'retrait_largeur'), retraits.largeur ?? 0),
    // La cote de COUPE est la place occupée moins ce qu'un chant rendra : une
    // bande plaquée ajoute son épaisseur, et sur une cote d'ajustement il faut
    // la rendre d'avance. Le retrait vaut zéro par défaut, et la règle des
    // chants le pose quand il y a lieu — d'où le terme, présent partout.
    { nom: `${e}/pose-longueur`, termes: { [v(e, longueur)]: 1, [v(e, 'longueur')]: -1, [v(e, 'retrait_longueur')]: -1 }, egale: 0 },
    { nom: `${e}/pose-largeur`, termes: { [v(e, largeur)]: 1, [v(e, 'largeur')]: -1, [v(e, 'retrait_largeur')]: -1 }, egale: 0 },
    { nom: `${e}/pose-epaisseur`, termes: { [v(e, ep)]: 1, [v(e, 'ep')]: -1 }, egale: 0 },
  ]
}

/**
 * Les bords d'une pièce qui tombent sur chaque cote de débit.
 *
 * Le vocabulaire est celui du contrat : les ABOUTS ferment la longueur, les
 * RIVES bordent la largeur. C'est ce qui permet de savoir quel chant pèse sur
 * quelle cote.
 */
export const BORDS = {
  longueur: ['about-gauche', 'about-droit'],
  largeur: ['rive-avant', 'rive-arriere'],
}

/**
 * Le seul ancrage qu'il y ait : la pièce court sur tout l'axe du meuble, MOINS
 * l'épaisseur des pièces qu'elle rencontre.
 *
 * Les trois cas du caisson ne diffèrent que par le nombre de pièces
 * rencontrées — zéro, une, deux — et c'est vrai du domaine, pas une économie
 * de code. Ce qui change entre 832 et 851, c'est exactement la longueur de
 * cette liste, et une table la décide au lieu de quelqu'un qui se rappelle
 * s'il faut retrancher une fois ou deux.
 */
const retranche = (piece, axe, voisines, verbe, dans = 'meuble') => ({
  nom: `${piece.etiquette}/${verbe}-${axe}${dans === 'meuble' ? '' : `-dans-${dans}`}`,
  termes: {
    [v(piece.etiquette, axe)]: 1,
    [`${dans}.${axe}`]: -1,
    ...Object.fromEntries(voisines.map((n) => [v(n, 'ep'), 1])),
  },
  egale: 0,
  // `dans` : le CONTENANT sur lequel la pièce court. Le meuble par défaut ;
  // une ZONE quand le caisson est partagé — une pièce dans une zone se cote
  // exactement comme une pièce dans un meuble, ce qui est la raison d'en faire
  // un paramètre plutôt qu'un second jeu d'ancrages.
  // Ce que l'ancrage dit du montage, gardé lisible pour qui veut l'inspecter.
  // Il ne décide RIEN des chants : ce qu'une bande rend ne dépend que des
  // chants de la pièce, et ce qui se chante ne dépend que de ce qu'on regarde.
  // (Une version antérieure en déduisait le retrait, et se trompait.)
  ancre: { etiquette: piece.etiquette, axe, verbe, voisines },
})

/**
 * D'un bord à l'autre du meuble, sans rien rencontrer.
 *
 * Le BAS d'un caisson porteur : les côtés reposent dessus, donc il court sur
 * toute la largeur. Traversante ne veut pas dire « pleine cote » pour autant —
 * un bord chanté qui tombe sur une cote d'ajustement se retire ensuite, et
 * c'est une AUTRE relation, posée par la règle des chants. Chacune son fait.
 */
export const traverse = (piece, axe, dans) => retranche(piece, axe, [], 'traverse', dans)

/**
 * ENTRE deux voisines : la pièce perd les deux épaisseurs.
 *
 * Une traverse haute entre les deux côtés : `1082 = 1120 − 19 − 19`. Le nombre
 * n'est écrit nulle part — il tombe de « entre les deux côtés », et le jour où
 * l'épaisseur du panneau change, il suit.
 */
export const entre = (piece, axe, voisines, dans) => retranche(piece, axe, voisines, 'entre', dans)

/**
 * En BUTÉE sur des voisines d'un seul côté.
 *
 * C'est le côté d'un caisson à dessus en traverses : il perd l'épaisseur du
 * bas sur lequel il repose, et rien en haut, parce que les traverses se posent
 * SUR lui au lieu de le capturer. Le même côté sous un dessus en plaque pleine
 * perd les deux — d'où 832 quand la question n'a pas été posée.
 */
export const bute = (piece, axe, voisines, dans) => retranche(piece, axe, voisines, 'bute', dans)

/** Une cote donnée par le stock ou par une fiche : l'épaisseur d'un panneau. */
export const constante = (nom, variable, valeur) => ({ nom, termes: { [variable]: 1 }, egale: valeur })

/** Le hors-tout du meuble, en trois relations — les seules cotes vraiment décidées. */
export const relationsDuMeuble = ({ l, p, h }) => [
  constante('meuble/largeur-hors-tout', 'meuble.x', l),
  constante('meuble/profondeur-hors-tout', 'meuble.y', p),
  constante('meuble/hauteur-hors-tout', 'meuble.z', h),
]
