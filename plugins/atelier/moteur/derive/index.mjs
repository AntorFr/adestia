/* ── La dérivation : d'un design à des pièces cotées ─────────────────────────
   Le pipeline, et il tient en cinq temps : monter le squelette de la famille,
   interroger chaque table applicable, appliquer les méthodes qu'elles
   nomment, résoudre, dire ce qui manque.

   Ce qu'il ne fait jamais : choisir à la place de quelqu'un. Une table qui ne
   trouve pas son fait dans le design, une méthode inconnue, une cote que rien
   ne détermine — tout cela remonte en issue nommée, et rien n'est rempli au
   jugé. C'est la règle qui donne son prix au reste : un plan qui se tait sur
   ce qu'il ignore vaut moins qu'un plan qui refuse de conclure. */

import { choisit, pourFamille } from '../tables.mjs'
import { applique } from '../modele/methodes.mjs'
import { compte, constante, etiquette, relationsDOrientation, relationsDuMeuble, traverse, v } from '../modele/ancrages.mjs'
import { lineaireDeChant, retraitsDe } from '../modele/chants.mjs'
import { chantsRetenus, ecartsAuDefaut } from '../modele/visibilite.mjs'
import { RESULTATS, squelette } from '../modele/familles.mjs'
import { litZones, relationsDesZones } from '../modele/zones.mjs'
import { systeme } from './systeme.mjs'

const issue = (gravite, type, message, plus = {}) => ({ gravite, type, message, ...plus })

/* Les champs du design qui portent un COMPTE de pièces.
   Chacun était lu à la main, et pas de la même façon : `tablettes` acceptait
   `{ nombre }`, `lames`, `traverses` et `tiroirs` non. Un claustra déclaré
   `lames: { nombre: 6 }` sortait donc à deux pièces au lieu de dix, sans un
   mot — `Array.from({ length: undefined })` rend un tableau vide.

   Le contrôle vit ici plutôt que dans les méthodes : une méthode qui ne tourne
   pas ne dit rien, et un compte illisible doit se voir même quand aucune table
   ne réclame la pièce qu'il compte. */
const COMPTES = ['tablettes', 'tiroirs', 'lames', 'traverses']


/* Les pièces que le design ANNONCE, et que quelqu'un doit donc poser.
   Une pièce qu'aucune méthode ne pose ne laisse aucune trace : pas de cote
   libre, pas de contradiction, un débit complet et entièrement contraint. Il
   ne manque qu'un panneau, et rien ne le dit.

   Le défaut trouvé en s'en servant : un meuble déclarait son plan de travail
   en MDF, aucune table du projet ne décidait du plan, et la dérivation sortait
   identique avec et sans la déclaration. Le silence ne portait plus sur une
   cote mais sur la RÈGLE qui aurait dû la produire — pire, parce qu'une cote
   absente se voit au moment de couper et qu'une règle absente ne se voit
   jamais.

   Chaque ligne dit : à quoi on reconnaît, DANS LE DESIGN, que la pièce doit
   exister. Pas dans les tables — c'est justement leur absence qu'on cherche. */
const ANNONCEES = [
  {
    role: 'FOND',
    dit: (d) => d.fond === 'oui',
    quoi: '`fond: "oui"` annonce un fond',
  },
  {
    role: 'PLAN',
    // Le meuble doit en porter un ET le débiter : `plan_travail: "aucun"` avec
    // du MDF dans la palette du projet n'annonce rien du tout.
    dit: (d) => d.plan_travail !== 'aucun' && Boolean(d.materiaux?.plan_travail),
    quoi: '`materiaux.plan_travail` déclaré annonce un plan de travail à débiter',
  },
  {
    role: 'TIROIR-CÔTÉ',
    dit: (d) => (d.tiroirs ?? 0) > 0 && d.corps_tiroir === 'oui',
    quoi: '`corps_tiroir: "oui"` annonce des corps de tiroir',
  },
]

/**
 * Ce que le moteur COMPTE pour les tables, à partir de ce que le design dit.
 *
 * `mutualise` : assez de pièces partagent-elles un même réglage pour qu'une
 * largeur de refente de plus ne coûte rien ? C'est la seule chose qui fasse
 * renoncer à un retrait de tablette, donc c'est elle qu'il faut compter. Le
 * seuil est un paramètre — un arbitrage d'atelier, pas une constante.
 */
