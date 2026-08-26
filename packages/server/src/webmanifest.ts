/**
 * The web app manifest — what turns the page into something you install.
 *
 * Served, never bundled. A browser reads it before a single line of the shell
 * runs, which is why a skin cannot contribute one through the client-side
 * registry the way it contributes tokens: by the time a skin module evaluates,
 * the install prompt has already decided what this thing is called.
 *
 * Two rules shape the merge below:
 *
 * - **A skin dresses; it does not navigate.** `start_url`, `scope`, `id` and
 *   `display` are the product's, and stay the product's. A livery that could
 *   move the entry point would be a livery that changes what the app IS — the
 *   same line the token contract draws for CSS.
 * - **Icons are a convention, not a declaration.** The manifest is served from
 *   the ROOT while a skin's files live under `/skin/`, so a relative `src` in a
 *   skin's fragment would resolve against the wrong folder — silently, and
 *   only visibly wrong on an installed home screen. The product publishes
 *   fixed icon addresses instead and serves each of them from the active skin
 *   when it ships one, exactly as `/icon.svg` already works.
 */

/** Addresses the manifest publishes; each falls back to the product's own. */
export const PREBOOT_ICONS = [
  { route: '/icon.svg', asset: 'assets/icon.svg' },
  { route: '/icon-180.png', asset: 'assets/icon-180.png' },
  { route: '/icon-192.png', asset: 'assets/icon-192.png' },
  { route: '/icon-512.png', asset: 'assets/icon-512.png' },
] as const

export const MANIFEST_ROUTE = '/manifest.webmanifest'

/**
 * What a skin may say about itself.
 *
 * Everything here is a NAME or a COLOUR — the two things that make one
 * instance discernible from another on a home screen full of them. Anything
 * else a fragment declares is dropped and reported: a silently ignored field
 * is an hour spent wondering why nothing happens.
 */
const DRESSING_FIELDS = new Set([
  'name',
  'short_name',
  'description',
  'theme_color',
  'background_color',
  'lang',
  'dir',
  'categories',
])

export interface WebManifest {
  readonly [key: string]: unknown
}

export interface ManifestBaseOptions {
  /** The instance's language, when its operator set one. */
  readonly locale?: string | undefined
}

/**
 * The product's own manifest.
 *
 * `id` and `scope` are the origin's root: one instance is one origin, so two
 * Golems never collide as one install. The colours are the light palette's
 * `--surface` — a manifest has no media query, and the splash screen a phone
 * paints before the shell boots is better light-and-right than dark-and-wrong.
 * A skin with a dark body overrides both.
 */
export function baseManifest(options: ManifestBaseOptions = {}): WebManifest {
  return {
    id: '/',
    name: 'Golem',
    short_name: 'Golem',
    description: 'A workspace shared with an agent.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#eef1f6',
    background_color: '#eef1f6',
    ...(options.locale ? { lang: options.locale } : {}),
    icons: [
      // First, and deliberately: a vector icon is the one a skin gets for free,
      // because a skin already ships `assets/icon.svg` for the favicon.
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // The same file, claimed twice on purpose. The rasters are opaque and
      // full-bleed, which is exactly what a maskable icon must be — Android
      // crops it to whatever shape the launcher wears, and a transparent
      // corner comes back as black.
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

export interface MergedManifest {
  readonly manifest: WebManifest
  /** Fields the fragment declared that this contract does not carry. */
  readonly ignored: readonly string[]
}

/**
 * Merges a skin's fragment over the product's manifest.
 *
 * Shallow by design: every field a skin may set is a scalar or a list it
 * replaces whole. A deep merge would let a livery half-edit a structure it
 * cannot see, which is how you get a manifest nobody can predict from reading
 * either half.
 */
export function mergeSkinManifest(base: WebManifest, fragment: unknown): MergedManifest {
  if (fragment === undefined || fragment === null) return { manifest: base, ignored: [] }
  if (typeof fragment !== 'object' || Array.isArray(fragment)) {
    return { manifest: base, ignored: ['(root)'] }
  }

  const merged: Record<string, unknown> = { ...base }
  const ignored: string[] = []

  for (const [key, value] of Object.entries(fragment as Record<string, unknown>)) {
    if (!DRESSING_FIELDS.has(key)) {
      ignored.push(key)
      continue
    }
    if (key === 'categories') {
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        merged[key] = value
      } else {
        ignored.push(key)
      }
      continue
    }
    // A field declared with the wrong type is refused rather than passed on:
    // a manifest a browser rejects wholesale costs the install, not the field.
    if (typeof value === 'string' && value.length > 0) merged[key] = value
    else ignored.push(key)
  }

  return { manifest: merged, ignored }
}
