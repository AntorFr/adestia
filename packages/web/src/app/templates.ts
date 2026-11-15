/**
 * Page seeds (AD-36, E-36): where they come from, how a title becomes a file
 * name, and what the created page says. Pure and shell-free, so the sheet that
 * draws it stays a thin skin over rules that are tested on their own.
 */

import { readTemplateDeclaration, writeFrontmatter, type TemplateDeclaration, type TemplateText } from '@antorfr/adestia-content'

import type { LoadedPlugin } from '../plugins/loader.js'
import type { Locale } from './i18n.js'
import type { IndexEntry, StoreInfo } from './sections.js'

/** One seed the shell can read: a file served by a plugin, or text the core carries. */
export interface TemplateSource {
  /** `<plugin>/<path>` or `core/<name>`: stable, shown only when the file cannot be read. */
  readonly id: string
  /** Where the file is served; absent for a core seed that carries its text. */
  readonly url?: string
  readonly text?: string
  /** The plugin's own translations of the English sentences its seed declares. */
  readonly words?: Readonly<Record<string, string>> | undefined
}

/**
 * The core's own seeds, the same shape as a plugin's. None is shipped today:
 * `project-management` ships "Project status" through its manifest.
 */
export const CORE_TEMPLATES: readonly TemplateSource[] = []

/** The seeds of the core and of the plugins that are LOADED (a disabled plugin ships none). */
export function templateSources(plugins: readonly Pick<LoadedPlugin, 'id' | 'base' | 'templates' | 'words'>[]): readonly TemplateSource[] {
  const sources: TemplateSource[] = [...CORE_TEMPLATES]
  for (const plugin of plugins) {
    for (const path of plugin.templates ?? []) {
      sources.push({
        id: `${plugin.id}/${path}`,
        url: `${plugin.base.endsWith('/') ? plugin.base : `${plugin.base}/`}${path}`,
        words: plugin.words,
      })
    }
  }
  return sources
}

/** What a card says of a seed. */
export interface TemplateCard {
  readonly id: string
  readonly name: string
  readonly line: string
  readonly image?: string
  /** The seed's full text, as read. */
  readonly text: string
}

function say(text: TemplateText | undefined, locale: Locale, words: TemplateSource['words']): string | undefined {
  if (text === undefined) return undefined
  if (typeof text === 'string') return words && Object.hasOwn(words, text) ? (words[text] as string) : text
  return (locale === 'fr' ? text.fr : undefined) ?? text.en
}

/** The picture is relative to the seed file, served like the plugin's other static assets. */
function imageOf(url: string | undefined, image: string): string {
  if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(image) || url === undefined) return image
  const folder = new URL(url.slice(0, url.lastIndexOf('/') + 1), 'http://adestia.invalid')
  return new URL(image, folder).pathname
}

function leaf(id: string): string {
  return (id.split('/').pop() ?? id).replace(/\.md$/, '')
}

export function cardOf(source: TemplateSource, text: string, locale: Locale): TemplateCard {
  const declared: TemplateDeclaration | undefined = readTemplateDeclaration(text)
  const name = say(declared?.name, locale, source.words) ?? leaf(source.id)
  const line = say(declared?.description, locale, source.words) ?? ''
  return {
    id: source.id,
    name,
    line,
    ...(declared?.image ? { image: imageOf(source.url, declared.image) } : {}),
    text,
  }
}

/** The longest a file name's stem may be. */
export const SLUG_MAX = 80

/**
 * The file name stem of a title: lower case, accents off, every run of
 * anything but a letter or a digit one `-`, cut at 80 characters. Empty when
 * the title has no useful character.
 */
export function slugOf(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.slice(0, SLUG_MAX).replace(/-+$/, '')
}

/** The seed as a page: its `template:` key gone, the user's title in. */
export function pageFrom(seed: string, title: string): string {
  return writeFrontmatter(seed, { template: undefined, title: title.trim() })
}

/**
 * The stores to try, in order: the ones that hold the folder, the default
 * first, then the others as the instance declares them. Empty on a one-store
 * instance and when no page shows who holds the folder: the server then
 * decides, and says so when it cannot.
 */
export function storeOrder(folder: string, pages: readonly IndexEntry[], stores: readonly StoreInfo[]): readonly string[] {
  if (stores.length < 2) return []
  const holding = new Set(
    pages.filter((entry) => entry.store !== undefined && entry.path.startsWith(`${folder}/`)).map((entry) => entry.store as string),
  )
  const ordered = [...stores.filter((store) => store.default), ...stores.filter((store) => !store.default)]
  return ordered.filter((store) => holding.has(store.id)).map((store) => store.id)
}
