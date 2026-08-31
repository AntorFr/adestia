/* ── Ce qu'un changement d'entrée a fait au dérivé ───────────────────────────
   Le moteur a sous la main ce qu'il s'apprête à écraser. Il compare avant
   d'écrire, et rend le delta : quelle entrée a changé, quelles pièces
   apparaissent, disparaissent, changent de cote, et ce que le débit y gagne
   ou y perd.

   C'est la réponse à une question posée en vrai, deux passes trop tard :
   « la hauteur des côtés a bougé, on était à 833 et maintenant 851,
   pourquoi ? » — une cote avait changé sans que rien ne le dise, et il a
   fallu la remarquer. Ici le changement se voit au moment où on le fait :
   un `plan`, pas un `log`. C'est aussi ce qui remplace le versionnement que
   `memory/` n'a pas.

   Les `note` sont exclues de la comparaison. Elles changent à chaque passe et
   noieraient les six lignes qui comptent. */

const CHAMPS_IGNORES = ['note']

const parEtiquette = (pieces) => new Map((pieces ?? []).map((p) => [p.etiquette, p]))

const memeValeur = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Les champs d'une pièce qui ont changé, hors annotations. */
function champsChanges(avant, apres) {
  const noms = new Set([...Object.keys(avant), ...Object.keys(apres)].filter((n) => !CHAMPS_IGNORES.includes(n)))
  const out = []
  for (const nom of [...noms].sort())
    if (!memeValeur(avant[nom], apres[nom])) out.push({ champ: nom, avant: avant[nom] ?? null, apres: apres[nom] ?? null })
  return out
}

/** Les chemins d'un objet dont la valeur a changé — `hors_tout.h`, `pose`. */
export function diffDesign(avant, apres, prefixe = '') {
  const out = []
  const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  const noms = new Set([...Object.keys(avant ?? {}), ...Object.keys(apres ?? {})])
  for (const nom of [...noms].sort()) {
    const chemin = prefixe ? `${prefixe}.${nom}` : nom
    const a = avant?.[nom]
    const b = apres?.[nom]
    if (estObjet(a) && estObjet(b)) out.push(...diffDesign(a, b, chemin))
    else if (!memeValeur(a, b)) out.push({ champ: chemin, avant: a ?? null, apres: b ?? null })
  }
  return out
}

/** Combien de plaques, par matière. */
function plaquesParMatiere(debit) {
  const compte = new Map()
  for (const pl of debit ?? []) compte.set(pl.materiau, (compte.get(pl.materiau) ?? 0) + 1)
  return compte
}

export function diffDebit(avant, apres) {
  const a = plaquesParMatiere(avant)
  const b = plaquesParMatiere(apres)
  const out = []
  for (const materiau of [...new Set([...a.keys(), ...b.keys()])].sort())
    if ((a.get(materiau) ?? 0) !== (b.get(materiau) ?? 0))
      out.push({ materiau, avant: a.get(materiau) ?? 0, apres: b.get(materiau) ?? 0 })
  return out
}

/**
 * Le delta complet entre deux workbooks.
 *
 * `rien` plutôt qu'un objet vide à interpréter : recalculer sans rien changer
 * est le cas le plus fréquent, et il doit se dire en un mot.
 */
export function diff(avant, apres) {
  const a = parEtiquette(avant?.pieces)
  const b = parEtiquette(apres?.pieces)

  const disparues = [...a.keys()].filter((e) => !b.has(e)).map((e) => a.get(e))
  const apparues = [...b.keys()].filter((e) => !a.has(e)).map((e) => b.get(e))
  const modifiees = []
  for (const [etiquette, piece] of b) {
    if (!a.has(etiquette)) continue
    const changes = champsChanges(a.get(etiquette), piece)
    if (changes.length) modifiees.push({ etiquette, changes })
  }

  const design = diffDesign(avant?.design, apres?.design)
  const debit = diffDebit(avant?.debit, apres?.debit)

  return {
    design, apparues, disparues, modifiees, debit,
    rien: !design.length && !apparues.length && !disparues.length && !modifiees.length && !debit.length,
  }
}

const cote = (p) => [p?.longueur, p?.largeur].filter((n) => n != null).join(' × ')
const valeur = (v) => (Array.isArray(v) ? `[${v.join(', ')}]` : v === null ? '—' : String(v))

/** Le delta, tel qu'on le lit dans un terminal ou dans un tour d'agent. */
export function rendu(delta) {
  if (delta.rien) return 'Rien n\'a bougé.'
  const lignes = []

  for (const { champ, avant, apres } of delta.design)
    lignes.push(`design: ${champ}  ${valeur(avant)} → ${valeur(apres)}`)

  for (const p of delta.disparues) lignes.push(`  − ${p.etiquette} (${cote(p)})`)
  for (const p of delta.apparues) lignes.push(`  + ${p.etiquette} (${cote(p)})`)
  for (const { etiquette, changes } of delta.modifiees)
    for (const { champ, avant, apres } of changes)
      lignes.push(`  ~ ${etiquette}  ${champ} ${valeur(avant)} → ${valeur(apres)}`)

  for (const { materiau, avant, apres } of delta.debit)
    lignes.push(`  débit: ${materiau} ${avant} → ${apres} plaque${apres > 1 ? 's' : ''}`)

  return lignes.join('\n')
}
