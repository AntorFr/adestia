/**
 * The core's own block cards — what the gallery (E-34) shows for the blocks
 * the content engine ships, in both languages the shell speaks.
 *
 * A table here, not derived from the `/` menu: the menu has labels and icons
 * but no picture, no line and no group (AD-deplacer-2). `app` is absent for
 * the reason `slash.ts` keeps it out — nothing draws it, a card would be a
 * dead end. Images are small files under `public/blocks/`.
 */

import type { Locale } from '../app/i18n.js'
export type { Locale }

export interface Localised {
  readonly en: string
  readonly fr: string
}

export interface CoreCard {
  readonly name: Localised
  readonly line: Localised
  /** Absolute path, served with the shell's static files. */
  readonly image: string
  readonly group: Localised
}

const TEXT: Localised = { en: 'Text', fr: 'Texte' }
const DATA: Localised = { en: 'Data', fr: 'Données' }
const LAYOUT: Localised = { en: 'Layout', fr: 'Mise en page' }

export const CORE_GALLERY: Readonly<Record<string, CoreCard>> = {
  callout: {
    name: { en: 'Callout', fr: 'Encadré' },
    line: { en: 'A highlighted aside: note, tip or warning.', fr: 'Une remarque mise en avant : note, astuce ou alerte.' },
    image: '/blocks/callout.svg',
    group: TEXT,
  },
  content: {
    name: { en: 'Content', fr: 'Contenu' },
    line: { en: 'Pages of one kind, listed where you put it.', fr: 'Les pages d’un même type, listées là où vous le posez.' },
    image: '/blocks/content.svg',
    group: TEXT,
  },
  figures: {
    name: { en: 'Figures', fr: 'Chiffres' },
    line: { en: 'Key numbers side by side, each with its label.', fr: 'Des chiffres clés côte à côte, chacun avec son libellé.' },
    image: '/blocks/figures.svg',
    group: DATA,
  },
  table: {
    name: { en: 'Table', fr: 'Tableau' },
    line: { en: 'A grid whose first column sets the tone of each row.', fr: 'Une grille dont la première colonne donne le ton de chaque ligne.' },
    image: '/blocks/table.svg',
    group: DATA,
  },
  list: {
    name: { en: 'List', fr: 'Liste' },
    line: { en: 'A list of items, each with its own detail.', fr: 'Une liste d’éléments, chacun avec son détail.' },
    image: '/blocks/list.svg',
    group: DATA,
  },
  row: {
    name: { en: 'Columns', fr: 'Colonnes' },
    line: { en: 'Blocks side by side on one line.', fr: 'Des blocs côte à côte sur une même ligne.' },
    image: '/blocks/row.svg',
    group: LAYOUT,
  },
  gallery: {
    name: { en: 'Image gallery', fr: 'Galerie d’images' },
    line: { en: 'A grid of pictures.', fr: 'Une grille d’images.' },
    image: '/blocks/gallery.svg',
    group: LAYOUT,
  },
}
