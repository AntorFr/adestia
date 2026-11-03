import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repo = join(__dirname, '../../..')
const css = readFileSync(join(repo, 'packages/web/src/app/styles/offline.css'), 'utf8')

// Panne visée : le bandeau suit le canvas défilé (E-14 : bouton Redémarrer au bas du formulaire)
// seulement s'il est sticky sous l'en-tête ; sans cela il sort de l'écran quand le serveur tombe.
describe('the offline banner inside a scrolled canvas', () => {
  it('stays on screen: sticky below the canvas header, in the flow, never over it', () => {
    const rule = /\.adestia-canvas__body\s*>\s*\.adestia-offline\s*\{([^}]*position:\s*sticky[^}]*)\}/.exec(css)
    expect(rule).not.toBeNull()
    // Panne visée : un `top` en dur qui diverge de la hauteur réelle de l'en-tête laisse une fente
    // où passe le texte défilé ; les deux lisent donc UNE variable, posée sur leur parent commun.
    expect(rule![1]).toMatch(/top:\s*var\(--canvas-header-h\)/)
    expect(rule![1]).not.toMatch(/top:\s*\d+px/)
    const canvasCss = readFileSync(join(repo, 'packages/web/src/app/styles/canvas.css'), 'utf8')
    const parent = /\.adestia-canvas\s*\{([^}]*)\}/.exec(canvasCss)
    expect(parent![1]).toMatch(/--canvas-header-h:\s*\d+px/)
    const header = /\.adestia-canvas__header\s*\{([^}]*)\}/.exec(canvasCss)
    expect(header![1]).toMatch(/min-height:\s*var\(--canvas-header-h\)/)
    expect(header![1]).toMatch(/box-sizing:\s*border-box/)
    expect(css).not.toMatch(/position:\s*(fixed|absolute)/)
    expect(css).not.toMatch(/z-index/)
  })
})
