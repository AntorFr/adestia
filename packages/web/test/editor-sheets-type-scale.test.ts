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
