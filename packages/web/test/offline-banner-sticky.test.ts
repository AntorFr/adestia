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
    expect(rule![1]).toMatch(/top:\s*56px/)
    expect(css).not.toMatch(/position:\s*(fixed|absolute)/)
    expect(css).not.toMatch(/z-index/)
  })
})
