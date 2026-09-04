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

import { bute, entre, etiquette, traverse, v } from './ancrages.mjs'

/**
 * Le dessus est une plaque pleine ABOUTÉE : elle passe entre les côtés.
 *
 * C'est le montage de la maison, appliqué depuis toujours — le côté file
 * jusqu'en haut et ne perd que l'épaisseur du bas sur lequel il repose. Une
 * plaque qui coifferait le meuble est possible en théorie (voir plus bas) et
 * n'a jamais été retenue.
 */
const dessusPlaqueEntre = {
  decrit: 'dessus en plaque pleine, abouté entre les côtés',
  applique({ trigramme, module, cotes }) {
    const dessus = {
      etiquette: etiquette(trigramme, module, 'DESSUS'),
      role: 'DESSUS',
      orientation: 'horizontal',
      regardeVers: { 'rive-avant': 'avant', 'rive-arriere': 'arriere' },
    }
    return {
      pieces: [dessus],
      relations: [
        // Entre les côtés : le dessus perd leurs deux épaisseurs.
        entre(dessus, 'x', cotes.map((c) => c.etiquette)),
        traverse(dessus, 'y'),
        // Le côté ne perd que le bas : le dessus s'aboute, il ne coiffe pas.
        ...cotes.map((c) => bute(c, 'z', [etiquette(trigramme, module, 'BAS')])),
      ],
    }
  },
}

/**
 * Le dessus est une plaque pleine qui COIFFE le meuble et capture les côtés.
 *
 * Possible, jamais appliqué ici : le montage retenu est l'about. Gardé parce
 * qu'une table peut le nommer, et parce que c'est la seule façon de dire
 * clairement en quoi il diffère — le côté y perd DEUX épaisseurs au lieu
 * d'une, ce qui a fait sortir un côté à 832 quand il devait faire 851.
 */
