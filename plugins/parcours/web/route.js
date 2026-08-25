/**
 * L'adresse d'un parcours dans le shell — un seul endroit.
 *
 * Lue par le bloc (la vue « lien » y mène) et par la vue (elle en revient).
 * Deux copies d'une même règle d'encodage, c'est un lien qui marche d'un côté
 * et pas de l'autre le jour où un dossier prend un espace.
 *
 * Le chemin est encodé D'UN SEUL BLOC, les barres obliques comprises — c'est la
 * convention du shell pour `#/page/…` et `#/section/…`, et une route qui
 * s'encoderait autrement ferait de `parcours` le seul endroit du produit où un
 * chemin ne se lit pas comme partout ailleurs.
 */

/** La route du shell pour un chemin d'espace de travail. */
export function routeDuParcours(chemin) {
  return `#/parcours/${encodeURIComponent(chemin)}`
}

/** Le chemin que porte une route, ou rien si ce n'en est pas une. */
export function parcoursDeLaRoute(hash) {
  const reste = String(hash ?? '').replace(/^#?\/?parcours\/?/, '')
  return reste === '' ? undefined : decodeURIComponent(reste)
}

/** Le dossier de la fiche à laquelle un parcours est accroché. */
export function ficheDuParcours(chemin) {
  return chemin.replace(/\/?assets\/[^/]+$/, '')
}
