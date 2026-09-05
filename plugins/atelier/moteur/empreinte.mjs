/* ── L'empreinte d'un design — ce qui dit si le dérivé est encore d'accord ───
   `memory/` n'est pas versionné : rien d'extérieur ne peut affirmer que les
   pièces d'un workbook viennent bien du design qui y figure. C'est donc le
   fichier qui doit le porter, et cette empreinte est ce qui le porte.

   Pas de `node:crypto` : l'établi tourne dans un navigateur et doit pouvoir
   juger de la fraîcheur de ce qu'il dessine sans attendre une promesse
   (`crypto.subtle` est asynchrone). FNV-1a sur 64 bits, synchrone et
   identique des deux côtés — on ne se défend pas contre un adversaire, on
   détecte une désynchronisation accidentelle. Le jour où quelqu'un veut
   falsifier une cote, il édite le design, pas l'empreinte.

   La forme canonique est la moitié du travail : deux designs identiques
   écrits dans un ordre de clés différent doivent donner la même empreinte,
   sinon toute réécriture du fichier périme un dérivé encore juste. */

/** JSON déterministe : clés triées récursivement, aucun espace. */
export function canonique(valeur) {
  if (valeur === null || typeof valeur !== 'object') return JSON.stringify(valeur ?? null)
  if (Array.isArray(valeur)) return `[${valeur.map(canonique).join(',')}]`
  const paires = Object.keys(valeur)
    .filter((k) => valeur[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonique(valeur[k])}`)
  return `{${paires.join(',')}}`
}

const OFFSET = 0xcbf29ce484222325n
const PRIME = 0x100000001b3n
const MASQUE = 0xffffffffffffffffn

/** FNV-1a 64 bits sur les octets UTF-8, rendu en hexadécimal fixe. */
export function empreinte(valeur) {
  const octets = new TextEncoder().encode(canonique(valeur))
  let h = OFFSET
  for (const o of octets) {
    h ^= BigInt(o)
    h = (h * PRIME) & MASQUE
  }
  return `fnv1a64:${h.toString(16).padStart(16, '0')}`
}
