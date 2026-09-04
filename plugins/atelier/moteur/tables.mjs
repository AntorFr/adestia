/* ── Les tables de décision — QUELLE règle s'applique ────────────────────────
   Une table ne calcule rien : elle CHOISIT une méthode à partir de faits du
   design. Ce que la méthode fait ensuite est du code (`moteur/modele/`). Le
   partage tient les tables plates — une sortie est un nom ou une valeur,
   jamais un objet — et borne ce qu'on peut écrire sans écrire de calcul.

   Ce qu'une table apporte qu'une suite de `si` n'apporte pas : les DOMAINES
   sont déclarés, donc l'exhaustivité se VÉRIFIE. Un cas qu'aucune ligne ne
   couvre est un trou nommé, pas un silence — c'est un meuble sans fond qui
   passe dans une règle de fond, ou un dessus qu'on cote sans s'être demandé
   s'il portait un plan de travail. Les deux sont arrivés.

   Domaines ÉNUMÉRÉS seulement, et c'est délibéré : un seuil numérique
   (« porte > 80 cm → 3 charnières ») est un comptage, donc une méthode. Une
   table qui porterait des intervalles demanderait un langage d'expressions
   dans une cellule, et une cellule qui calcule est une cellule qu'on ne
   relit plus. */

/** Au-delà, le produit cartésien ne se parcourt plus : on le dit, on ne le tait pas. */
const MAX_COMBINAISONS = 4096

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Les valeurs qu'une cellule `quand` accepte, toujours sous forme de liste. */
const attendues = (cellule) => (Array.isArray(cellule) ? cellule : [cellule])

/**
 * Lit une table et refuse ce qu'elle a de mal formé.
 *
 * Rend `{ table, erreurs }` plutôt que de lever : une table cassée coûte sa
 * propre contribution, jamais la dérivation entière — l'établi doit pouvoir
 * afficher « cette table est illisible » en nommant laquelle.
 */
export function litTable(brut, source = '?') {
  const erreurs = []
  const E = (m) => erreurs.push(`${source} : ${m}`)

  if (!estObjet(brut)) return { table: null, erreurs: [`${source} : n'est pas un objet`] }
  const { id, titre, applique_a: appliqueA, entrees, sorties, lignes } = brut

  if (typeof id !== 'string' || !id) E('`id` manquant')
  if (!Array.isArray(appliqueA) || appliqueA.length === 0)
    E('`applique_a` manquant — une table sans famille s\'appliquerait à un meuble qu\'elle ne connaît pas')

  if (!estObjet(entrees) || Object.keys(entrees).length === 0) E('`entrees` manquant')
  else
    for (const [nom, domaine] of Object.entries(entrees))
      if (!Array.isArray(domaine) || domaine.length === 0)
        E(`entrée « ${nom} » : domaine vide — c'est lui qui rend l'exhaustivité vérifiable`)

  if (!Array.isArray(sorties) || sorties.length === 0) E('`sorties` manquant')
  if (!Array.isArray(lignes) || lignes.length === 0) E('`lignes` manquant')

  if (erreurs.length) return { table: null, erreurs }

  lignes.forEach((ligne, i) => {
    const ou = `ligne ${i + 1}`
    if (!estObjet(ligne) || !estObjet(ligne.quand) || !estObjet(ligne.alors))
      return E(`${ou} : attendu { quand: {…}, alors: {…} }`)

    for (const [nom, cellule] of Object.entries(ligne.quand)) {
      const domaine = entrees[nom]
      if (!domaine) { E(`${ou} : entrée inconnue « ${nom} » (${Object.keys(entrees).join(', ')})`); continue }
      for (const v of attendues(cellule))
        if (!domaine.includes(v))
          E(`${ou} : « ${nom} » vaut « ${v} », hors domaine (${domaine.join(', ')})`)
    }
    for (const nom of Object.keys(ligne.alors))
      if (!sorties.includes(nom)) E(`${ou} : sortie inconnue « ${nom} » (${sorties.join(', ')})`)
  })

  if (erreurs.length) return { table: null, erreurs }
  return { table: { id, titre: titre ?? id, appliqueA, entrees, sorties, lignes, source }, erreurs: [] }
}

