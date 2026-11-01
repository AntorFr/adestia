// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

// The arrow of Nestor's invitation is a drawing in currentColor, not a font
// glyph (a glyph rendered differently, or not at all, on a phone).
async function nestor(): Promise<(context?: unknown) => { hero: (host: HTMLElement, ctx: unknown) => void }> {
  const path = '../../../skins/nestor/skin.js'
  return (await import(/* @vite-ignore */ path)).default
}

describe.each(['en', 'fr'])('Nestor invitation arrow (%s)', (locale) => {
  it('is an <svg> in currentColor with no character', async () => {
    const context = { locale, focusComposer: () => {} }
    const host = document.createElement('div')
    document.body.appendChild(host)
    ;(await nestor())(context).hero(host, context)
    const mark = host.querySelector('.nst-invite i')!
    expect(mark).not.toBeNull()
    const svg = mark.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.getAttribute('stroke')).toBe('currentColor')
    expect(svg!.querySelector('path')).not.toBeNull()
    expect(mark.textContent!.trim()).toBe('')
    expect(mark.textContent).not.toContain('↑')
  })
})
