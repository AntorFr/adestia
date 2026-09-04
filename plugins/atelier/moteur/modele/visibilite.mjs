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

   **Une porte ne cache rien : on pense toujours porte OUVERTE.** Un caisson
   fermé se chante dedans exactement comme un caisson ouvert — l'économie de
   quelques mètres de bande se paierait le jour où on ouvre le meuble et où
   tout est brut. La présence de portes ne change donc pas les chants ; elle
   change des cotes (une tablette en retrait pour ne pas la faire taper), ce
   qui est une autre question.

   Ce que le modèle ne peut PAS déduire seul : vers quoi un bord est tourné, et
   ce qui le cache. L'ancrage n'y suffit pas — une traverse avant ne traverse
   pas la profondeur et se voit pourtant de face. C'est la méthode qui pose la
   pièce qui le sait, donc c'est elle qui le déclare, dans `regardeVers`.

   **Et on ne chante que ce qui se chante.** Une bande couvre la tranche d'un
   panneau décoratif, dont l'âme est laide ; du MDF ou du bois massif n'a rien
   à couvrir et se finit autrement — vernis, huilé, peint. Un plan de travail
   MDF parfaitement visible ne prend donc aucun chant : « à vernir ou huiler
   sur ses 4 champs avant pose ». C'est le MATÉRIAU qui décide, pas le regard.

   Et le défaut n'est qu'un défaut. On chante parfois un bord invisible pour
   STANDARDISER les coupes — trois meubles de dressing, les côtés plaqués en
   une seule passe même joints — et c'est une décision, pas une conséquence :
   elle s'écrit dans le design et se relit. */

/**
 * Le champ du design s'appelle `faces_chantees`, et pas `visible`.
 *
 * Parce qu'on y déclare ce qu'on CHANTE, ce qui ne coïncide pas toujours avec
 * ce qu'on voit : sur un dressing de trois meubles accolés, les côtés joints
 * ne se voient pas et se chantent quand même — une passe, un réglage, les
 * trois meubles pareils. Le mot « visible » aurait laissé croire, six mois
 * plus tard, que ces côtés étaient exposés.
 *
 * Le CRITÈRE, lui, reste le regard : un bord se chante s'il est tourné vers
 * une de ces faces et que rien ne l'occulte. On déclare une intention de
 * chant, le modèle en déduit quels bords elle atteint.
 */

/** Les faces d'un meuble. `dessous` y est : un meuble sur roulettes le montre. */
export const FACES = ['avant', 'arriere', 'gauche', 'droite', 'dessus', 'dessous']

/**
 * Les chants que les faces chantées imposent, pièce par pièce.
 *
 * Rend ce que le design aurait à écrire — pas ce qu'il écrira : la surcharge
 * passe après, et c'est elle qui a le dernier mot.
 */
export function chantsParDefaut(pieces, facesChantees = []) {
  const vues = new Set(facesChantees)
  const out = {}
  for (const p of pieces) {
    // Un panneau qui ne se chante pas ne se chante pas, si visible soit-il.
    if (p.chante === false) continue
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
export function chantsRetenus(pieces, facesChantees, surcharge = {}) {
  const defaut = chantsParDefaut(pieces, facesChantees)
  const retenus = { ...defaut }
  for (const [etiquette, declare] of Object.entries(surcharge)) retenus[etiquette] = declare
  return retenus
}

/** Ce qu'une surcharge change au défaut — pour que le projet dise POURQUOI. */
export function ecartsAuDefaut(pieces, facesChantees, surcharge = {}) {
  const defaut = chantsParDefaut(pieces, facesChantees)
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
