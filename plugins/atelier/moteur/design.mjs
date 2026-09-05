/* ── `design{}` — la source, et l'accord entre elle et ce qui en découle ─────
   Un workbook 3.0 ne porte que des cotes finies : corriger une décision y
   oblige à retrouver soi-même les cotes qui en dépendaient. Le 4.0 ajoute
   l'entrée dont elles découlent, et une signature qui dit si les deux sont
   encore d'accord.

   Ce module ne valide QUE l'enveloppe — ce qui est vrai de tout meuble :
   la famille, les paramètres, les dérogations, le journal. Le contenu propre
   à une famille (le hors-tout d'un caisson, les lames d'un claustra) est
   validé par ses méthodes, pas ici. Figer maintenant un schéma de design
   qu'aucun projet n'a encore traversé, ce serait figer une supposition. */

import { empreinte } from './empreinte.mjs'

/** Annotations : elles n'entrent dans aucun calcul, donc pas dans l'empreinte.
 *  Sans ça, corriger la formulation d'un `pourquoi` périmerait un débit juste. */
const HORS_CALCUL = ['journal', 'note', 'titre']

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Le design sans ce qui ne le fait pas calculer. */
export function partieCalculatoire(design) {
  const out = {}
  for (const [k, v] of Object.entries(design ?? {})) if (!HORS_CALCUL.includes(k)) out[k] = v
  return out
}

export const empreinteDesign = (design) => empreinte(partieCalculatoire(design))

/**
 * Lit l'enveloppe d'un design et refuse ce qui rendrait le reste indécidable.
 *
 * Rend les erreurs plutôt que de lever : un design incomplet doit pouvoir
 * s'afficher comme incomplet — c'est même le cas le plus fréquent en début
 * de projet, où la moitié des décisions ne sont pas prises.
 */
export function litDesign(design) {
  const erreurs = []
  const E = (m) => erreurs.push(`design : ${m}`)

  if (!estObjet(design)) return { design: null, erreurs: ['design : absent ou mal formé'] }

  if (typeof design.famille !== 'string' || !design.famille)
    E('`famille` manquante — c\'est elle qui décide quelles tables s\'appliquent')

  if (design.parametres !== undefined && !estObjet(design.parametres))
    E('`parametres` doit être un objet')

  if (design.derogations !== undefined) {
    if (!Array.isArray(design.derogations)) E('`derogations` doit être une liste')
    else
      design.derogations.forEach((d, i) => {
        const ou = `dérogation ${i + 1}`
        if (!estObjet(d)) return E(`${ou} : attendu un objet`)
        // Une dérogation vise une TABLE (« sur ce meuble, cette règle donne
        // autre chose ») ou une PIÈCE (« celle-ci, on n'y touche pas »). Le
        // second cas est celui d'un panneau déjà débité : la décision porte
        // sur lui seul et ne dit rien de la règle.
        if (!d.table && !d.piece) E(`${ou} : \`table\` ou \`piece\` manquante`)
        if (!d.on_fait) E(`${ou} : \`on_fait\` manquant`)
        // Le `pourquoi` n'est pas de la politesse : une dérogation sans raison
        // ne peut pas devenir la ligne de table qu'elle annonce.
        if (typeof d.pourquoi !== 'string' || d.pourquoi.trim().length < 10)
          E(`${ou} : \`pourquoi\` manquant — une dérogation sans raison ne se relit pas`)
      })
  }

  if (design.journal !== undefined) {
    if (!Array.isArray(design.journal)) E('`journal` doit être une liste')
    else
      design.journal.forEach((e, i) => {
        if (!estObjet(e) || !e.champ || !e.le) erreurs.push(`journal[${i}] : attendu { le, champ, avant, apres, pourquoi }`)
      })
  }

  return { design: erreurs.length ? null : design, erreurs }
}

/**
 * Le dérivé est-il encore d'accord avec la source ?
 *
 * Quatre états, et aucun n'est un échec : un workbook sans design est un
 * workbook d'avant le moteur, et il se dessine très bien. Ce qui serait un
 * échec, c'est de le dessiner en laissant croire qu'il a été recalculé.
 */
export function fraicheur(wb) {
  if (!estObjet(wb?.design)) return { etat: 'orphelin', raison: 'aucun design : rien à recalculer, rien à périmer' }
  const attendu = empreinteDesign(wb.design)
  const de = wb.derive?.de
  if (!de) return { etat: 'non-signe', attendu, raison: 'un design, mais aucune dérivation ne s\'en réclame' }
  if (de !== attendu) return { etat: 'perime', de, attendu, raison: 'le design a changé depuis le dernier calcul' }
  return { etat: 'frais', de, attendu }
}

/** Le bloc `derive` à écrire au terme d'un calcul. */
export const signature = (design, moteur) => ({
  de: empreinteDesign(design),
  le: new Date().toISOString(),
  moteur,
})

/**
 * Une entrée de journal — ce qui a été DÉCIDÉ, jamais ce qui en découle.
 *
 * C'est l'inverse exact de la `note` en prose qu'un workbook portait jusqu'ici
 * : celle-là racontait les conséquences, qui se recalculent, et mentait dès la
 * passe suivante. Quatre passes de correction tiennent ici en six lignes.
 */
export function journalise(design, { champ, avant, apres, pourquoi, le }) {
  if (!champ) throw new Error('journalise : `champ` requis')
  const entree = { le: le ?? new Date().toISOString(), champ, avant: avant ?? null, apres: apres ?? null }
  if (pourquoi) entree.pourquoi = pourquoi
  return { ...design, journal: [...(design.journal ?? []), entree] }
}

/**
 * 3.0 → 4.0.
 *
 * On n'invente pas de design : des pièces cotées ne disent pas les décisions
 * dont elles sont sorties, et un design deviné serait exactement la fausse
 * certitude que ce chantier existe pour supprimer. Le workbook devient donc
 * un dérivé ORPHELIN, assumé comme tel — il se dessine, il ne se recalcule pas
 * tant que personne n'a écrit sa source.
 */
export function versQuatre(wb) {
  if (wb?.schemaVersion === '4.0') return wb
  if (wb?.schemaVersion !== '3.0') throw new Error(`versQuatre : attendu du 3.0, reçu « ${wb?.schemaVersion} »`)
  return { ...wb, schemaVersion: '4.0' }
}
