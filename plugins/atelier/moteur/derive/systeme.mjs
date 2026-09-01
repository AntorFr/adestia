/* ── Les cotes comme un système de relations, pas comme des soustractions ────
   Une formule dit un SENS de calcul : `cote.h = H - bas.ep`. Une relation ne
   dit qu'un fait : `cote.h + bas.ep == H`. La différence n'est pas de style —
   une soustraction écrite deux fois donne un nombre plausible (832 au lieu de
   851, arrivé pour de vrai), là où poser deux fois le même fait rend le
   système contradictoire et se refuse.

   POURQUOI GAUSS ET PAS CASSOWARY. Le plan disait « porter Cassowary ». En
   l'écrivant, un point a retourné l'arbitrage : Cassowary ne détecte PAS le
   sous-contraint. Il choisit une valeur, sans se plaindre — c'est-à-dire
   exactement le mode d'échec qu'on veut supprimer, une cote manquante qui
   ressort en nombre plausible. Il aurait fallu le doubler d'un compteur de
   degrés de liberté approché, par perturbation.

   Or les relations de menuiserie sont des ÉGALITÉS linéaires, et une
   élimination de Gauss les résout exactement — en donnant par construction ce
   que Cassowary ne donne pas : le rang, donc les degrés de liberté EXACTS, et
   le nom des cotes que rien ne détermine. C'est le « fully constrained » d'un
   logiciel de CAO, obtenu sans approximation et en cent cinquante lignes.

   Ce qui reste dehors : les inégalités et les priorités (« trois tiroirs
   d'égale hauteur » en préférence). Le jour où un projet en demande, le
   simplexe s'ajoute par-dessus — le catalogue de relations, lui, ne bouge pas.

   Incrémental, comme Cassowary et pour la même raison : une relation qui
   contredit les précédentes est refusée À SON AJOUT, donc on sait laquelle. */

const EPS = 1e-9

/** Σ coefficients × variables == constante, sous un nom qui se relit. */
export const relation = (nom, termes, egale) => ({ nom, termes, egale })

/**
 * Un système qu'on remplit relation par relation.
 *
 * Chaque ligne conservée est maintenue sous forme échelonnée réduite, et
 * retient de QUELLES relations elle est faite : c'est ce qui permet de dire
 * « celle-ci contredit celles-là » plutôt que « système infaisable ».
 */
export function systeme() {
  const lignes = [] // { pivot, coef: Map, egale, origines: [nom] }

  /** Réduit une relation par les lignes déjà posées. */
  const reduit = (termes, egale) => {
    const coef = new Map(Object.entries(termes).filter(([, c]) => Math.abs(c) > EPS))
    let cst = egale
    const origines = []
    for (const l of lignes) {
      const f = coef.get(l.pivot)
      if (f === undefined || Math.abs(f) < EPS) continue
      // La ligne vaut « pivot + Σ coef·v = egale » : lui soustraire f fois
      // annule le pivot, en plus de corriger les autres termes.
      coef.delete(l.pivot)
      for (const [v, c] of l.coef) {
        const n = (coef.get(v) ?? 0) - f * c
        if (Math.abs(n) < EPS) coef.delete(v)
        else coef.set(v, n)
      }
      cst -= f * l.egale
      origines.push(...l.origines)
    }
    return { coef, cst, origines }
  }

  return {
    /**
     * Pose une relation. Trois issues, et aucune n'est un silence :
     * elle apporte quelque chose, elle est redondante, ou elle contredit.
     */
    pose({ nom, termes, egale }) {
      const { coef, cst, origines } = reduit(termes, egale)

      if (coef.size === 0) {
        if (Math.abs(cst) > EPS)
          return {
            ok: false,
            raison: 'contradiction',
            nom,
            avec: [...new Set(origines)],
            message: `« ${nom} » contredit ${[...new Set(origines)].map((o) => `« ${o} »`).join(', ')}`,
          }
        // Vraie information : une règle qui n'apporte rien est une règle que
        // quelqu'un croit appliquer.
        return { ok: true, redondante: true, nom, avec: [...new Set(origines)] }
      }

      // Pivot sur le plus gros coefficient — la stabilité numérique se paie ici
      // ou se paie en cotes fausses au millimètre près.
      let pivot = null
      let max = 0
      for (const [v, c] of coef)
        if (Math.abs(c) > max) { max = Math.abs(c); pivot = v }

      const norme = new Map()
      for (const [v, c] of coef) if (v !== pivot) norme.set(v, c / coef.get(pivot))
      const ligne = { pivot, coef: norme, egale: cst / coef.get(pivot), origines: [...origines, nom] }

      // Éliminer le nouveau pivot des lignes déjà posées (Gauss-Jordan) :
      // c'est ce qui rend la lecture des valeurs immédiate à la fin.
      for (const l of lignes) {
        const f = l.coef.get(pivot)
        if (f === undefined || Math.abs(f) < EPS) continue
        l.coef.delete(pivot)
        for (const [v, c] of norme) {
          const n = (l.coef.get(v) ?? 0) - f * c
          if (Math.abs(n) < EPS) l.coef.delete(v)
          else l.coef.set(v, n)
        }
        l.egale -= f * ligne.egale
        l.origines = [...new Set([...l.origines, nom])]
      }

      lignes.push(ligne)
      return { ok: true, nom }
    },

    /** Fixe une cote comme une relation ordinaire — c'est ce qui la rend refusable. */
    fixe(nom, variable, valeur) {
      return this.pose({ nom, termes: { [variable]: 1 }, egale: valeur })
    },

    /**
     * Les valeurs, et surtout ce qui n'en a pas.
     *
     * Une cote libre n'est PAS rendue avec une valeur choisie au hasard : elle
     * est nommée. Une formule oubliée laisse un champ vide et ça se voit ; une
     * relation oubliée produirait un nombre, et c'est ce qu'on refuse.
     */
    resout(variables = []) {
      const toutes = new Set(variables)
      for (const l of lignes) { toutes.add(l.pivot); for (const v of l.coef.keys()) toutes.add(v) }

      const determinees = new Map()
      const libres = []
      for (const l of lignes) if (l.coef.size === 0) determinees.set(l.pivot, l.egale)
      for (const v of toutes)
        if (!determinees.has(v)) libres.push(v)

      return {
        valeurs: Object.fromEntries([...determinees].map(([v, x]) => [v, arrondi(x)])),
        libres: libres.sort(),
        rang: lignes.length,
        variables: toutes.size,
        /** Zéro degré de liberté = tout est déterminé. Le bleu de la CAO. */
        contraint: libres.length === 0 && toutes.size > 0,
      }
    },

    /** De quelles relations une cote tient sa valeur — la provenance, en donnée. */
    origineDe(variable) {
      const l = lignes.find((x) => x.pivot === variable && x.coef.size === 0)
      return l ? [...new Set(l.origines)] : []
    },
  }
}

/** Les cotes se coupent au dixième ; le bruit du flottant n'a rien à y faire. */
const arrondi = (x) => Math.round(x * 1e6) / 1e6
