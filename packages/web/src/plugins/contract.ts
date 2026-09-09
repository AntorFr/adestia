/**
 * What a plugin's front-end factories receive, and what they may return.
 *
 * Every facet is a default-exported function taking one `api` object. Injection
 * rather than imports, for a reason that decides the whole loading model: the
 * shell imports the PLUGIN, so a plugin importing the shell would be a cycle —
 * and worse, would pin a plugin to a build of the shell it can never see.
 *
 * The whitelist below is enforced in code, not just described here. A
 * contribution carrying a field off-contract is dropped AND reported, because
 * a silently ignored field is an hour spent wondering why nothing happens.
 */

import type { ComponentType, ReactNode } from 'react'

/** What every factory is handed. Stable across all three facet kinds. */
export interface PluginApi {
  /** The plugin's own id — useful for namespacing storage and CSS. */
  readonly id: string
  /** URL prefix its own files are served from, for assets and lazy chunks. */
  readonly base: string
  /**
   * The instance's language, as a BCP-47 tag (`fr`, `en`…).
   *
   * A plugin ships its OWN words, the same way it ships its own skills — the
   * shell cannot translate sentences it has never seen. What it can do is say
   * which language to speak, and that is this. Also the right argument for
   * `toLocaleDateString`, so a plugin's dates match the shell's.
   */
  readonly locale: string
  /**
   * Fetch, already carrying the session. A plugin calling bare `fetch` works
   * too; this exists so the obvious call is the correct one.
   */
  readonly fetch: typeof fetch
  /**
   * Sends a message to the agent, as if the user had typed it.
   *
   * Deliberately present: an app whose button can ask the agent something is
   * the whole point of pairing a chat with apps. It is also the single most
   * powerful thing a plugin can do, which is why `plugins/README` says a view
   * ships JavaScript into the page and there is no sandbox.
   */
  ask(prompt: string): void
  /**
   * Puts text in the composer WITHOUT sending it.
   *
   * Distinct from `ask` on purpose, and the distinction is a design position
   * rather than a convenience: a barcode reader is a KEYBOARD, not a scanner
   * that commands. It deposits what it read and the person decides what the
   * message means — "add these to the shopping list", "how much protein is in
   * this". A plugin that sent on every beep would be making that decision for
   * them, badly.
   */
  compose(text: string): void
  /**
   * Publishes where this view IS, for the shell's own breadcrumb.
   *
   * A plugin owns screens the shell cannot name: `#/voyages/baden-2026` is a
   * trip whose title lives in a JSON file, and the header stopped at "Home /
   * Voyages" whatever screen was open under it. Both ported apps answered
   * that by drawing their own trail inside their panel — two breadcrumbs, one
   * above the other, which reads as a bug rather than a feature.
   *
   * So the plugin says WHERE, in its own words, and the shell draws it in the
   * one place a breadcrumb belongs. Crumbs are the ones BELOW this view's own
   * tile — the shell already draws Home and the app's name, and drops any
   * crumb that merely repeats them. `route` is a hash route without the `#`
   * (`/voyages/baden-2026`), absent for a step that leads nowhere.
   *
   * Call it whenever the view moves, including with `[]` to say "nowhere in
   * particular": the trail is cleared on every navigation, so a screen that
   * says nothing gets the app's name alone rather than the last screen's
   * words.
   */
  trail(crumbs: readonly { readonly label: string; readonly route?: string }[]): void
  /**
   * The shell's own page editor, mounted inside the plugin's screen.
   *
   * Handed over rather than imported, for the reason at the top of this file:
   * a plugin importing the shell would be a cycle. It is also why this is not
   * an import-map entry — the map publishes third-party dependencies, and the
   * shell's own capabilities travel through `api`, where they can be versioned
   * with the contract instead of with a bundle.
   *
   * What a plugin gets is the SAME component the shell uses on `#/page/…`:
   * reading posture by default, one button to write, its own revision, its own
   * conflict handling against an agent that writes without warning. Rendering
   * one per item is what makes a screen where a single section goes into edit
   * mode while the rest stays readable — no second editor, no second grammar,
   * and no plugin holding its own idea of what a save means.
   */
  readonly PageEditor: ComponentType<PageEditorProps>
}

