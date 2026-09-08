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

import { bute, compte, entre, etiquette, traverse, v } from './ancrages.mjs'
import { contenant, zoneDe } from './zones.mjs'

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

/* ── Le dessous : jusqu'où il va, et pourquoi c'est un choix ────────────────
   Le bas porte : ça, c'est le montage, et le socle le pose sans le demander.
   Mais sa PROFONDEUR est une décision, au même titre que ce que fait le haut —
   et elle était posée en dur, traversante, par le socle. Un meuble monté l'a
   dit : le rangement du garage a son dessous à 600 pour 620 de meuble, et le
   moteur en calculait 619. Une cote fausse et plausible sur une pièce qu'on
   débite, produite par la seule pièce que personne n'avait pensé à interroger.

   Ce qui départage les deux montages n'est pas le goût, c'est un COMPTE — le
   même arbitrage que le retrait de tablette :

   RAMENÉ : le dessous recule comme le dessus, le fond passe derrière lui. Tout
   ce qui est horizontal tombe alors à la même profondeur — dessus, tablettes,
   dessous — donc une seule refente et un seul réglage. C'est le montage du
   rangement du garage : peu de pièces, le temps gagné au débit compte.

   TRAVERSANT : le dessous file pleine profondeur, et c'est une rainure qui
   reçoit le fond. Trois réglages au lieu d'un, assumés. C'est le montage du
   dressing : beaucoup de tablettes et le même meuble plusieurs fois, où le
   gain d'un réglage unique ne justifie plus de raccourcir le dessous.

   Les deux sont justes. C'est pour ça que ça vit dans une table. */
const dessousRamene = {
  decrit: 'dessous ramené en profondeur, comme le dessus : le fond passe derrière',
  applique({ trigramme, module }) {
    const bas = etiquette(trigramme, module, 'BAS')
    return {
      pieces: [],
      relations: [{
        nom: `${bas}/ramene-pour-le-fond`,
        termes: { [v(bas, 'y')]: 1, 'meuble.y': -1, 'param.retrait_fond_dos': 1 },
        egale: 0,
      }],
    }
  },
}

