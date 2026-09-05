/* ── Les zones : un caisson partagé, et des pièces qui vivent dedans ─────────
   Un séparateur ne fait pas que s'ajouter au meuble : il le PARTAGE. Le meuble
   poubelle est coupé en deux dans la profondeur — les bacs devant, les outils
   derrière — et sa tablette ne vit pas dans le meuble, elle vit dans la zone
   outils. La coter sur la profondeur du caisson donne 649 pour un espace qui
   en fait 281 : un nombre faux, plausible, et muet.

   Une zone se déclare donc dans le design, et les pièces s'y ancrent. Le reste
   suit tout seul : un ancrage prend un CONTENANT, le meuble par défaut, une
   zone sinon — une pièce dans une zone se cote exactement comme une pièce dans
   un meuble.

   Ce qu'on ne déclare pas : la dernière étendue. Les zones d'un même axe et
   les séparateurs qui les séparent remplissent le meuble, ce qui fait une
   relation linéaire — donc le solveur la rend, et une zone de trop ou de trop
   peu se voit au lieu de se compenser en silence. Sur le meuble poubelle :
   350 de bacs + 19 de séparateur + le reste = 650, donc 281 pour les outils,
   ce que le meuble construit porte effectivement. */

/** `zone:outils.y` — l'étendue d'une zone, dans le repère du meuble. */
export const z = (id, axe) => `zone:${id}.${axe}`

/** Le nom de contenant qu'un ancrage attend. */
export const contenant = (id) => `zone:${id}`

/**
 * Les relations qui donnent son étendue à chaque zone.
 *
 * Une zone porte son `etendue` quand elle est décidée ; celle qui ne la porte
 * pas prend ce qui reste. Deux zones sans étendue sur le même axe laissent le
 * système sous-déterminé — et le solveur le nomme, plutôt que d'en inventer
 * une.
 */
export function relationsDesZones(design, separateurs = []) {
  const zones = design?.zones ?? []
  if (!zones.length) return []

  const relations = []
  const parAxe = new Map()
  for (const zone of zones) {
    if (!parAxe.has(zone.axe)) parAxe.set(zone.axe, [])
    parAxe.get(zone.axe).push(zone)
    if (zone.etendue !== undefined) {
      relations.push({
        nom: `zone/${zone.id}-etendue`,
        termes: { [z(zone.id, zone.axe)]: 1 },
        egale: zone.etendue,
      })
    }
  }

  // Les zones d'un axe, plus les séparateurs qui les séparent, font le meuble.
  for (const [axe, lot] of parAxe) {
    const cloisons = separateurs.filter((s) => s.axe === axe)
    relations.push({
      nom: `zones/${axe}-remplissent-le-meuble`,
      termes: {
        ...Object.fromEntries(lot.map((zone) => [z(zone.id, axe), 1])),
        ...Object.fromEntries(cloisons.map((s) => [`${s.etiquette}.ep`, 1])),
        [`meuble.${axe}`]: -1,
      },
      egale: 0,
    })
  }
  return relations
}

/**
 * La zone d'une pièce, si elle en a une.
 *
 * Rendre `undefined` plutôt que « meuble » est délibéré : l'appelant doit
 * distinguer « cette pièce tient tout le meuble » de « cette pièce est dans une
 * zone », et le second cas ne se devine pas.
 */
export const zoneDe = (declare) => {
  if (typeof declare === 'string') return declare
  return declare?.zone
}

/** Ce qu'un design déclare de travers sur ses zones. */
export function litZones(design) {
  const zones = design?.zones ?? []
  const erreurs = []
  const vus = new Set()
  for (const [i, zone] of zones.entries()) {
    const ou = `zones[${i}]`
    if (!zone?.id) { erreurs.push(`${ou} : \`id\` manquant`); continue }
    if (vus.has(zone.id)) erreurs.push(`${ou} : zone « ${zone.id} » déclarée deux fois`)
    vus.add(zone.id)
    if (!['x', 'y', 'z'].includes(zone.axe))
      erreurs.push(`${ou} : \`axe\` doit être x, y ou z (reçu « ${zone.axe} »)`)
  }
  return { zones, erreurs }
}