const dessusPlaquePleine = {
  decrit: 'dessus en plaque pleine, traversant, qui capture les côtés',
  applique({ trigramme, module, cotes }) {
    const dessus = {
      etiquette: etiquette(trigramme, module, 'DESSUS'),
      role: 'DESSUS',
      orientation: 'horizontal',
      // Traversant : ses quatre bords sortent du meuble.
      regardeVers: {
        'about-gauche': 'gauche', 'about-droit': 'droite',
        'rive-avant': 'avant', 'rive-arriere': 'arriere',
      },
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
 * Le même dessus abouté, mais RAMENÉ en profondeur pour laisser passer le fond.
 *
 * Un fond glissé en rainure descend derrière les horizontaux : il faut lui
 * ménager le passage, sinon le dessus le barre. Le retrait vaut la distance à
 * laquelle le fond est retenu du dos — 20 mm sur les projets, d'où les 580
 * d'un dessus dans un meuble de 600.
 *
 * Le dessous, lui, ne suit pas forcément : il peut filer pleine profondeur et
 * arrêter le fond, ou l'encastrer dans une rainure. C'est la table du fond qui
 * en décide, et c'est pour ça que ce sont deux questions séparées.
 */
const dessusPlaqueEntreRamene = {
  decrit: 'dessus en plaque pleine abouté, ramené en profondeur pour le fond',
  applique(ctx) {
    const { pieces, relations } = dessusPlaqueEntre.applique(ctx)
    const dessus = pieces[0]
    return {
      pieces,
      relations: [
        // Tout sauf la profondeur traversante, qui barrerait le fond.
        ...relations.filter((r) => r.nom !== `${dessus.etiquette}/traverse-y`),
        {
          nom: `${dessus.etiquette}/ramene-pour-le-fond`,
          termes: { [v(dessus.etiquette, 'y')]: 1, 'meuble.y': -1, 'param.retrait_fond_dos': 1 },
          egale: 0,
        },
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
    // Une traverse ne débouche que du côté où elle est posée : la rive
    // opposée regarde l'intérieur du meuble, et ses abouts sont pris entre les
    // côtés. C'est ce qui fait qu'on chante l'avant de la traverse avant, et
    // rien d'autre — l'atelier le fait déjà sans se le formuler.
    const traverses = [
      ['AV', { 'rive-avant': 'avant' }],
      ['AR', { 'rive-arriere': 'arriere' }],
    ].map(([repere, regardeVers]) => ({
      etiquette: etiquette(trigramme, module, 'TRAV-HAUT', repere),
      role: 'TRAVERSE',
      orientation: 'horizontal',
      regardeVers,
    }))
    return {
      pieces: traverses,
      relations: [
        // Entre les deux côtés : la traverse perd leurs deux épaisseurs.
        ...traverses.map((t) => entre(t, 'x', cotes.map((c) => c.etiquette))),
        // La profondeur, elle, ne se déduit de rien : c'est un choix, et la
        // méthode dit d'où il vient. Le paramètre absent laisse une cote libre
        // plutôt qu'un « 100 par défaut, PAS CALCULÉ » en note de bas de page.
        ...traverses.map((t) => ({
          nom: `${t.etiquette}/profondeur-choisie`,
          termes: { [v(t.etiquette, 'y')]: 1, 'param.profondeur_traverse': -1 },
          egale: 0,
        })),
        // Le côté ne perd que le bas : les traverses se posent SUR lui.
        ...cotes.map((c) => bute(c, 'z', [etiquette(trigramme, module, 'BAS')])),
      ],
    }
  },
}

/* ── Le fond ────────────────────────────────────────────────────────────────
   Quatre méthodes pour une seule pièce, et c'est le sujet de la fiche
   `fond-caisson-colonne` : ce qui les sépare n'est pas le goût mais deux
   questions indépendantes — le meuble est-il mobile ou fixe, et jusqu'où va
   le dessous. Se tromper de cas coûte un fond trop court, un jour au dos, et
   un vissage en pied devenu impossible. C'est arrivé, et la fiche le date.

   La largeur, elle, est commune aux trois fonds en rainure : le fond n'est
   pas tenu par l'emboîtement mais par les vis, donc on ne cherche pas le
   plein fond de rainure — un jeu généreux évite qu'un panneau ne rentre plus
   dès qu'une rainure ressort moins profonde. */

/**
 * Le fond engagé dans les rainures des deux côtés, jeu latéral compris.
 *
 * La largeur intérieure (chaque côté retire SON épaisseur, une fois), plus ce
 * que le fond gagne en entrant dans les deux rainures — l'engagement, qui est
 * la profondeur de rainure moins le jeu volontaire.
 */
const largeurEnRainure = (fond, cotes) => ({
  nom: `${fond.etiquette}/largeur-engagee`,
  termes: {
    [v(fond.etiquette, 'x')]: 1,
    'meuble.x': -1,
    ...Object.fromEntries(cotes.map((c) => [v(c.etiquette, 'ep'), 1])),
    'param.rainure_prof': -2,
    'param.fond_jeu': 2,
  },
  egale: 0,
})

/** En rainure, le fond n'a AUCUN bord dehors — d'où « pas de chant au fond ». */
const pieceFond = (trigramme, module, regardeVers = {}) => ({
  etiquette: etiquette(trigramme, module, 'FOND'),
  role: 'FOND',
  orientation: 'frontal',
  regardeVers,
})

/**
 * Fond fin glissé dans une rainure traversante, que RIEN n'arrête en bas.
 *
 * Le dessous est ramené en profondeur : le fond passe derrière lui et descend
 * à fleur de sa face inférieure. Sa hauteur vaut donc le hors-tout moins la
 * marge, sans passer par la hauteur du côté — et c'est précisément l'erreur
 * qui a coûté trois fonds trop courts sur un projet.
 */
const fondRainureTraversant = {
  decrit: 'fond fin en rainure sur les 2 côtés, traversant de haut en bas',
  applique({ trigramme, module, cotes }) {
    const fond = pieceFond(trigramme, module)
    return {
      pieces: [fond],
      relations: [
        {
          nom: `${fond.etiquette}/hauteur-traversante`,
          termes: { [v(fond.etiquette, 'z')]: 1, 'meuble.z': -1, 'param.marge_fond': 1 },
          egale: 0,
        },
        largeurEnRainure(fond, cotes),
      ],
    }
  },
}

/** Le dessous file jusqu'au dos et ARRÊTE le fond : celui-ci part du côté. */
const fondRainureArrete = {
  decrit: 'fond fin en rainure, arrêté en bas par un dessous pleine profondeur',
  applique({ trigramme, module, cotes }) {
    const fond = pieceFond(trigramme, module)
    return {
      pieces: [fond],
      relations: [
        {
          nom: `${fond.etiquette}/hauteur-arretee`,
          termes: { [v(fond.etiquette, 'z')]: 1, [v(cotes[0].etiquette, 'z')]: -1, 'param.marge_fond': 1 },
          egale: 0,
        },
        largeurEnRainure(fond, cotes),
      ],
    }
  },
}

/**
 * Rainure d'encastrement dans le dessous : c'est elle qui retient le fond.
 *
 * Le fond descend dans le dessous de la profondeur de la rainure, donc il perd
 * l'épaisseur du bas MOINS ce qu'il y regagne.
 *
 * ⚠ Deux rainures, deux profondeurs, et les confondre coûte 4 mm sur la
 * hauteur du fond : celle des CÔTÉS (~9 mm, où le fond coulisse) et celle
 * d'ENCASTREMENT dans le bas (~5 mm, où il se loge). Elles sont relevées
 * distinctes sur le projet d'où vient ce cas.
 */
const fondRainureEncastre = {
  decrit: 'fond fin en rainure sur les côtés, encastré dans une rainure du bas',
  applique({ trigramme, module, cotes }) {
    const fond = pieceFond(trigramme, module)
    return {
      pieces: [fond],
      relations: [
        {
          nom: `${fond.etiquette}/hauteur-encastree`,
          termes: {
            [v(fond.etiquette, 'z')]: 1,
            'meuble.z': -1,
            'param.marge_fond': 1,
            [v(etiquette(trigramme, module, 'BAS'), 'ep')]: 1,
            'param.rainure_encastrement': -1,
          },
          egale: 0,
        },
        largeurEnRainure(fond, cotes),
      ],
    }
  },
}

/**
 * Fond plein, de la même épaisseur que le reste, monté comme une pièce.
 *
 * Le cas mobile : le meuble encaisse le vrillage du déplacement à chaque
 * roulage, et le fond y participe au même titre qu'un côté. Il n'est donc pas
 * glissé en rainure — il passe entre les côtés et bute sur le bas.
 */
const fondStructurel = {
  decrit: 'fond plein structurel, entre les côtés, posé sur le bas',
  applique({ trigramme, module, cotes }) {
    const fond = pieceFond(trigramme, module)
    return {
      pieces: [fond],
      relations: [
        entre(fond, 'x', cotes.map((c) => c.etiquette)),
        bute(fond, 'z', [etiquette(trigramme, module, 'BAS')]),
      ],
    }
  },
}

export const METHODES = {
  'dessus-plaque-entre': dessusPlaqueEntre,
  'dessus-plaque-entre-ramene': dessusPlaqueEntreRamene,
  'dessus-plaque-pleine': dessusPlaquePleine,
  'dessus-traverses': dessusTraverses,
  'fond-rainure-traversant': fondRainureTraversant,
  'fond-rainure-arrete': fondRainureArrete,
  'fond-rainure-encastre': fondRainureEncastre,
  'fond-structurel': fondStructurel,
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
