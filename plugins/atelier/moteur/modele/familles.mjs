/* ── Les familles : ce qu'un meuble EST, avant toute décision ────────────────
   Les tables savaient déjà de quelle famille elles parlent — `applique_a` est
   là depuis le début, et c'est ce qui les fait écarter proprement. Mais le
   SQUELETTE, lui, était écrit en dur : un bas et deux côtés, quoi qu'on
   demande. La porte existait, le socle ne passait pas dedans.

   Ça s'est vu sur un claustra. Ses tables étaient bien écartées, et le moteur
   réclamait quand même un `BAS` et deux `CÔTÉ` — des pièces que ce meuble n'a
   pas, sur un meuble posé depuis juillet. Ce n'était pas une colonne qui
   manquait à une table : c'était une famille que le moteur ne savait pas
   engendrer, et rien ne le disait.

   Une famille répond donc ici, et une seule fois : quelles pièces existent
   toujours, et quelles relations tiennent sans qu'on ait rien décidé. Le reste
   — ce que fait le haut, jusqu'où va le dessous, combien de tablettes — reste
   affaire de tables.

   Une famille inconnue n'est pas engendrée au jugé : elle est nommée et elle
   bloque. C'est la même règle que partout ailleurs — un plan qui se tait sur
   ce qu'il ignore vaut moins qu'un plan qui refuse de conclure. */

import { compte, entre, etiquette, traverse, v } from './ancrages.mjs'

/**
 * Le caisson : un bas qui porte, deux côtés qui reposent dessus.
 *
 * C'est le montage retenu ici, explicite plutôt que sous-entendu : le dessous
 * reprend la charge. Ce qui reste ouvert, c'est ce que font le HAUT du côté et
 * la PROFONDEUR du bas, et ce sont des tables qui le décident.
 */
function caisson(trigramme, module) {
  const bas = {
    etiquette: etiquette(trigramme, module, 'BAS'),
    role: 'BAS',
    orientation: 'horizontal',
    // Traversant sous tout le meuble : ses quatre bords en sortent.
    regardeVers: {
      'about-gauche': 'gauche', 'about-droit': 'droite',
      'rive-avant': 'avant', 'rive-arriere': 'arriere',
    },
  }
  const cotes = ['G', 'D'].map((repere) => ({
    etiquette: etiquette(trigramme, module, 'CÔTÉ', repere),
    role: 'CÔTÉ',
    orientation: 'lateral',
    // Un côté montre ses RIVES (avant et arrière) ; sa face extérieure donne
    // sur le flanc du meuble, mais une face n'est pas un chant.
    regardeVers: { 'rive-avant': 'avant', 'rive-arriere': 'arriere' },
  }))
  return {
    pieces: [bas, ...cotes],
    /* La profondeur du bas n'est PAS ici : c'est une décision, et une table la
       prend. Le squelette ne pose que ce qui ne se discute pas — le bas court
       sur toute la largeur, les côtés sur toute la profondeur. */
    relations: [traverse(bas, 'x'), ...cotes.map((c) => traverse(c, 'y'))],
    cotes,
  }
}

/**
 * Le claustra : des lames sur chant entre une semelle et une lisse.
 *
 * Beaucoup plus simple qu'un caisson, et d'une simplicité qui se voit au débit :
 * TOUTES ses pièces sortent à la même largeur — 100 sur celui du bois de
 * chauffage — donc une seule refente pour le meuble entier.
 *
 * Une lame est posée SUR CHANT : on ne voit d'elle que son épaisseur (20), et
 * ses 100 mm sont la profondeur du claustra. C'est ce qui la rend vingt-cinq
 * fois plus raide que couchée, et c'est pour ça que les traverses de renfort
 * sont un choix et non une nécessité — le meuble tient sans elles.
 *
 * Ce qui ne se déclare jamais : le JOUR entre deux lames. Les lames et les
 * jours remplissent la largeur, ce qui fait une relation linéaire — donc le
 * solveur la rend, et une lame de plus ou de moins se voit au lieu de se
 * rattraper en silence sur un jour qu'on aurait écrit à la main.
 */
