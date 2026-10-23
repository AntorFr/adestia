/**
 * An icon of the sprite, built as DOM — for the places React does not draw.
 *
 * The block bar, the properties strip and Milkdown's menus are made of
 * elements ProseMirror owns, so `<Icon>` is out of reach there. The markup is
 * the same one `<Icon>` renders (`app/Icon.tsx`): a decorative `<svg>` whose
 * `<use>` points into the sprite mounted at boot.
 */

import { iconId, type IconName } from '../app/icons.js'

const SVG = 'http://www.w3.org/2000/svg'

/** The icon as an element, to append to a button the caller already made. */
export function domIcon(doc: Document, name: IconName, className = ''): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg')
  svg.setAttribute('class', className ? `adestia-icon ${className}` : 'adestia-icon')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const use = doc.createElementNS(SVG, 'use')
  use.setAttribute('href', `#${iconId(name)}`)
  svg.append(use)
  return svg
}

/** The same icon as a string, for Crepe's menus, which take their icons as markup. */
export function iconMarkup(name: IconName): string {
  return `<svg class="adestia-icon" aria-hidden="true" focusable="false"><use href="#${iconId(name)}"/></svg>`
}
