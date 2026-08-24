/**
 * The shell's stroke-icon set.
 *
 * A tile whose identity is a drawn glyph rather than an emoji names one of
 * these in its manifest (`glyph: "ic:todo"`). The set is SHELL-OWNED on
 * purpose: a manifest is data, and letting it carry raw SVG would make every
 * plugin folder an injection surface for the launcher screen — whereas naming
 * a glyph from a closed set costs nothing and covers the actual need, which
 * is two icons the predecessor drew once and kept.
 */
export const GLYPHS: Readonly<Record<string, string>> = {
  todo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l4 4 12-12"/></svg>',
  shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>',
}

/** `ic:todo` → the markup, or undefined for anything else. */
export function glyphOf(name: string | undefined): string | undefined {
  if (!name?.startsWith('ic:')) return undefined
  return GLYPHS[name.slice(3)]
}