/** What a plugin may ask the embedded page editor for. */
export interface PageEditorProps {
  /** Path of the page to edit, as `/api/pages/…` spells it. */
  readonly path: string
  /**
   * Draw the page's attachment strip underneath. Off by default here, unlike
   * the shell's own page screen: a plugin embeds this INSIDE a layout of its
   * own, where a list of documents under every item is furniture nobody asked
   * for — and one more request per item. Ask for it where the embedded page is
   * a document in its own right.
   */
  readonly attachments?: boolean
  /**
   * Open in writing posture instead of reading.
   *
   * For a page the person just created — a journal entry behind a `+`, a task
   * captured a second ago. They have already said they want to write; making
   * them press ✎ on the empty document they asked for is asking twice.
   */
  readonly editing?: boolean
  /**
   * Told when the embedded editor enters or leaves writing posture.
   *
   * A plugin drawing anything else about the same page — a title beside the
   * body, a field of its own — must stop writing to that file while the
   * editor holds it. Two writers on one document is a 409 on somebody's
   * unsaved paragraph, and the person who loses is the one who typed most.
   */
  readonly onEditing?: (editing: boolean) => void
  /** Called after a save the server accepted — the moment to reload a list. */
  readonly onSaved?: () => void
}

/** One live figure on a plugin's tile. */
export interface TileChip {
  readonly text: string
  /**
   * Drawn in the tile's own colour rather than in the quiet default. For the
   * one figure that is not merely informative — overdue, failing, waiting on
   * somebody. A tile where everything is hot says nothing.
   */
  readonly hot?: boolean
}

/** What a plugin puts on its own tile, computed when the launcher renders. */
export interface TileInfo {
  readonly subtitle?: string
  readonly chips?: readonly TileChip[]
}

/** A launcher view: one React component, optionally a route to reach it. */
export interface ViewContribution extends HoldsFolder {
  readonly component: ComponentType<Record<string, never>>
  /**
   * Hash route this view answers to (`#/workbench`). Absent means the view is
   * reached only from its tile.
   *
   * A route owns its descendants: a view declaring `/workbench` also answers
   * to `/workbench/anything/deeper`, and reads the rest itself. Without that,
   * a plugin with a detail screen has nowhere to put it — either the shell
   * learns every plugin's URL shape, or detail screens live in component
   * state and cannot be bookmarked, shared, or survive a reload.
   */
  readonly route?: string

  /**
   * Where a workspace path this plugin has a screen for should open.
   *
   * The question the shell cannot answer alone. It knows a path is somebody's
   * business — `absorbs` declares it, or this very method admits it — and it
   * cannot know how that somebody addresses it: only the trips app knows a
   * trip is reached through the `assets/voyage.json` it carries. So it asks,
   * in its own vocabulary — a workspace path in (a folder, or a file inside
   * one), a route in the same shape as `route` out (`/voyages/…`, no `#`).
   *
   * Without it, ownership held on the launcher and nowhere else: a page
   * inside a trip crumbed back to `#/section/domaines/voyages/broceliande-2026`,
   * the generic list of files, from a screen that exists precisely because a
   * trip is not one.
   *
   * ANSWERING IS CLAIMING. A plugin that cannot use `absorbs` — the atelier's
   * benches sit in whatever project folders exist, and no folder NAME covers
   * them — owns a path simply by knowing it, from its own listing. Which is
   * the more honest test anyway: a folder is a workbench because a workbook
   * is filed in it, not because of what it is called.
   *
   * Answer `undefined` for a path this view has no screen for, and the shell
   * falls back to the generic section rather than to a dead end. An answer
   * OUTSIDE the plugin's own `route` is dropped: owning a path does not get
   * you the shell's navigation.
   *
   * Must be synchronous — it is called while a link is being drawn. Anything
   * needing a fetch to answer is a screen, not a route.
   */
  routeFor?(path: string): string | undefined

  /**
   * Live figures for this plugin's tile — "12 to do", "3 overdue".
   *
   * Asked for by the launcher, answered by the plugin, because only the
   * plugin knows what counts. The shell will not wait on it: a tile renders
   * immediately from the manifest and fills in when this resolves, so a slow
   * or failing count costs a number, never the launcher.
   */
  tileInfo?(): TileInfo | Promise<TileInfo | undefined> | undefined
}

