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
}

const ALLOWED_FIELDS = ['brand', 'title', 'placeholder', 'busyLabel', 'idleLabel'] as const

export interface SkinLoad {
  readonly skin: Skin
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
    } else {
      // `routes` is the one people try first, and the one that would lodge an
      // app inside a livery: a screen that exists under one skin and vanishes
      // under another.
      rejected.push(key)
    }
  }
  return { skin: skin as Skin, rejected }
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
