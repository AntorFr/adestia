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

/** L'épaisseur d'une pièce : celle que la table a dite, ou celle du caisson. */
const epaisseurDe = (piece, sorties, design) => {
  const dit = sorties?.[piece.etiquette]?.epaisseur
  if (dit === undefined || dit === 'caisson') return design.materiaux?.principal?.ep
  return dit
}

/**
 * Dérive un design en pièces cotées.
 *
 * `tables` est passé plutôt que lu : le moteur ne va chercher aucun fichier
 * lui-même — les tables viennent de la mémoire, et qui les charge est une
 * question de transport, pas de calcul.
 */
export function derive(design, tables, module = 'A1') {
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
  const { pieces: duSocle, relations: relSocle, cotes } = socle(trigramme, module)
  const pieces = [...duSocle]
  const relations = [...relSocle]
  const parEtiquette = {}

  const { retenues, ecartees } = pourFamille(tables, design.famille)

  for (const table of retenues) {
    const verdict = choisit(table, design)
    if (verdict.erreur) {
      // Un fait absent du design n'est pas une panne : c'est une décision qui
      // n'a pas été prise, et elle doit se voir jusqu'à ce qu'elle le soit.
      issues.push(issue('bloquant', 'non-tranche', verdict.erreur, { table: table.id }))
      continue
    }
    journal.push({ table: verdict.table, ligne: verdict.ligne, methode: verdict.alors.methode ?? null })

    const ou = `${verdict.table} ligne ${verdict.ligne}`
    const r = applique(verdict.alors.methode, { trigramme, module, cotes, design }, ou)
    if (r.erreur) { issues.push(issue('erreur', 'methode-inconnue', r.erreur, { table: table.id })); continue }
    for (const p of r.pieces) parEtiquette[p.etiquette] = verdict.alors
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
  const chants = chantsRetenus(pieces, design.visible ?? [], design.chants ?? {})

  for (const piece of pieces) {
    const ep = epaisseurDe(piece, parEtiquette, design)
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
    // Ce que le projet fait dire à ses chants au-delà des faces regardées :
    // un côté plaqué bien qu'invisible, pour ne régler la bande qu'une fois.
    ecartsChant: ecartsAuDefaut(pieces, design.visible ?? [], design.chants ?? {}),
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