/**
 * Whether a hash falls inside a route.
 *
 * The boundary is a SEGMENT boundary, so `/note` never captures `/notebook`.
 * Two plugins claiming overlapping routes is a configuration mistake, and one
 * silently swallowing the other's screens would be an unpleasant way to find
 * out.
 */
export function routeMatches(route: string | undefined, hash: string): boolean {
  if (!route) return false
  return hash === route || hash.startsWith(`${route}/`)
}

/** Composer buttons and settings entries a plugin adds to the shell. */
export interface ChromeContribution {
  readonly composer?: readonly {
    readonly id: string
    readonly glyph: string
    readonly title: string
    onClick(api: PluginApi): void
  }[]
  readonly settings?: readonly {
    readonly id: string
    readonly label: string
    onClick(api: PluginApi): void
  }[]
}

/**
 * What a contributed block's component is handed when a page draws it.
 *
 * Note what is NOT here: `fetch`, `locale`, the plugin's id. Those come from
 * the `api` the factory already closed over, so a block never has to be given
 * twice what its own plugin knows. What IS here is the only thing the plugin
 * cannot know — where in the workspace this particular occurrence sits.
 */
export interface BlockProps {
  /** Validated against the manifest's spec before this ever runs. */
  readonly attributes: Readonly<Record<string, string>>
  /**
   * The page carrying this block — its LOGICAL path, as `/api/pages/…` spells
   * it, exactly like a layout's.
   *
   * Logical means the memory's own name, the one composed from every store: it
   * never carries which store holds the file, which is what lets a page move
   * between circles without a block losing its bearings.
   *
   * Handed over because deriving it was possible and wrong. A block can ask
   * `locate('.')` for its own folder, and that answers `.` for a page sitting
   * at the root — a silently wrong scope rather than an error. And a folder is
   * not enough anyway: a task captured for a worksite is filed in the todo
   * folder and points back with `projet:`, so a block scoped only by location
   * would miss precisely the tasks somebody added in a hurry.
   *
   * Absent when prose is rendered outside any page — a chat bubble — which is
   * the same case that leaves relative links unresolved.
   */
  readonly path?: string
  /**
   * Which store carries that page. Present only where the instance composes
   * more than one.
   *
   * A QUALIFIER, never part of a name: never join it to `path` to build an
   * address. The bare path is the canonical one and resolves by precedence.
   */
  readonly store?: string
  /**
   * The page's frontmatter, as the server parsed it.
   *
   * What lets a block answer "the tasks of THIS worksite" rather than "the
   * tasks filed under this folder" — the page's own `id` lives here.
   */
  readonly fields?: Readonly<Record<string, unknown>>
  /**
   * A path written in the page, turned into something fetchable.
   *
   * `:::parcours{source="assets/x.json"}` means "next to the page that writes
   * it", the way it reads on disk. Nothing in a document should have
   * to know files are served under `/api/files`, and a plugin cannot resolve
   * it alone: only the shell knows which page is being read.
   */
  resolve(path: string): string
  /**
   * The same path, as the WORKSPACE spells it.
   *
   * What a block names to its own API — "the GPX of this file" — where
   * `resolve` is what it fetches. A plugin deriving one from the other would
   * be reading the shell's route shape out of a string, and would break the
   * day that shape moves.
   */
  locate(path: string): string
  /** Opens another page of this instance in place, when the shell offers it. */
  openPage?(path: string): void
  /** The block's body, already rendered. Only ever set on a `flow` block. */
  readonly children?: ReactNode
}

/**
 * Content-engine blocks a plugin adds to the closed vocabulary.
 *
 * Only the COMPONENTS. A block's name, its attributes and whether it takes a
 * body are declared in the manifest instead — the server validates pages and
 * cannot execute a browser module to learn what is legal. So this half stays
 * what a manifest genuinely cannot hold, and neither half restates the other.
 *
 * A component named here with no matching manifest entry never renders: the
 * parser will not have produced the node. That is reported at load rather
 * than left as a block that silently does nothing.
 */
export interface BlocksContribution {
  readonly tags: Readonly<Record<string, ComponentType<BlockProps>>>
}

