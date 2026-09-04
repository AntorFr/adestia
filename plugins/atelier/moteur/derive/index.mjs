/* ── La dérivation : d'un design à des pièces cotées ─────────────────────────
   Le pipeline, et il tient en cinq temps : monter le socle du caisson,
   interroger chaque table applicable, appliquer les méthodes qu'elles
   nomment, résoudre, dire ce qui manque.

   Ce qu'il ne fait jamais : choisir à la place de quelqu'un. Une table qui ne
   trouve pas son fait dans le design, une méthode inconnue, une cote que rien
   ne détermine — tout cela remonte en issue nommée, et rien n'est rempli au
   jugé. C'est la règle qui donne son prix au reste : un plan qui se tait sur
   ce qu'il ignore vaut moins qu'un plan qui refuse de conclure. */

import { choisit, pourFamille } from '../tables.mjs'
import { applique } from '../modele/methodes.mjs'
import { constante, etiquette, relationsDOrientation, relationsDuMeuble, traverse, v } from '../modele/ancrages.mjs'
import { lineaireDeChant, retraitsDe } from '../modele/chants.mjs'
import { chantsRetenus, ecartsAuDefaut } from '../modele/visibilite.mjs'
import { systeme } from './systeme.mjs'

const issue = (gravite, type, message, plus = {}) => ({ gravite, type, message, ...plus })

/**
 * Le socle d'un caisson : ce qui existe avant toute décision.
 *
 * Un bas qui porte et deux côtés qui reposent dessus — c'est le montage retenu
 * ici, et il est explicite plutôt que sous-entendu : le dessous reprend la
 * charge, donc il traverse. Ce qui reste ouvert, c'est ce que fait le HAUT du
 * côté, et c'est une table qui le décide.
 */
function socle(trigramme, module) {
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
    relations: [traverse(bas, 'x'), traverse(bas, 'y'), ...cotes.map((c) => traverse(c, 'y'))],
    bas,
    cotes,
  }
}

/**
 * Ce que le moteur COMPTE pour les tables, à partir de ce que le design dit.
 *
 * `mutualise` : assez de pièces partagent-elles un même réglage pour qu'une
 * largeur de refente de plus ne coûte rien ? C'est la seule chose qui fasse
 * renoncer à un retrait de tablette, donc c'est elle qu'il faut compter. Le
 * seuil est un paramètre — un arbitrage d'atelier, pas une constante.
 */
export function faitsDerives(design) {
  const total = (design.tablettes ?? 0) * (design.modules_identiques ?? 1)
  const seuil = design.parametres?.seuil_mutualisation ?? 3
  return { tablettes_totales: total, mutualise: total >= seuil ? 'oui' : 'non' }
}

/** La matière d'une pièce : celle que la table a dite, ou celle du caisson. */
const matiereDe = (piece, sorties, design) => {
  const dit = sorties?.[piece.etiquette]
  const nom = dit?.materiau ?? (dit?.epaisseur !== undefined && dit.epaisseur !== 'caisson' ? null : 'principal')
  const mat = nom ? design.materiaux?.[nom] : undefined
  return {
    ep: dit?.epaisseur !== undefined && dit.epaisseur !== 'caisson' ? dit.epaisseur : mat?.ep,
    // On ne chante que le panneau décoratif : le MDF et le massif se
    // finissent autrement, et une bande n'y couvrirait rien.
    chante: mat?.chante ?? design.materiaux?.principal?.chante ?? true,
  }
}

/**
 * Dérive un design en pièces cotées.
 *
 * `tables` est passé plutôt que lu : le moteur ne va chercher aucun fichier
 * lui-même — les tables viennent de la mémoire, et qui les charge est une
 * question de transport, pas de calcul.
 */
