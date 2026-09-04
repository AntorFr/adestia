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
      // Ce qui ferme le haut : un séparateur vient buter dessous, et il n'a
      // aucun moyen de le savoir tout seul.
      ferme: [dessus.etiquette],
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
      ferme: traverses.map((t) => t.etiquette),
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

/* ── Les tablettes ───────────────────────────────────────────────────────────
   Deux retraits INDÉPENDANTS, sur des bords opposés, et la fiche du dressing
   insiste : ils « ne se recopient pas l'un sur l'autre ».

   À l'ARRIÈRE, le même passage de fond que pour le dessus — une tablette dans
   un caisson à fond glissé doit le laisser descendre.

   À l'AVANT, un retrait qui ne regarde que les tablettes : il sert normalement
   à dégager une porte, et le dessus comme le dessous restent pleine profondeur
   en façade, affleurants avec les côtés. Un projet peut le vouloir sans porte
   — c'est alors une dérogation, avec sa raison.

   Une seule méthode pour les deux cas : c'est la TABLE qui dit s'il y a un
   retrait avant, en sortie. Un nom de méthode par combinaison de retraits
   ferait quatre noms pour une seule pièce. */
const tabletteFixe = {
  decrit: 'tablette fixe entre les côtés, retraits avant et arrière selon le cas',
  applique({ trigramme, module, cotes, design, sorties }) {
    const combien = design?.tablettes ?? 0
    const enRetrait = sorties?.retrait_avant === 'oui'
    // Le fond glissé en rainure passe derrière : cas fixe avec fond.
    const passeDerriere = design?.fond === 'oui' && design?.pose === 'fixe'

    const pieces = Array.from({ length: combien }, (_, i) => ({
      etiquette: etiquette(trigramme, module, 'TAB', String(i + 1)),
      role: 'TABLETTE',
      orientation: 'horizontal',
      // Une tablette en retrait se voit exactement comme une affleurante.
      regardeVers: { 'rive-avant': 'avant' },
    }))

    return {
      pieces,
      relations: pieces.flatMap((t) => [
        entre(t, 'x', cotes.map((c) => c.etiquette)),
        {
          nom: `${t.etiquette}/profondeur`,
          termes: {
            [v(t.etiquette, 'y')]: 1,
            'meuble.y': -1,
            ...(passeDerriere ? { 'param.retrait_fond_dos': 1 } : {}),
            ...(enRetrait ? { 'param.retrait_tablette_avant': 1 } : {}),
          },
          egale: 0,
        },
      ]),
    }
  },
}

/* ── Les séparateurs ─────────────────────────────────────────────────────────
   Deux orientations, et elles ne se ressemblent pas.

   LATÉRAL : il divise la largeur — une colonne porte à gauche, une colonne
   tiroirs à droite. Sa rive avant donne sur la façade et se chante.

   FRONTAL : il divise la profondeur, et sur un meuble ouvert des deux côtés
   c'est LUI qui fait dos commun aux deux zones et tient le meuble au vrillage,
   à la place du panneau de fond absent. Aucun de ses bords ne débouche — ils
   sont pris entre le bas, les côtés et ce qui ferme le haut — d'où un
   séparateur sans un seul chant, ce que le meuble poubelle confirme.

   Les deux reposent sur le bas et s'arrêtent SOUS ce qui ferme le haut : 867
   sur un meuble de 905, soit deux épaisseurs de panneau. */
const separateur = (frontal) => ({
  decrit: frontal
    ? 'séparateur frontal, pleine largeur, fait dos aux deux zones'
    : 'séparateur latéral, divise la largeur du caisson',
  applique({ trigramme, module, cotes, design, ferme }) {
    const sep = {
      etiquette: etiquette(trigramme, module, 'SÉP', frontal ? 'MÉDIAN' : 'M'),
      role: 'SÉPARATEUR',
      orientation: frontal ? 'frontal' : 'lateral',
      // Le latéral montre sa rive avant ; le frontal n'a rien qui sorte.
      regardeVers: frontal ? {} : { 'rive-avant': 'avant' },
    }
    const passeDerriere = design?.fond === 'oui' && design?.pose === 'fixe'

    return {
      pieces: [sep],
      relations: [
        // Sur le bas, sous ce qui ferme le haut : deux épaisseurs de moins.
        bute(sep, 'z', [etiquette(trigramme, module, 'BAS'), ...(ferme ?? [])].slice(0, 2)),
        frontal
          ? entre(sep, 'x', cotes.map((c) => c.etiquette))
          : {
            nom: `${sep.etiquette}/profondeur`,
            termes: {
              [v(sep.etiquette, 'y')]: 1,
              'meuble.y': -1,
              ...(passeDerriere ? { 'param.retrait_fond_dos': 1 } : {}),
            },
            egale: 0,
          },
      ],
    }
  },
})