const dessousTraversant = {
  decrit: 'dessous pleine profondeur : il arrête le fond, ou le reçoit en rainure',
  applique({ trigramme, module }) {
    const bas = { etiquette: etiquette(trigramme, module, 'BAS'), orientation: 'horizontal' }
    return { pieces: [], relations: [traverse(bas, 'y')] }
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
/* ── Ce qui tient un fond, bout par bout ────────────────────────────────────
   Une cote de fond ne dépend pas du « montage » pris en bloc : elle dépend de
   ce qui tient CHAQUE bout, et les deux axes obéissent à la même règle. La
   largeur n'est que le cas « rainure des deux côtés ».

     rainure   il regagne ce qu'il entre : profondeur usinée moins le jeu qu'on
               garde au fond du trait.
     bute      rien. Le bout touche une pièce, c'est une référence, pas un vide
               à ménager.
     libre     il flotte : on retire `marge_fond`, pour qu'un panneau coupé un
               peu large ne dépasse pas du meuble.

   Écrit comme ça, un meuble rainuré en haut ET en bas se cote tout seul le jour
   où il existera, et il n'y a qu'un seul jeu en l'air à connaître — c'est le
   même des deux côtés, puisque c'est la même erreur de coupe qu'on rattrape. */
const BOUT = {
  rainure: (prof) => ({ [`param.${prof}`]: -1, 'param.fond_jeu': 1 }),
  bute: () => ({}),
  libre: () => ({ 'param.marge_fond': 1 }),
}

/** Additionne les termes de plusieurs bouts (les coefficients s'ajoutent). */
const bouts = (...liste) => liste.reduce((acc, t) => {
  for (const [k, x] of Object.entries(t)) acc[k] = (acc[k] ?? 0) + x
  return acc
}, {})

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

/* Ce qu'un fond MASQUE. Il est le panneau le plus au dos : tout ce qui se
   trouve devant lui n'est plus vu de l'arrière, et ne se chante donc pas — la
   règle a toujours dit « tourné vers une face regardée ET que rien ne
   l'occulte », c'est la seconde moitié qui manquait.

   Sauf ce qui le BORDE, et qui reste dehors : les côtés le prennent en
   rainure ou l'encadrent, le dessous le porte ou l'arrête. Le seul cas où le
   dessous passe derrière lui est le fond traversant, où le dessous est ramené
   pour lui livrer passage — là, c'est le fond qu'on voit, pas le dessous. */
/* De combien une pièce doit RECULER pour ne pas taper le fond.
   Le séparateur latéral le devinait à partir de `pose`, ce qui marchait par
   accident : un meuble mobile a un fond structurel de 19 mm posé entre les
   côtés, et son séparateur vient buter dessus — 651 dans un meuble de 670,
   là où le moteur en calculait 669. Un meuble fixe a un fond en rainure,
   retenu du dos, et c'est ce retrait-là qu'il faut dégager.

   Chaque méthode de fond pose donc la grandeur, et qui la consomme n'a pas
   besoin de savoir laquelle a répondu — ni de tourner après elle. */
const degagement = (termes) => ({
  nom: 'meuble/degagement-du-fond',
  termes: { 'meuble.degagement_fond': 1, ...termes },
  egale: 0,
})

const masqueLArriere = (trigramme, module, avecLeBas = true) => ({
  face: 'arriere',
  sauf: [
    etiquette(trigramme, module, 'CÔTÉ', 'G'),
    etiquette(trigramme, module, 'CÔTÉ', 'D'),
    ...(avecLeBas ? [etiquette(trigramme, module, 'BAS')] : []),
  ],
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
      occulte: masqueLArriere(trigramme, module, false),
      relations: [
        degagement({ 'param.retrait_fond_dos': -1 }),
        {
          nom: `${fond.etiquette}/hauteur-traversante`,
          termes: {
            [v(fond.etiquette, 'z')]: 1,
            'meuble.z': -1,
            // Il ne bute nulle part : libre en haut, libre en bas.
            ...bouts(BOUT.libre(), BOUT.libre()),
          },
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
      occulte: masqueLArriere(trigramme, module, true),
      relations: [
        degagement({ 'param.retrait_fond_dos': -1 }),
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
      occulte: masqueLArriere(trigramme, module, true),
      relations: [
        degagement({ 'param.retrait_fond_dos': -1 }),
        {
          nom: `${fond.etiquette}/hauteur-encastree`,
          termes: {
            [v(fond.etiquette, 'z')]: 1,
            'meuble.z': -1,
            'param.marge_fond': 1,
            [v(etiquette(trigramme, module, 'BAS'), 'ep')]: 1,
            /* Il regagne ce qu'il entre dans la rainure du BAS : la profondeur
               usinée moins le jeu qu'on garde au fond — le même jeu qu'en
               largeur, parce que c'est le même geste. Ce terme valait un
               engagement NET, qui ne mentionnait aucun jeu : le fond ne bougeait
               donc pas d'un millimètre quand on resserrait le jeu, alors qu'il
               entre bel et bien plus loin. Une rainure se décrit partout de la
               même façon — une profondeur et un jeu — sinon l'une des deux ment. */
            'param.rainure_bas_prof': -1,
            'param.fond_jeu': 1,
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
      occulte: masqueLArriere(trigramme, module, true),
      relations: [
        degagement({ [v(fond.etiquette, 'ep')]: -1 }),
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
  decrit: 'tablettes fixes entre les côtés, retraits avant et arrière selon le cas',
  applique({ trigramme, module, cotes, design, sorties }) {
    /* Le design DÉCLARE ses tablettes, et il peut en poser dans plusieurs
       endroits à la fois : le caisson de l'imprimante 3D a un séparateur
       latéral et UNE tablette par colonne, 331,5 chacune. La déclaration ne
       nommait qu'une zone pour toutes, donc ce meuble ne pouvait pas s'écrire.

       Trois écritures, de la plus courte à la plus précise, et c'est la même
       progression que pour les séparateurs :

         tablettes: 2                          deux tablettes dans le meuble
         tablettes: { nombre: 1, zone: 'x' }   une, dans la zone x
         tablettes: [{ nombre: 1, zone: 'g' }, { nombre: 1, zone: 'd' }]

       Le numéro reste continu d'un lot à l'autre : TAB-1, TAB-2… parce que
       c'est ce qui est écrit au crayon sur les panneaux, et que l'atelier ne
       compte pas par zone. */
    const lots = Array.isArray(design?.tablettes) ? design.tablettes : [design?.tablettes]
    const enRetrait = sorties?.retrait_avant === 'oui'

    /* Un séparateur FRONTAL coupe la profondeur en deux ZONES — bacs devant,
       outils derrière — et une tablette vit dans l'une des deux, pas dans le
       meuble. Elle doit donc dire laquelle. Sans ça, cette méthode coterait
       sur toute la profondeur : faux, plausible, et muet. */
    const partageEnProfondeur = (design?.separateurs ?? [])
      .some((c) => c.type === 'frontal' && !c.zone)

    const pieces = []
    const relations = []
    const issues = []
    let numero = 0

    for (const lot of lots) {
      const { combien } = compte(lot, 'tablettes')
      const zone = zoneDe(lot)
      const dans = zone ? contenant(zone) : undefined
      /* Une zone ne divise qu'UN axe : la tablette y prend son étendue, et
         garde celle du meuble sur l'autre. Le meuble poubelle partage la
         profondeur — sa tablette tient toujours toute la largeur intérieure —
         là où une colonne partage la largeur. */
      const axeDeZone = (design?.zones ?? []).find((z) => z.id === zone)?.axe
      for (let i = 0; i < combien; i++) {
        numero += 1
        const t = {
          etiquette: etiquette(trigramme, module, 'TAB', String(numero)),
          role: 'TABLETTE',
          orientation: 'horizontal',
          // Une tablette en retrait se voit exactement comme une affleurante.
          regardeVers: { 'rive-avant': 'avant' },
          /* Une tablette pleine largeur ne s'AJOUTE pas au meuble : elle le
             PARTAGE en hauteur, exactement comme un séparateur le partage en
             largeur. Le meuble à tiroirs en porte une, et c'est elle qui borne
             son séparateur à 693 au lieu de le laisser monter jusqu'en haut —
             19 de bas + 693 + 19 de tablette + 120 de compartiment + 19 de
             traverse font les 870 du meuble. */
          ...(lot?.partage ? { partage: lot.partage } : {}),
        }
        pieces.push(t)

        if (partageEnProfondeur && !zone) {
          relations.push(entre(t, 'x', cotes.map((c) => c.etiquette)))
          issues.push({
            gravite: 'bloquant',
            type: 'zone-inconnue',
            message: `${t.etiquette} : un séparateur frontal partage la profondeur en deux ZONES, `
              + 'et rien ne dit dans laquelle cette tablette se pose — sa profondeur '
              + 'n\'est pas celle du meuble.',
          })
          continue
        }

        const partageLaLargeur = dans && axeDeZone === 'x'
        const partageLaProfondeur = dans && axeDeZone === 'y'
        relations.push(
          partageLaLargeur
            ? {
              nom: `${t.etiquette}/largeur-de-zone`,
              termes: { [v(t.etiquette, 'x')]: 1, [`${dans}.x`]: -1 },
              egale: 0,
            }
            : entre(t, 'x', cotes.map((c) => c.etiquette)),
          {
            nom: `${t.etiquette}/profondeur`,
            termes: {
              [v(t.etiquette, 'y')]: 1,
              [`${partageLaProfondeur ? dans : 'meuble'}.y`]: -1,
              /* Elle recule de ce que le fond occupe, sans deviner son montage :
                 son épaisseur s'il est structurel, son retrait s'il est en
                 rainure. Ça se devinait à partir de `pose`, ce qui marchait par
                 accident — une tablette de meuble mobile tapait le fond. */
              ...(partageLaProfondeur ? {} : { 'meuble.degagement_fond': 1 }),
              ...(enRetrait ? { 'param.retrait_tablette_avant': 1 } : {}),
            },
            egale: 0,
          },
        )
      }
    }

    return { pieces, relations, ...(issues.length ? { issues } : {}) }
  },
}

/* ── Les séparateurs ─────────────────────────────────────────────────────────
   Un meuble en veut souvent PLUSIEURS, et pas au même endroit. Le meuble
   poubelle porte un médian FRONTAL qui divise la profondeur et fait dos aux
   deux zones, et un LATÉRAL entre les deux bacs — celui-là vivant DANS la zone
   des bacs, pas dans le meuble. Il se cote donc sur la profondeur de sa zone :
   349 pour finir à 350, l'étendue que le zonage déduit.

   Le design les LISTE — `separateurs: [{ type, zone?, repere? }]` — parce que
   c'est une décision propre au meuble et non une règle générale. La table dit
   seulement s'il y en a.

   FRONTAL : divise la profondeur. Sur un meuble ouvert des deux côtés, c'est
   lui qui fait dos commun et tient le meuble au vrillage, à la place du fond
   absent. Aucun de ses bords ne débouche : il ne porte aucun chant.
   LATÉRAL : divise la largeur. Sa rive avant donne sur la façade.

   Les deux reposent sur le bas et s'arrêtent SOUS ce qui ferme le haut, soit
   deux épaisseurs de panneau — 867 sur un meuble de 905. */
const separateurs = {
  decrit: 'les séparateurs déclarés par le design, dans le meuble ou dans une zone',
  applique({ trigramme, module, cotes, design, ferme }) {
    const declares = design?.separateurs ?? []
    if (!declares.length) return { pieces: [], relations: [] }

    const pieces = []
    const relations = []
    const issues = []

    declares.forEach((sep, i) => {
      const frontal = sep.type === 'frontal'
      if (!frontal && sep.type !== 'lateral') {
        issues.push({
          gravite: 'erreur',
          type: 'separateur-inconnu',
          message: `separateurs[${i}] : type « ${sep.type} » inconnu (frontal | lateral)`,
        })
        return
      }
      const dans = sep.zone ? contenant(sep.zone) : undefined
      const zoneVerticale = (design?.zones ?? []).find((z) => z.id === sep.zone)?.axe === 'z'
      const piece = {
        etiquette: etiquette(trigramme, module, 'SÉP', sep.repere ?? (frontal ? 'MÉDIAN' : String(i + 1))),
        role: 'SÉPARATEUR',
        orientation: frontal ? 'frontal' : 'lateral',
        // L'axe qu'il PARTAGE, par lequel les zones savent quelle épaisseur
        // retirer. Un séparateur posé DANS une zone ne partage pas le meuble.
        ...(sep.zone ? {} : { partage: frontal ? 'y' : 'x' }),
        regardeVers: frontal ? {} : { 'rive-avant': 'avant' },
      }
      pieces.push(piece)
      relations.push(
        /* Il monte du bas jusqu'à ce qui ferme le haut — sauf s'il vit dans
           une ZONE de hauteur, auquel cas c'est elle qui le borne : sous la
           tablette pleine largeur qui la ferme, et non sous le toit. */
        dans && zoneVerticale
          ? {
            nom: `${piece.etiquette}/hauteur-de-zone`,
            termes: { [v(piece.etiquette, 'z')]: 1, [`${dans}.z`]: -1 },
            egale: 0,
          }
          : bute(piece, 'z', [etiquette(trigramme, module, 'BAS'), ...(ferme ?? [])].slice(0, 2)),
        frontal
          ? entre(piece, 'x', cotes.map((c) => c.etiquette))
          : {
            nom: `${piece.etiquette}/profondeur`,
            termes: {
              [v(piece.etiquette, 'y')]: 1,
              [`${dans ?? 'meuble'}.y`]: -1,
              // Il recule de ce que le fond occupe — son épaisseur s'il est
              // structurel, son retrait s'il est en rainure. Une pièce posée
              // DANS une zone se cote sur sa zone et ne voit pas le fond.
              ...(dans ? {} : { 'meuble.degagement_fond': 1 }),
            },
            egale: 0,
          },
      )
    })

    return { pieces, relations, ...(issues.length ? { issues } : {}) }
  },
}

/* ── Le plan de travail ─────────────────────────────────────────────────────
   Le meuble poubelle en porte un — MDF 19 hydrofuge, 800 × 650, affleurant
   l'enveloppe — et aucune méthode ne le faisait exister. Il ne sortait pas
   faux : il ne sortait pas du tout, sans un mot, alors que c'est une pièce
   qu'on débite et qu'on vernit. Une pièce qui manque en silence est le même
   défaut qu'une cote fausse, vue de l'atelier.

   Il ne se cote sur rien d'autre que le hors-tout : il coiffe le meuble et
   sa position ne dépend d'aucune reprise. Sa matière, elle, n'est pas celle
   du caisson — d'où un rôle à lui dans `materiaux`. Le MDF ne se chante pas :
   c'est la matière qui le dit (`chante: false`), pas la méthode, pour qu'un
   plan en mélaminé se plaque tout seul le jour où il y en aura un. */
const planRapporte = {
  decrit: 'plan de travail rapporté, affleurant l\'enveloppe du meuble',
  applique({ trigramme, module, design }) {
    const plan = {
      etiquette: etiquette(trigramme, module, 'PLAN'),
      role: 'PLAN',
      orientation: 'horizontal',
      // Il coiffe le meuble : ses quatre bords sont dehors. Qu'on les plaque
      // ou non est une question de matière, pas de montage.
      regardeVers: {
        'about-gauche': 'gauche', 'about-droit': 'droite',
        'rive-avant': 'avant', 'rive-arriere': 'arriere',
      },
      materiau: 'plan_travail',
    }
    return { pieces: [plan], relations: [traverse(plan, 'x'), traverse(plan, 'y')] }
  },
}

/* ── Trois façons de ne rien poser, et il faut les trois ─────────────────────
   Une table doit répondre pour chaque combinaison de ses entrées, donc il faut
   savoir répondre « aucune pièce ». Mais les confondre coûte un panneau :

     `neant`       il n'y a rien à poser, et c'est normal — le meuble sans plan
                   de travail se ferme par son dessus, point.
     `signale`     il n'y a rien à poser ICI, et ça mérite un mot : le plateau
                   du bureau repose bien sur le caisson à tiroirs, mais c'est
                   le bureau qui le débite. Rien à couper, et personne ne doit
                   croire que le moteur l'a oublié.
     `hors-portee` je ne SAIS pas poser ça. Un trou, et un trou doit bloquer.

   Les deux dernières disent `pourquoi`, que la table écrit. */
const neant = {
  decrit: 'rien à poser : le cas existe et ne demande aucune pièce',
  applique: () => ({ pieces: [], relations: [] }),
}

const signale = {
  decrit: 'rien à poser ici, et la raison mérite d\'être dite',
  applique: ({ sorties }) => ({
    pieces: [],
    relations: [],
    issues: [{
      gravite: 'avertissement',
      type: 'hors-lot',
      message: sorties?.pourquoi ?? 'aucune pièce à poser pour ce cas',
    }],
  }),
}

const horsPortee = {
  decrit: 'cas connu, jamais construit ici : le moteur ne sait pas le coter',
  applique: ({ sorties }) => ({
    pieces: [],
    relations: [],
    issues: [{
      gravite: 'bloquant',
      type: 'hors-portee',
      message: sorties?.pourquoi
        ?? 'la table nomme ce cas mais aucune méthode ne sait le coter',
    }],
  }),
}

const tiroirs = {
  decrit: 'façades de tiroir se partageant la hauteur utile, corps monté sur coulisses',
  applique({ trigramme, module, design, ferme }) {
    const { combien } = compte(design?.tiroirs, 'tiroirs')

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

/* ── Le corps du tiroir ──────────────────────────────────────────────────────
   Ce sur quoi la façade se visse, et qui n'est jamais elle.

   Sa largeur perd de chaque côté l'épaisseur d'une coulisse et le jeu qu'elle
   demande — « ≥ 1 mm de jeu de chaque côté pour que les rails coulissent ».
   Sa profondeur est celle de la coulisse, pas celle du meuble : une 550 fait
   un tiroir de 550, quel que soit le caisson qui la reçoit.

   Le fond est en 6 mm dans une rainure de 7 (soit 1 mm de jeu), à 1 cm du bas.
   Le tiroir a donc, sous cette rainure, une hauteur perdue qui ne sert à rien
   — c'est pour ça que la fiche note l'espace utile à part.

   Rien ici n'est deviné : chaque cote pend à un paramètre, et un paramètre
   absent laisse une cote libre et nommée plutôt qu'un nombre plausible. */
const corpsDeTiroir = {
  decrit: 'corps de tiroir : 2 côtés, dos, montant avant, fond en rainure',
  applique({ trigramme, module, design }) {
    const { combien } = compte(design?.tiroirs, 'tiroirs')

    if (!combien) return { pieces: [], relations: [] }

    const pieces = []
    const relations = []

    for (let i = 1; i <= combien; i++) {
      const nom = (role, repere) => etiquette(trigramme, module, `T${i}`, repere ? `${role}-${repere}` : role)
      const flancs = ['G', 'D'].map((r) => ({
        etiquette: nom('CÔTÉ', r),
        role: 'TIROIR-CÔTÉ',
        orientation: 'lateral',
        // Un côté de tiroir est plus profond que haut : sa longueur court
        // dans la profondeur, à l'inverse d'un côté de caisson.
        echange: true,
      }))
      // Le MONTANT avant est fonctionnel : ce n'est pas la façade, c'est ce
      // sur quoi elle se vissera.
      const bouts = [['MONTANT', 'TIROIR-MONTANT'], ['DOS', 'TIROIR-DOS']].map(([r, role]) => ({
        etiquette: nom(r),
        role,
        orientation: 'frontal',
        echange: true,
      }))
      // Le fond est en 6 mm quand le corps est en 19 : il nomme sa matière.
      const fond = {
        etiquette: nom('FOND'), role: 'TIROIR-FOND', orientation: 'horizontal',
        materiau: 'fond_tiroir',
      }

      pieces.push(...flancs, ...bouts, fond)

      const largeurHorsTout = `${nom('CÔTÉ', 'G')}.hors_tout`
      relations.push(
        // La largeur du tiroir : l'ouverture moins deux coulisses et leur jeu.
        {
          nom: `${nom('')}/largeur-entre-coulisses`,
          termes: {
            [largeurHorsTout]: 1, 'meuble.x': -1,
            [v(etiquette(trigramme, module, 'CÔTÉ', 'G'), 'ep')]: 1,
            [v(etiquette(trigramme, module, 'CÔTÉ', 'D'), 'ep')]: 1,
            'param.ep_coulisse': 2, 'param.jeu_coulisse': 2,
          },
          egale: 0,
        },
        // Les flancs courent sur la profondeur de la coulisse.
        ...flancs.map((f) => ({
          nom: `${f.etiquette}/profondeur-de-coulisse`,
          termes: { [v(f.etiquette, 'y')]: 1, 'param.profondeur_coulisse': -1 },
          egale: 0,
        })),
        // Montant avant et dos passent ENTRE les flancs.
        ...bouts.map((b) => ({
          nom: `${b.etiquette}/entre-les-flancs`,
          termes: {
            [v(b.etiquette, 'x')]: 1, [largeurHorsTout]: -1,
            ...Object.fromEntries(flancs.map((f) => [v(f.etiquette, 'ep'), 1])),
          },
          egale: 0,
        })),
        // Toutes les pièces du corps ont la même hauteur.
        ...[...flancs, ...bouts].map((p) => ({
          nom: `${p.etiquette}/hauteur-de-tiroir`,
          termes: { [v(p.etiquette, 'z')]: 1, 'param.hauteur_tiroir': -1 },
          egale: 0,
        })),
        // Le fond, engagé dans les rainures des quatre côtés.
        {
          nom: `${fond.etiquette}/largeur-en-rainure`,
          termes: {
            [v(fond.etiquette, 'x')]: 1, [largeurHorsTout]: -1,
            ...Object.fromEntries(flancs.map((f) => [v(f.etiquette, 'ep'), 1])),
            'param.rainure_tiroir_prof': -2,
          },
          egale: 0,
        },
        {
          nom: `${fond.etiquette}/profondeur-en-rainure`,
          termes: {
            [v(fond.etiquette, 'y')]: 1, 'param.profondeur_coulisse': -1,
            ...Object.fromEntries(bouts.map((b) => [v(b.etiquette, 'ep'), 1])),
            'param.rainure_tiroir_prof': -2,
          },
          egale: 0,
        },
      )
    }
    return { pieces, relations }
  },
}

export const METHODES = {
  'dessous-ramene': dessousRamene,
  'dessous-traversant': dessousTraversant,
  'plan-rapporte': planRapporte,
  neant,
  signale,
  'hors-portee': horsPortee,
  'tiroirs-corps': corpsDeTiroir,
  'tiroirs-facades': tiroirs,
  separateurs,
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