/**
 * What a whole-page layout is handed.
 *
 * A layout draws a page whose `type` its plugin claims — the reading posture
 * only. Editing stays the shell's: the ✎ swaps to the markdown surface, so a
 * period whose dates live in frontmatter is still corrected the way every
 * other page is corrected, and a plugin cannot strand a document behind a
 * screen of its own.
 */
export interface HoldsFolder {
  /**
   * Whether this plugin actually holds a folder its `absorbs` name matches.
   *
   * `absorbs` is a NAME and it matches wherever that run of segments sits —
   * which is what lets an operator file trips under `domaines/voyages` without
   * telling anybody. The cost is that a folder merely SHARING the word is
   * claimed too, and the reader is sent to an app that has never heard of it:
   * a meals period filed in `sante/dietetique/journal` became reachable by its
   * direct link and by nothing else, because the section tile was gone and
   * every link into the folder led to the journal shelf.
   *
   * The shell cannot tell the two apart. Only the plugin can, from its own
   * listing — so it is asked, and a `false` hands the folder back to the
   * shell's generic section rather than to a screen that will not show it.
   *
   * Optional: a plugin that does not implement it keeps the old behaviour,
   * which is to be believed on the strength of the name alone.
   */
  holds?(folder: string): boolean
}

export interface LayoutProps {
  /** The page's logical path, as `/api/pages/…` spells it. */
  readonly path: string
  /** Which store carries it, when the instance composes more than one. */
  readonly store?: string
  /** The page's frontmatter, parsed by the server that served the page. */
  readonly fields: Readonly<Record<string, unknown>>
  /** What the page's title resolves to — frontmatter, first heading, or name. */
  readonly title: string
  /** The document itself, for a layout that draws part of the prose. */
  readonly markdown: string
  /** What the editor would send back to prove it read this copy. */
  readonly revision: string
  /** Follows a link to another page. */
  openPage?(path: string): void
  /**
   * The page's own body, already rendered — prose, blocks and all.
   *
   * Handed over rather than replaced, so a layout COMPOSES with the document
   * instead of hiding it. A period's page opens with two sentences saying how
   * it is kept, and a layout that dropped them would leave content on the page
   * that nobody can see without pressing the pencil. A layout that wants a
   * bare screen simply does not render this.
   */
  readonly children?: ReactNode
}

/**
 * Whole-page layouts a plugin draws, keyed by the frontmatter `type` it claims.
 *
 * Only the COMPONENTS, for the same reason as the blocks: which types a plugin
 * claims is declared in the manifest (`types`), where the server can read it
 * and refuse two plugins claiming one word. A type drawn here but absent from
 * the manifest never reaches a page — the claim is what the shell matches on.
 */
export interface LayoutsContribution {
  readonly types: Readonly<Record<string, ComponentType<LayoutProps>>>
}

export type Facet = 'view' | 'blocks' | 'chrome' | 'layouts'

export interface ContractIssue {
  readonly facet: Facet
  readonly reason: string
}

/**
 * Narrows what a factory returned to what the shell will actually use.
 *
 * Written as three small validators rather than one clever one: the error a
 * plugin author reads has to name the facet AND what was expected, and a
 * generic schema walker produces neither.
 */
export function narrowView(raw: unknown): { view?: ViewContribution; issue?: ContractIssue } {
  if (typeof raw === 'function') {
    // A bare component is the obvious thing to return, so it is accepted:
    // refusing it would be pedantry over a shape that is unambiguous.
    return { view: { component: raw as ComponentType<Record<string, never>> } }
  }
  if (typeof raw !== 'object' || raw === null) {
    return { issue: { facet: 'view', reason: 'must return a component or { component }' } }
  }
  const record = raw as Record<string, unknown>
  if (typeof record['component'] !== 'function') {
    return { issue: { facet: 'view', reason: '`component` must be a React component' } }
  }
  const route = record['route']
  const tileInfo = record['tileInfo']
  const routeFor = record['routeFor']
  const holds = record['holds']
  return {
    view: {
      component: record['component'] as ComponentType<Record<string, never>>,
      ...(typeof route === 'string' ? { route } : {}),
      ...(typeof routeFor === 'function'
        ? { routeFor: routeFor as NonNullable<ViewContribution['routeFor']> }
        : {}),
      ...(typeof tileInfo === 'function'
        ? { tileInfo: tileInfo as NonNullable<ViewContribution['tileInfo']> }
        : {}),
      // Carried through like the rest. This narrow builds a NEW object from
      // the fields it knows, so a facet missing from this list is dropped in
      // silence — `holds` was, and the plugin implementing it kept being
      // believed on its name with nothing to show why.
      ...(typeof holds === 'function'
        ? { holds: holds as NonNullable<ViewContribution['holds']> }
        : {}),
    },
  }
}