/* ── Les tiroirs ─────────────────────────────────────────────────────────────
   Deux pièces distinctes, et les confondre est l'erreur que la fiche
   d'agencement interdit en toutes lettres : « façade vissée après pose, jamais
   confondue avec le corps du tiroir ». Le corps a un montant avant
   FONCTIONNEL ; la vraie façade se visse dessus, par l'intérieur, une fois le
   tiroir posé et réglé.

   La raison est mécanique : les coulisses n'ont aucun réglage. Si la façade
   finie est directement la face avant du tiroir, le jeu de 2–3 mm entre
   façades voisines dépend de la position de pose des rails — un enfer à
   ajuster. Vissée après coup, on la cale contre ses voisines avant de fixer.

   LES FAÇADES se partagent la hauteur utile : n hauteurs plus (n−1) jeux font
   la zone. Trois façades de 229 et deux jeux de 3 font les 693 d'un meuble
   réel — et c'est une relation linéaire, donc le solveur la prend telle quelle.

   LE CORPS perd de chaque côté l'épaisseur d'une coulisse et son jeu : « ≥ 1 mm
   de jeu de chaque côté pour que les rails coulissent ». */
const tiroirs = {
  decrit: 'façades de tiroir se partageant la hauteur utile, corps monté sur coulisses',
  applique({ trigramme, module, design, ferme }) {
    const combien = design?.tiroirs ?? 0
    if (!combien) return { pieces: [], relations: [] }

    const facades = Array.from({ length: combien }, (_, i) => ({
      etiquette: etiquette(trigramme, module, 'FAÇADE', String(i + 1)),
      role: 'FAÇADE',
      orientation: 'frontal',
      // Une façade en applique est exposée sur ses quatre bords.
      regardeVers: {
        'rive-avant': 'avant', 'rive-arriere': 'avant',
        'about-gauche': 'avant', 'about-droit': 'avant',
      },
    }))

    const premiere = facades[0].etiquette
    const relations = [
      // Toutes de même hauteur : n hauteurs + (n−1) jeux font la hauteur utile,
      // laquelle est celle du caisson moins le bas et ce qui ferme le haut.
      {
        nom: `${trigramme}-${module}/repartition-facades`,
        termes: {
          [v(premiere, 'z')]: combien,
          'meuble.z': -1,
          [v(etiquette(trigramme, module, 'BAS'), 'ep')]: 1,
          ...(ferme?.[0] ? { [v(ferme[0], 'ep')]: 1 } : {}),
          'param.jeu_facade': combien - 1,
        },
        egale: 0,
      },
      // Les autres suivent la première : même hauteur, par construction.
      ...facades.slice(1).map((f) => ({
        nom: `${f.etiquette}/meme-hauteur`,
        termes: { [v(f.etiquette, 'z')]: 1, [v(premiere, 'z')]: -1 },
        egale: 0,
      })),
      // En applique : la façade couvre la largeur du meuble, moins le jeu
      // qu'elle laisse de chaque côté.
      ...facades.map((f) => ({
        nom: `${f.etiquette}/largeur-en-applique`,
        termes: { [v(f.etiquette, 'x')]: 1, 'meuble.x': -1, 'param.jeu_facade_lateral': 2 },
        egale: 0,
      })),
    ]

    return { pieces: facades, relations }
  },
}

export const METHODES = {
  'tiroirs-facades': tiroirs,
  'separateur-lateral': separateur(false),
  'separateur-frontal': separateur(true),
  'tablette-fixe': tabletteFixe,
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