function claustra(trigramme, module, design) {
  const { combien } = compte(design?.lames, 'lames')
  const { combien: renforts } = compte(design?.traverses, 'traverses')
  const nom = (role, repere) => etiquette(trigramme, module, role, repere)

  const horizontale = (role, repere) => ({
    etiquette: nom(role, repere),
    role,
    orientation: 'horizontal',
    // Semelle et lisse débouchent partout : elles ferment le meuble en haut
    // et en bas, et leurs abouts sortent sur les flancs.
    regardeVers: {
      'about-gauche': 'gauche', 'about-droit': 'droite',
      'rive-avant': 'avant', 'rive-arriere': 'arriere',
    },
  })
  const semelle = horizontale('SEMELLE')
  const lisse = horizontale('LISSE')

  const lames = Array.from({ length: combien }, (_, i) => ({
    etiquette: nom('LAME', String(i + 1)),
    role: 'LAME',
    // Sur chant : son épaisseur se voit de face (x), sa longueur monte (z), et
    // ses 100 mm sont la profondeur du claustra (y).
    orientation: 'lateral',
    regardeVers: { 'rive-avant': 'avant', 'rive-arriere': 'arriere' },
  }))

  const traverses = Array.from({ length: renforts }, (_, i) => ({
    etiquette: nom('TRAV', String(i + 1)),
    role: 'TRAVERSE',
    // À plat au dos des lames : son épaisseur est dans la profondeur (y), sa
    // longueur court sur la largeur (x), et sa hauteur vue est en z.
    orientation: 'frontal',
    echange: true,
    regardeVers: { 'rive-arriere': 'arriere' },
  }))

  return {
    pieces: [semelle, lisse, ...lames, ...traverses],
    cotes: [],
    relations: [
      // Les horizontales tiennent la largeur et la profondeur entières.
      ...[semelle, lisse, ...traverses].map((p) => traverse(p, 'x')),
      ...[semelle, lisse].map((p) => traverse(p, 'y')),
      // Une lame se glisse ENTRE la semelle et la lisse, et prend toute la
      // profondeur : 2410 sous plafond − 2 × 20 = 2370.
      ...lames.map((l) => entre(l, 'z', [semelle.etiquette, lisse.etiquette])),
      ...lames.map((l) => traverse(l, 'y')),
      /* Une traverse de renfort se coupe dans la même bande que tout le reste :
         sa hauteur vue vaut la profondeur du meuble. C'est ce qui fait qu'un
         claustra entier sort d'un seul réglage de refente. */
      ...traverses.map((t) => ({
        nom: `${t.etiquette}/dans-la-meme-bande`,
        termes: { [v(t.etiquette, 'z')]: 1, 'meuble.y': -1 },
        egale: 0,
      })),
      // Les lames et les jours remplissent la largeur. Une seule relation, et
      // le jour en tombe : (1200 − 6 × 20) / 5 = 216.
      ...(combien > 1 ? [{
        nom: 'claustra/lames-et-jours-remplissent',
        termes: {
          'claustra.jour': combien - 1,
          ...Object.fromEntries(lames.map((l) => [v(l.etiquette, 'ep'), 1])),
          'meuble.x': -1,
        },
        egale: 0,
      }] : []),
      // L'entraxe se lit sur le plan de perçage : un jour plus une lame.
      ...(combien > 1 ? [{
        nom: 'claustra/entraxe',
        termes: {
          'claustra.entraxe': 1,
          'claustra.jour': -1,
          [v(lames[0].etiquette, 'ep')]: -1,
        },
        egale: 0,
      }] : []),
    ],
  }
}

/** Ce que le moteur sait engendrer, et sous quel nom une table le désigne. */
export const SQUELETTES = { caisson, claustra }

/**
 * Le squelette d'une famille, ou de quoi refuser en la nommant.
 *
 * Rendre l'erreur plutôt que de lever : une famille inconnue est une réponse
 * que le moteur doit donner, pas une panne.
 */
export function squelette(famille, trigramme, module, design) {
  const f = SQUELETTES[famille]
  if (!f) {
    return {
      erreur: `famille « ${famille ?? 'non déclarée'} » : le moteur ne sait pas `
        + `l'engendrer (${Object.keys(SQUELETTES).join(', ')}). Ce n'est pas une `
        + 'colonne qui manque à une table — c\'est une sorte de meuble dont les '
        + 'pièces ne sont écrites nulle part, et la déclarer « caisson » pour '
        + 'faire passer la dérivation donnerait des cotes plausibles et fausses.',
      pieces: [],
      relations: [],
      cotes: [],
    }
  }
  return f(trigramme, module, design)
}

/** Ce qu'une famille rend comme RÉSULTATS, au-delà des pièces. */
export const RESULTATS = {
  claustra: ['claustra.jour', 'claustra.entraxe'],
}