export function faitsDerives(design) {
  const { combien: tablettes } = compte(design.tablettes, 'tablettes')
  const total = tablettes * (design.modules_identiques ?? 1)
  const seuil = design.parametres?.seuil_mutualisation ?? 3
  return {
    tablettes_totales: total,
    mutualise: total >= seuil ? 'oui' : 'non',
    // Le design LISTE ses séparateurs ; la table ne décide que s'il y en a.
    a_des_separateurs: (design.separateurs ?? []).length ? 'oui' : 'non',
    /* Un plan de travail repose sur beaucoup de meubles ; il n'appartient pas
       à tous. Le plateau du bureau repose sur le caisson à tiroirs et c'est le
       bureau qui le fournit, alors que le MDF du meuble poubelle est débité
       avec lui. Ce qui les sépare est déjà écrit : un meuble qui débite son
       plan dit en quoi il est. */
    plan_au_debit: design.materiaux?.plan_travail ? 'oui' : 'non',
  }
}

/** La matière d'une pièce : celle que la table a dite, ou celle du caisson. */
const matiereDe = (piece, sorties, design) => {
  // Une PIÈCE peut nommer sa matière : un fond de tiroir est en 6 mm dans un
  // caisson en 19, et ce n'est pas la table qui le décide — c'est la méthode
  // qui pose la pièce, parce qu'elle seule sait de quoi elle est faite.
  if (piece.materiau) {
    const mat = design.materiaux?.[piece.materiau]
    return { id: mat?.id, ep: mat?.ep, chante: mat?.chante ?? design.materiaux?.principal?.chante ?? true }
  }
  const dit = sorties?.[piece.etiquette]
  const nom = dit?.materiau ?? (dit?.epaisseur !== undefined && dit.epaisseur !== 'caisson' ? null : 'principal')
  const mat = nom ? design.materiaux?.[nom] : undefined
  return {
    id: mat?.id,
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

  for (const champ of COMPTES) {
    const { erreur } = compte(design[champ], champ)
    if (erreur) issues.push(issue('bloquant', 'compte-illisible', erreur, { champ }))
  }

  const trigramme = design.trigramme ?? 'XXX'
  // Le module vient du design : un projet numérote ses caissons comme il veut
  // (`C1` sur le meuble poubelle), et une étiquette qui ne correspond pas à
  // celles déjà écrites rend toute comparaison illisible.
  const module = moduleDemande ?? design.module ?? 'A1'
  /* Le squelette dépend de la FAMILLE. Il était écrit en dur — un bas et deux
     côtés quoi qu'on demande — alors que les tables, elles, savaient déjà de
     quelle famille elles parlent. Un claustra passait donc au travers : ses
     tables écartées proprement, et le moteur réclamant quand même un bas. */
  const { pieces: duSocle, relations: relSocle, cotes, erreur: familleInconnue } =
    squelette(design.famille, trigramme, module, design)
  if (familleInconnue) issues.push(issue('bloquant', 'famille-inconnue', familleInconnue))
  const pieces = [...duSocle]
  const relations = [...relSocle]
  const parEtiquette = {}
  /* Ce qui ferme le haut du caisson, déclaré par la méthode qui l'a posé et
     passé aux suivantes : un séparateur bute dessous et ne peut pas deviner
     si c'est un dessus plein ou deux traverses. */
  let ferme = []
  /* Ce que les méthodes déclarent MASQUER : un fond cache l'arrière de tout ce
     qui est devant lui, sauf des pièces qui le bordent et restent dehors. */
  const occultations = []

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
    const r = applique(alors.methode, { trigramme, module, cotes, design, sorties: alors, ferme }, ou)
    if (r.erreur) { issues.push(issue('erreur', 'methode-inconnue', r.erreur, { table: table.id })); continue }
    // Une méthode peut savoir qu'elle ne sait PAS. Mieux vaut qu'elle le dise
    // que de poser une relation fausse : une cote absente se voit, une cote
    // fausse et plausible ne se voit pas.
    for (const i of r.issues ?? []) issues.push(issue(i.gravite ?? 'bloquant', i.type ?? 'hors-portee', i.message, i))
    for (const p of r.pieces) parEtiquette[p.etiquette] = alors
    if (r.ferme) ferme = r.ferme
    if (r.occulte) occultations.push(r.occulte)
    pieces.push(...r.pieces)
    relations.push(...r.relations)
  }

  /* Pas de fond, rien à dégager. C'est un FAIT tiré des pièces sorties, pas un
     défaut de commodité : si une méthode de fond a répondu, c'est elle qui pose
     la grandeur, et celle-ci n'est jamais choisie par le pipeline. */
  if (!pieces.some((p) => p.role === 'FOND'))
    pose({ nom: 'meuble/aucun-fond-a-degager', termes: { 'meuble.degagement_fond': 1 }, egale: 0 })

  // Le hors-tout et les paramètres sont posés comme des relations ordinaires :
  // un paramètre absent laisse donc une cote libre, au lieu d'un défaut muet.
  for (const r of relationsDuMeuble(design.hors_tout ?? {})) pose(r)

  // Les ZONES : un caisson partagé par un séparateur, et des pièces qui
  // vivent dedans plutôt que dans le meuble entier.
  const { erreurs: malZonees } = litZones(design)
  for (const e of malZonees) issues.push(issue('erreur', 'zone-mal-formee', e))
  const cloisons = pieces
    .filter((p) => p.partage)
    .map((p) => ({ etiquette: p.etiquette, axe: p.partage }))
  /* Ce qui BORNE le meuble sur chaque axe, et que les zones ne peuvent pas
     occuper : sur la largeur, les deux côtés. */
  const bornes = { x: cotes.map((c) => v(c.etiquette, 'ep')) }
  for (const r of relationsDesZones(design, cloisons, bornes)) pose(r)
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
    occultations,
  )

  /* Une pièce peut refuser de rendre d'avance ce que sa bande ajoutera : le
     chant se pose alors EN SURÉPAISSEUR et la pièce déborde. Ce n'est jamais
     le défaut — c'est ce qu'on décide devant un panneau déjà débité, quand
     reprendre la pièce qui tient l'équerrage coûterait plus cher qu'un
     millimètre visible. La décision porte sur cette pièce-là et ne dit rien
     de la règle, d'où une dérogation de PIÈCE et non de table. */
  const surepaisseur = new Set(
    (design.derogations ?? [])
      .filter((x) => x.piece && x.on_fait?.compense_chant === 'non')
      .map((x) => x.piece),
  )

  for (const piece of pieces) {
    const { ep } = matieres.get(piece.etiquette)
    if (ep !== undefined) pose(constante(`materiau/ep-${piece.etiquette}`, v(piece.etiquette, 'ep'), ep))
    // Les ancrages posent des cotes FINIES ; le retrait ne dépend donc que des
    // chants de la pièce, jamais de la façon dont elle tient.
    const retraits = surepaisseur.has(piece.etiquette)
      ? { longueur: 0, largeur: 0 }
      : retraitsDe(piece, chants[piece.etiquette], design.parametres?.retrait_chant)
    for (const r of relationsDOrientation(piece, retraits)) pose(r)
  }
  for (const r of relations) pose(r)

  /* Ce que le design annonce et que personne n'a posé : il manque une RÈGLE,
     et son absence ne laisse aucune autre trace. */
  const roles = new Set(pieces.map((p) => p.role))
  for (const { role, dit, quoi } of ANNONCEES) {
    if (!dit(design) || roles.has(role)) continue
    issues.push(issue(
      'bloquant',
      'piece-annoncee-absente',
      `${quoi}, et aucune méthode n'en pose : il manque la table qui décide `
      + `de cette pièce. Le débit sortirait complet et faux — sans ${role}, `
      + 'et sans rien qui le signale.',
      { role },
    ))
  }

  const { valeurs, libres, contraint } = s.resout()

  for (const l of libres)
    issues.push(issue('bloquant', 'cote-libre', `${l} : aucune règle ne la détermine`, { variable: l }))

  const cotees = pieces.map((p) => ({
    etiquette: p.etiquette,
    role: p.role,
    longueur: valeurs[v(p.etiquette, 'longueur')],
    largeur: valeurs[v(p.etiquette, 'largeur')],
    ep: valeurs[v(p.etiquette, 'ep')],
    // L'id de la matière, pas seulement son épaisseur : c'est par lui que le
    // calepinage sait sur quelle plaque une pièce se débite.
    ...(matieres.get(p.etiquette).id ? { materiau: matieres.get(p.etiquette).id } : {}),
    chants: chants[p.etiquette] ?? [],
    ...(surepaisseur.has(p.etiquette) ? { chant_en_surepaisseur: true } : {}),
    de: s.origineDe(v(p.etiquette, 'longueur')),
  }))

  return {
    journal,
    // Les étendues résolues : une zone déduite est un résultat en soi, et
    // c'est ce qu'on regarde quand une pièce sort à une cote surprenante.
    zones: Object.fromEntries((design.zones ?? []).map((zn) =>
      [zn.id, valeurs[`zone:${zn.id}.${zn.axe}`]])),
    /* Ce qu'une famille DÉDUIT au-delà de ses pièces : le jour entre deux
       lames d'un claustra ne se déclare pas, il tombe de la largeur — et c'est
       ce qu'on regarde sur le plan de perçage. */
    ...(RESULTATS[design.famille]
      ? { resultats: Object.fromEntries(RESULTATS[design.famille]
          .map((nom) => [nom.split('.').pop(), valeurs[nom]])) }
      : {}),
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
