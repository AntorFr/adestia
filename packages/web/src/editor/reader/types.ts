import type { ComponentType, ReactNode } from 'react'
import type { Indexed } from '@antorfr/adestia-content'
import type { BlockProps, LayoutProps, StoreInfo } from '../../plugins/contract.js'
import type { Node } from '../nodes.js'

/** What a plugin contributed, by block name. */
/**
 * The components plugins contribute, keyed by PLUGIN then by block name.
 *
 * The flat `Record<name, Component>` this replaces merged every plugin with
 * `Object.assign`, so two plugins drawing one name silently overwrote each
 * other — the exact situation overriding creates on purpose. Resolution now
 * names the winning plugin, and the component is looked up under it.
 */
export type BlockComponents = Readonly<
  Record<string, Readonly<Record<string, ComponentType<BlockProps>>>>
>

/** What block resolution needs to know about where this page sits. */
export interface VocabularyContext {
  /** The plugin id owning this page's domain, when an app does. */
  readonly owner?: string | undefined
  /** Feature plugin ids, in the instance's declared order. */
  readonly features: readonly string[]
}

/** Whole-page layouts, keyed by the frontmatter `type` their plugin claims. */
export type LayoutComponents = Readonly<Record<string, ComponentType<LayoutProps>>>

/** What every node needs to know beyond itself: where it is, and how to leave. */
export type Ctx = {
  /** The folder the page lives in — what a relative link is relative TO. */
  readonly base?: string
  /**
   * The page itself, for the blocks it carries: its logical path, its store,
   * its frontmatter. `base` is derived from the first and is kept beside it
   * rather than recomputed — a link needs the folder, a block needs the page.
   */
  readonly page?: { readonly path: string; readonly store?: string; readonly fields?: Readonly<Record<string, unknown>> }
  readonly openPage?: (path: string) => void
  /** Blocks the active plugins draw, beyond the core's own. */
  readonly blocks?: BlockComponents
  /**
   * Who owns this page's domain and which features are on — what `from=`
   * resolution walks. Absent (a chat bubble), resolution degrades to the
   * contextless walk: the core, else the name's first claimant.
   */
  readonly vocabulary?: VocabularyContext
  /**
   * The instance's pages, for resolving a `[[type#id]]` reference.
   *
   * UNDEFINED means "not known here", which is NOT the same as "the target is
   * gone" — a chat bubble renders prose without the index, and declaring every
   * reference in it dead would be a lie the reader cannot check. Absent, the
   * link keeps the behaviour it had before ids existed.
   */
  readonly pages?: readonly Indexed[]
  /**
   * The stores that index composes — the TABLE, which travels with the
   * listing and not with its entries. An entry says which store carries it;
   * only this says what that store is called and what colour it wears.
   */
  readonly stores?: readonly StoreInfo[]
  /** How a block that asks the server something asks it — `source=files`. */
  readonly fetchImpl?: typeof fetch
  /** The interface's language, for what a block formats: a file's size. */
  readonly locale?: string
  /**
   * The source is PROSE, not a document — see `Prose` below. Only the head of
   * the source tells the two apart, so only the head reads this.
   */
  readonly prose?: boolean
}


export type RenderChildren = (node: Node, ctx: Ctx) => ReactNode
