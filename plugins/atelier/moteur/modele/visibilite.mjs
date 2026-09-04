/* ── Quels bords se chantent : ceux qui débouchent sur une face regardée ─────
   On ne chante pas tout : on chante ce qui se verra. Un meuble à roulettes
   montre son dos à chaque déplacement, un meuble fixe contre un mur jamais,
   et deux meubles accolés ne montrent pas leurs côtés joints.

   La règle vaut pour le dedans comme pour le dehors, et c'est ce qui la rend
   simple : **un bord se chante s'il est TOURNÉ VERS une face regardée et que
   rien ne l'occulte.**

   Le critère est le regard, jamais la géométrie. Une tablette EN RETRAIT de
   quelques millimètres se chante exactement comme une tablette affleurante :
   son bord avant est tourné vers l'avant et rien ne le cache, le retrait n'y
   change rien. À l'inverse, la rive arrière de la traverse avant est tournée
   vers l'arrière et a tout le meuble derrière elle : brute. Les abouts de la
   traverse arrière sont bouchés par les côtés : bruts. Les bords d'un fond en
   rainure sont pris dedans : bruts.

   (Une version antérieure disait « débouche sur une face », ce qui suggérait
   d'atteindre le nu du meuble — et aurait fait rater le chant d'une tablette
   en retrait, qui est pourtant ce qu'on regarde le plus dans un meuble.)

   Ce que le modèle ne peut PAS déduire seul : vers quoi un bord est tourné, et
   ce qui le cache. L'ancrage n'y suffit pas — une traverse avant ne traverse
   pas la profondeur et se voit pourtant de face. C'est la méthode qui pose la
   pièce qui le sait, donc c'est elle qui le déclare, dans `regardeVers`.

   Et le défaut n'est qu'un défaut. On chante parfois un bord invisible pour
   STANDARDISER les coupes — trois meubles de dressing, les côtés plaqués en
   une seule passe même joints — et c'est une décision, pas une conséquence :
   elle s'écrit dans le design et se relit. */

/** Les faces d'un meuble. `dessous` y est : un meuble sur roulettes le montre. */
export const FACES = ['avant', 'arriere', 'gauche', 'droite', 'dessus', 'dessous']

/**
 * Les chants que les faces regardées imposent, pièce par pièce.
 *
 * Rend ce que le design aurait à écrire — pas ce qu'il écrira : la surcharge
 * passe après, et c'est elle qui a le dernier mot.
 */
export function chantsParDefaut(pieces, visible = []) {
  const vues = new Set(visible)
  const out = {}
  for (const p of pieces) {
    const bords = Object.entries(p.regardeVers ?? {})
      .filter(([, face]) => vues.has(face))
      .map(([bord]) => bord)
      .sort()
    if (bords.length) out[p.etiquette] = bords
  }
  return out
}

/**
 * Le défaut, puis ce que le projet en fait.
 *
 * Une surcharge REMPLACE la liste d'une pièce plutôt qu'elle ne s'y ajoute :
 * « ce meuble-ci porte ces chants-là » se relit, quand un jeu d'ajouts et de
 * retraits accumulés au fil des passes ne se relit plus. `[]` retire tout.
 */
export function chantsRetenus(pieces, visible, surcharge = {}) {
  const defaut = chantsParDefaut(pieces, visible)
  const retenus = { ...defaut }
  for (const [etiquette, declare] of Object.entries(surcharge)) retenus[etiquette] = declare
  return retenus
}

/** Ce qu'une surcharge change au défaut — pour que le projet dise POURQUOI. */
export function ecartsAuDefaut(pieces, visible, surcharge = {}) {
  const defaut = chantsParDefaut(pieces, visible)
  const ecarts = []
  for (const [etiquette, declare] of Object.entries(surcharge)) {
    const avant = new Set(defaut[etiquette] ?? [])
    const apres = new Set(Array.isArray(declare) ? declare : (declare?.bords ?? []))
    const ajoutes = [...apres].filter((b) => !avant.has(b))
    const retires = [...avant].filter((b) => !apres.has(b))
    if (ajoutes.length || retires.length) ecarts.push({ etiquette, ajoutes, retires })
  }
  return ecarts
}
