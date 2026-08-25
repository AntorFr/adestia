/**
 * L'adresse d'un parcours dans le shell — un seul endroit.
 *
 * Lue par le bloc (la vue « lien » y mène) et par la vue (elle en revient).
 * Deux copies d'une même règle d'encodage, c'est un lien qui marche d'un côté
 * et pas de l'autre le jour où un dossier prend un espace.
 *
 * Le chemin s'encode SEGMENT PAR SEGMENT, la barre oblique laissée telle
 * quelle — c'est la convention du shell pour `#/page/…` et `#/section/…`, et
 * une route qui s'encoderait autrement ferait de `parcours` le seul endroit du
 * produit où un chemin ne se lit pas comme partout ailleurs. Elle l'a été un
 * temps : tout était encodé d'un bloc, `%2F` compris, alors que la barre est
 * légale dans un fragment (RFC 3986). La LECTURE, elle, accepte les deux —
 * un lien écrit à l'ancienne reste un lien.
 */

/** La route du shell pour un chemin d'espace de travail. */
export function routeDuParcours(chemin) {
  return `#/parcours/${String(chemin ?? '').split('/').map(encodeURIComponent).join('/')}`
}

/** Le chemin que porte une route, ou rien si ce n'en est pas une. */
export function parcoursDeLaRoute(hash) {
  const reste = String(hash ?? '').replace(/^#?\/?parcours\/?/, '')
  if (reste === '') return undefined
  return reste
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        // Un `%` égaré dans un hash tapé à la main : on le lit tel quel plutôt
        // que de sortir du routeur par une exception.
        return segment
      }
    })
    .join('/')
}

/** Le dossier de la fiche à laquelle un parcours est accroché. */
export function ficheDuParcours(chemin) {
  return chemin.replace(/\/?assets\/[^/]+$/, '')
}