export function narrowChrome(raw: unknown): { chrome?: ChromeContribution; issue?: ContractIssue } {
  if (typeof raw !== 'object' || raw === null) {
    return { issue: { facet: 'chrome', reason: 'must return { composer?, settings? }' } }
  }
  const record = raw as Record<string, unknown>

  const entries = (value: unknown, needs: readonly string[]) =>
    Array.isArray(value)
      ? value.filter(
          (item) =>
            typeof item === 'object' &&
            item !== null &&
            needs.every((key) => typeof (item as Record<string, unknown>)[key] === 'string') &&
            typeof (item as Record<string, unknown>)['onClick'] === 'function',
        )
      : []

  const composer = entries(record['composer'], ['id', 'glyph', 'title'])
  const settings = entries(record['settings'], ['id', 'label'])

  if (composer.length === 0 && settings.length === 0) {
    return {
      issue: {
        facet: 'chrome',
        reason: 'declared nothing usable — composer entries need {id, glyph, title, onClick}',
      },
    }
  }
  const chrome: ChromeContribution = {
    ...(composer.length > 0
      ? { composer: composer as NonNullable<ChromeContribution['composer']> }
      : {}),
    ...(settings.length > 0
      ? { settings: settings as NonNullable<ChromeContribution['settings']> }
      : {}),
  }
  return { chrome }
}

export function narrowBlocks(raw: unknown): { blocks?: BlocksContribution; issue?: ContractIssue } {
  if (typeof raw !== 'object' || raw === null) {
    return { issue: { facet: 'blocks', reason: 'must return { tags }' } }
  }
  const tags = (raw as Record<string, unknown>)['tags']
  if (typeof tags !== 'object' || tags === null) {
    return { issue: { facet: 'blocks', reason: '`tags` must be an object of block components' } }
  }

  const components: Record<string, ComponentType<BlockProps>> = {}
  const wrong: string[] = []
  for (const [name, value] of Object.entries(tags)) {
    if (typeof value === 'function') components[name] = value as ComponentType<BlockProps>
    else wrong.push(name)
  }
  if (wrong.length > 0) {
    // Named, not counted: the author has to know WHICH block will not draw,
    // and a plugin contributing four blocks gets no help from "one is wrong".
    return {
      issue: {
        facet: 'blocks',
        reason: `must be React components, got something else for: ${wrong.join(', ')}`,
      },
    }
  }
  if (Object.keys(components).length === 0) {
    return { issue: { facet: 'blocks', reason: '`tags` declared no block at all' } }
  }
  return { blocks: { tags: components } }
}

export function narrowLayouts(raw: unknown): {
  layouts?: LayoutsContribution
  issue?: ContractIssue
} {
  if (typeof raw !== 'object' || raw === null) {
    return { issue: { facet: 'layouts', reason: 'must return { types }' } }
  }
  const types = (raw as Record<string, unknown>)['types']
  if (typeof types !== 'object' || types === null) {
    return { issue: { facet: 'layouts', reason: '`types` must be an object of components' } }
  }

  const components: Record<string, ComponentType<LayoutProps>> = {}
  const wrong: string[] = []
  for (const [name, value] of Object.entries(types)) {
    if (typeof value === 'function') components[name] = value as ComponentType<LayoutProps>
    else wrong.push(name)
  }
  if (wrong.length > 0) {
    return {
      issue: {
        facet: 'layouts',
        reason: `must be React components, got something else for: ${wrong.join(', ')}`,
      },
    }
  }
  if (Object.keys(components).length === 0) {
    return { issue: { facet: 'layouts', reason: '`types` declared no layout at all' } }
  }
  return { layouts: { types: components } }
}
