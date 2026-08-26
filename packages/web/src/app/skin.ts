/**
 * Loading a skin.
 *
 * The contract, inherited because it was right: a skin declares TOKENS and a
 * few narrow hooks. It never adds a route and never writes a structural rule —
 * several personalities share one shell, and the moment a skin can move a box
 * they stop being the same product.
 *
 * The whitelist below is enforced in code rather than only in prose. Anything
 * off-contract is dropped AND reported, because a silently ignored field is an
 * hour spent wondering why nothing happens.
 */

export interface SkinDescriptor {
  readonly id: string
  readonly base: string
  readonly styles?: string
  readonly module?: string
  readonly icon?: string
  readonly scheme?: 'light' | 'dark' | 'auto'
}

/** Everything a skin may provide. Every field optional. */
export interface Skin {
  readonly brand?: string
  readonly title?: string
  readonly placeholder?: string
  readonly busyLabel?: string
  readonly idleLabel?: string
  /**
   * How this body greets you, before and after the evening turn.
   *
   * The SHELL owns the clock and the SKIN owns the words: a livery that only
   * knew "Good evening" would say it at nine in the morning, and one that
   * computed the hour itself would be a livery with logic in it.
   */
  readonly greetingDay?: string
  readonly greetingEvening?: string
  /** The quieter half — "What can I do for you?" */
  readonly greetingAside?: string
  /**
   * SVG markup for the header crest, drawn in `currentColor`.
   *
   * Markup rather than a file path because it is inlined where it must
   * inherit the rail's text colour — an <img> cannot. It comes from the skin
   * module, which already ships arbitrary JavaScript; an SVG string adds no
   * reach it did not have.
   */
  readonly crest?: string
}

const ALLOWED_FIELDS = [
  'brand',
  'title',
  'placeholder',
  'busyLabel',
  'idleLabel',
  'greetingDay',
  'greetingEvening',
  'greetingAside',
  'crest',
] as const

/**
 * A living slot: the skin renders into a host element the shell owns, and may
 * return a teardown. The DOM-imperative shape is deliberate — a skin is plain
 * JavaScript, and asking it to speak React would pin every livery to the
 * shell's framework and version.
 */
export type SkinSlotRender = (
  host: HTMLElement,
  context: SkinSlotContext,
) => (() => void) | void

export interface SkinSlotContext {
  /** Sends a message to the agent, as if typed. */
  ask(prompt: string): void
  /** Puts text in the composer without sending. */
  compose(text: string): void
  /** Puts the cursor in the composer — what a hero's prompt box does. */
  focusComposer(): void
  /**
   * For the `hero` and `console` slots: the instance summary, as served by
   * `/api/instance`. Absent on `busy`, which is mounted mid-turn and has no
   * business reading the instance to draw three dots.
   */
  readonly instance?: {
    readonly driver: { readonly label: string; readonly cliVersion: string }
    readonly turns: { readonly max: number; readonly running: number }
    readonly plugins: readonly { readonly id: string }[]
  }
}

/** The three living slots a skin may fill. All optional, like everything else. */
export interface SkinSlots {
  /**
   * The head of the landing canvas: how this body greets you, and the way in.
   *
   * It replaced `home`, which handed over the WHOLE canvas — and that was the
   * wrong cut. The two bodies using it rebuilt a tile mosaic out of
   * `/api/instance`, which carries plugins and nothing else, so a livery
   * silently cost its instance the domaines, the brief, the tile counts (a
   * skin cannot even reach those: they come from a plugin's own view), the
   * arrange mode, and — until it was noticed — settings. Every improvement to
   * the landing was automatically absent from two instances out of three.
   *
   * A livery is a LOOK, not a navigation. So it draws the greeting, the
   * mascot and the invitation, and the shell keeps the mosaics under it. What
   * a hero wants to change about those is a TOKEN, never a rule against a
   * shell class — same reason as ever: several personalities share one shell.
   */
  readonly hero?: SkinSlotRender
  /**
   * Replaces the three working dots in the live bubble. Mounted only while a
   * turn runs, so "hurried" is this slot's only state.
   */
  readonly busy?: SkinSlotRender
  /** A status band above the canvas top bar — the HUD console. */
  readonly console?: SkinSlotRender
}

