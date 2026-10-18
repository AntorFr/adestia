import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = join(__dirname, '..', 'src', 'app', 'styles')

describe('the reader, editor and Crepe sheets draw their type from the --text-* scale', () => {
  for (const file of ['reader.css', 'editor.css', 'crepe.css']) {
    it(`${file} has no font-size in em, px or rem`, () => {
      const hits = readFileSync(join(styles, file), 'utf8')
        .split('\n')
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(({ line }) => /(^|[;{\s])font-size:\s*[\d.]+(px|rem|em)\b/.test(line))
      expect(hits).toEqual([])
    })
  }
})

describe('a diagnostic’s line number stays on one line', () => {
  it('.adestia-diagnostics__line does not wrap or shrink in its flex row', () => {
    const css = readFileSync(join(styles, 'editor.css'), 'utf8')
    const rule = /\.adestia-diagnostics__line\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule).toMatch(/white-space:\s*nowrap/)
    expect(rule).toMatch(/flex-shrink:\s*0/)
  })
})