export function derive(design, tables, moduleDemande) {
  const issues = []
  const journal = []
  const s = systeme()
  const refuses = []
  const pose = (r) => {
    const x = s.pose(r)
    if (!x.ok) { refuses.push(x); issues.push(issue('erreur', 'contradiction', x.message, { relation: x.nom, avec: x.avec })) }
    return x
  }

  const trigramme = design.trigramme ?? 'XXX'
  // Le module vient du design : un projet numérote ses caissons comme il veut
  // (`C1` sur le meuble poubelle), et une étiquette qui ne correspond pas à
  // celles déjà écrites rend toute comparaison illisible.
  const module = moduleDemande ?? design.module ?? 'A1'
  const { pieces: duSocle, relations: relSocle, cotes } = socle(trigramme, module)
  const pieces = [...duSocle]
  const relations = [...relSocle]
  const parEtiquette = {}

  /* Des faits DÉRIVÉS, calculés avant d'interroger les tables.
     Une table ne porte que des domaines énumérés — un seuil dans une cellule
     serait une cellule qui calcule, et une cellule qui calcule ne se relit
     plus. Mais certaines décisions dépendent d'un COMPTE.

     Celle du retrait de tablette en est une. Le retrait est le DÉFAUT — une
     planche qui ressort d'un millimètre ne ressort pas — et on n'y renonce
     que pour une raison : il coûte une largeur de refente de plus, ce qui ne
     se justifie pas pour une ou deux tablettes. Neuf tablettes réparties en
     trois meubles identiques partagent le même réglage, et il ne coûte plus
     rien.

     Le moteur compte donc, et la table décide sur le compte. */
  const faits = { ...design, ...faitsDerives(design) }
  const { retenues, ecartees } = pourFamille(tables, design.famille)

  for (const table of retenues) {
    const verdict = choisit(table, faits)
    if (verdict.erreur) {
      // Un fait absent du design n'est pas une panne : c'est une décision qui
      // n'a pas été prise, et elle doit se voir jusqu'à ce qu'elle le soit.
      issues.push(issue('bloquant', 'non-tranche', verdict.erreur, { table: table.id }))
      continue
    }
    /* Une DÉROGATION passe après la table et remplace ce qu'elle nomme.
       Le dressing en porte une : ses tablettes reculent de 3 mm alors que la
       règle dit qu'une façade ouverte n'a rien à dégager — « pas de porte ici,
       mais Monsieur veut quand même 3 mm ». Sans ce mécanisme il faudrait
       mentir à la table (déclarer des portes qui n'existent pas) pour obtenir
       la bonne cote, et le meuble suivant hériterait du mensonge. */
    const deroge = (design.derogations ?? []).filter((x) => x.table === table.id)
    const alors = deroge.reduce((acc, x) => ({ ...acc, ...(x.on_fait ?? {}) }), verdict.alors)

    journal.push({
      table: verdict.table,
      ligne: verdict.ligne,
      methode: alors.methode ?? null,
      ...(deroge.length ? { deroge: deroge.map((x) => x.pourquoi) } : {}),
    })

    const ou = `${verdict.table} ligne ${verdict.ligne}`
    // Les SORTIES de la table voyagent avec la méthode : une table peut dire
    // « tablette, en retrait » sans qu'il faille un nom de méthode par
    // combinaison — c'est ce qui garde le registre lisible.
    const r = applique(alors.methode, { trigramme, module, cotes, design, sorties: alors }, ou)
    if (r.erreur) { issues.push(issue('erreur', 'methode-inconnue', r.erreur, { table: table.id })); continue }
    for (const p of r.pieces) parEtiquette[p.etiquette] = alors
    pieces.push(...r.pieces)
    relations.push(...r.relations)
  }

  // Le hors-tout et les paramètres sont posés comme des relations ordinaires :
  // un paramètre absent laisse donc une cote libre, au lieu d'un défaut muet.
  for (const r of relationsDuMeuble(design.hors_tout ?? {})) pose(r)
  for (const [nom, valeur] of Object.entries(design.parametres ?? {}))
    pose(constante(`parametre/${nom}`, `param.${nom}`, valeur))

  // Les faces qu'on regarde décident des chants ; le projet garde le dernier
  // mot, pièce par pièce — on chante parfois un bord invisible pour n'avoir
  // qu'un réglage de bande à faire.
  const matieres = new Map(pieces.map((p) => [p.etiquette, matiereDe(p, parEtiquette, design)]))
  const chants = chantsRetenus(
    pieces.map((p) => ({ ...p, chante: matieres.get(p.etiquette).chante })),
    design.faces_chantees ?? [],
    design.chants ?? {},
  )

  for (const piece of pieces) {
    const { ep } = matieres.get(piece.etiquette)
    if (ep !== undefined) pose(constante(`materiau/ep-${piece.etiquette}`, v(piece.etiquette, 'ep'), ep))
    // Les ancrages posent des cotes FINIES ; le retrait ne dépend donc que des
    // chants de la pièce, jamais de la façon dont elle tient.
    const retraits = retraitsDe(piece, chants[piece.etiquette], design.parametres?.retrait_chant)
    for (const r of relationsDOrientation(piece, retraits)) pose(r)
  }
  for (const r of relations) pose(r)

  const { valeurs, libres, contraint } = s.resout()

  for (const l of libres)
    issues.push(issue('bloquant', 'cote-libre', `${l} : aucune règle ne la détermine`, { variable: l }))

  const cotees = pieces.map((p) => ({
    etiquette: p.etiquette,
    role: p.role,
    longueur: valeurs[v(p.etiquette, 'longueur')],
    largeur: valeurs[v(p.etiquette, 'largeur')],
    ep: valeurs[v(p.etiquette, 'ep')],
    chants: chants[p.etiquette] ?? [],
    de: s.origineDe(v(p.etiquette, 'longueur')),
  }))

  return {
    journal,
    chant: lineaireDeChant(cotees, chants),
    // Ce que le projet fait dire à ses chants au-delà des faces chantées :
    // un côté plaqué bien qu'invisible, pour ne régler la bande qu'une fois.
    ecartsChant: ecartsAuDefaut(pieces, design.faces_chantees ?? [], design.chants ?? {}),
    ecartees: ecartees.map((t) => t.id),
    issues,
    libres,
    contraint,
    refuses,
    pieces: cotees,
  }
}

/** Les issues qui doivent arrêter une coupe. */
export const bloquantes = (issues) => issues.filter((i) => i.gravite !== 'avertissement')