/** Une ligne couvre-t-elle ce cas ? Une entrée omise est un joker. */
function couvre(ligne, cas) {
  for (const [nom, cellule] of Object.entries(ligne.quand))
    if (!attendues(cellule).includes(cas[nom])) return false
  return true
}

/** Tous les cas possibles, dans l'ordre des entrées déclarées. */
function* combinaisons(entrees) {
  const noms = Object.keys(entrees)
  const total = noms.reduce((n, nom) => n * entrees[nom].length, 1)
  for (let i = 0; i < total; i++) {
    const cas = {}
    let reste = i
    for (const nom of noms) {
      const domaine = entrees[nom]
      cas[nom] = domaine[reste % domaine.length]
      reste = Math.floor(reste / domaine.length)
    }
    yield cas
  }
}

const decrit = (cas) => Object.entries(cas).map(([k, v]) => `${k}=${v}`).join(', ')

/**
 * Les trous et les chevauchements d'une table.
 *
 * Politique d'unicité : chaque cas tombe sur EXACTEMENT une ligne. Une
 * politique « la première qui matche » ferait dépendre le résultat de l'ordre
 * des lignes — et l'ordre d'un tableau que personne ne relit n'est pas un
 * endroit où mettre une décision d'atelier.
 *
 * Un cas volontairement sans suite s'écrit, il ne s'omet pas : une ligne
 * `{ quand: { fond: "non" }, alors: { methode: null } }`. C'est la différence
 * entre « la règle ne s'applique pas » et « personne n'y a pensé ».
 */
export function verifieTable(table) {
  const total = Object.values(table.entrees).reduce((n, d) => n * d.length, 1)
  if (total > MAX_COMBINAISONS)
    return {
      trous: [], chevauchements: [], verifie: false,
      note: `${total} combinaisons — au-delà de ${MAX_COMBINAISONS}, l'exhaustivité n'est pas vérifiée`,
    }

  const trous = []
  const chevauchements = []
  for (const cas of combinaisons(table.entrees)) {
    const touchees = table.lignes.reduce((acc, l, i) => (couvre(l, cas) ? [...acc, i + 1] : acc), [])
    if (touchees.length === 0) trous.push(decrit(cas))
    else if (touchees.length > 1) chevauchements.push(`${decrit(cas)} → lignes ${touchees.join(' et ')}`)
  }
  return { trous, chevauchements, verifie: true }
}

/**
 * Le verdict d'une table sur un cas.
 *
 * `{ alors, ligne }` ou `{ erreur }` — jamais une valeur par défaut inventée.
 * Un fait hors domaine est distingué d'un trou : le premier est une faute du
 * design, le second un manque de la table, et les deux ne se corrigent pas au
 * même endroit.
 */
export function choisit(table, faits) {
  for (const [nom, domaine] of Object.entries(table.entrees)) {
    if (!(nom in faits)) return { erreur: `${table.id} : le design ne dit pas « ${nom} »` }
    if (!domaine.includes(faits[nom]))
      return { erreur: `${table.id} : « ${nom} » vaut « ${faits[nom]} », hors domaine (${domaine.join(', ')})` }
  }

  const cas = Object.fromEntries(Object.keys(table.entrees).map((nom) => [nom, faits[nom]]))
  const touchees = table.lignes.reduce((acc, l, i) => (couvre(l, cas) ? [...acc, i] : acc), [])

  if (touchees.length === 0) return { erreur: `${table.id} : aucune ligne pour ${decrit(cas)}` }
  if (touchees.length > 1)
    return { erreur: `${table.id} : ${touchees.length} lignes pour ${decrit(cas)} (${touchees.map((i) => i + 1).join(', ')})` }

  const i = touchees[0]
  return { alors: table.lignes[i].alors, ligne: i + 1, table: table.id, source: table.source }
}

/** Les tables qui concernent cette famille de meuble — et celles qu'on écarte. */
export function pourFamille(tables, famille) {
  const retenues = []
  const ecartees = []
  for (const t of tables) (t.appliqueA.includes(famille) ? retenues : ecartees).push(t)
  return { retenues, ecartees }
}