const SLOT_FIELDS = ['hero', 'busy', 'console'] as const

export interface SkinLoad {
  readonly skin: Skin & SkinSlots
  /** Off-contract fields, named so their author can find out why nothing moved. */
  readonly rejected: readonly string[]
  readonly error?: string
}

export function narrowSkin(raw: unknown): SkinLoad {
  if (typeof raw !== 'object' || raw === null) {
    return { skin: {}, rejected: [], error: 'the skin factory returned no object' }
  }

  const skin: Record<string, unknown> = {}
  const rejected: string[] = []

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if ((ALLOWED_FIELDS as readonly string[]).includes(key) && typeof value === 'string') {
      skin[key] = value
    } else if ((SLOT_FIELDS as readonly string[]).includes(key) && typeof value === 'function') {
      skin[key] = value
    } else {
      // `routes` is the one people try first, and the one that would lodge an
      // app inside a livery: a screen that exists under one skin and vanishes
      // under another. The slots above are the sanctioned exceptions, and
      // they are FUNCTIONS — a string where a function belongs (or the
      // reverse) is rejected rather than half-working.
      rejected.push(key)
    }
  }
  return { skin: skin as Skin & SkinSlots, rejected }
}

export interface SkinEnvironment {
  importModule(url: string): Promise<Record<string, unknown>>
  addStylesheet(url: string): void
  setIcon(url: string): void
  setAttribute(value: string): void
  /** Arms the shell's complete light or dark palette before overrides land. */
  setScheme(scheme: 'light' | 'dark' | undefined): void
}

export async function loadSkin(
  descriptor: SkinDescriptor,
  environment: SkinEnvironment,
): Promise<SkinLoad> {
  // The attribute arms whatever token overrides the sheet declares. Set even
  // for the default, so a page always says which livery it is wearing.
  environment.setAttribute(descriptor.id)

  // The base palette FIRST, so a skin overriding three tokens still sits on a
  // complete one. Getting this wrong is not a subtle bug: dark surfaces under
  // a light palette's dark text is simply unreadable.
  environment.setScheme(
    descriptor.scheme === 'light' || descriptor.scheme === 'dark' ? descriptor.scheme : undefined,
  )
  if (descriptor.id === 'default') return { skin: {}, rejected: [] }

  const resolve = (path: string) =>
    `${descriptor.base}${path.replace(/^\.\//, '')}`

  if (descriptor.styles) environment.addStylesheet(resolve(descriptor.styles))
  if (descriptor.icon) environment.setIcon(resolve(descriptor.icon))
  if (!descriptor.module) return { skin: {}, rejected: [] }

  try {
    const module = await environment.importModule(resolve(descriptor.module))
    const factory = module['default']
    if (typeof factory !== 'function') {
      return { skin: {}, rejected: [], error: 'the skin module must default-export a factory' }
    }
    return narrowSkin((factory as () => unknown)())
  } catch (error) {
    // A skin that fails to load leaves the shell dressed as itself rather than
    // taking the page down: a livery is not worth an interface.
    return { skin: {}, rejected: [], error: (error as Error).message }
  }
}

export function browserSkinEnvironment(): SkinEnvironment {
  return {
    importModule: (url) => import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>,
    addStylesheet(url) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      link.dataset['skin'] = 'true'
      document.head.append(link)
    },
    setIcon(url) {
      const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      const link = existing ?? document.createElement('link')
      link.rel = 'icon'
      link.href = url
      if (!existing) document.head.append(link)
    },
    setAttribute(value) {
      document.documentElement.dataset['skin'] = value
    },
    setScheme(scheme) {
      // Removed rather than set to "auto": the shell's media query IS auto,
      // and an explicit attribute would override the viewer's own preference
      // with a value that means "no preference".
      if (scheme) document.documentElement.dataset['theme'] = scheme
      else delete document.documentElement.dataset['theme']
    },
  }
}
