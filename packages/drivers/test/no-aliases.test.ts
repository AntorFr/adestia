import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('the drivers module bindings (R-2, AD-26)', () => {
  it('keeps no one-line identifier aliases in production sources', async () => {
    const root = fileURLToPath(new URL('../src/', import.meta.url))
    const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith('.ts')).sort()
    expect(files.length).toBeGreaterThan(0)
    const aliases: string[] = []
    for (const file of files) {
      const source = await readFile(join(root, file), 'utf8')
      for (const [index, line] of source.split(/\r?\n/).entries()) {
        const binding = /^(?:export )?const \w+ = ([\w.]+)$/.exec(line)
        if (!binding) continue
        const value = binding[1]!
        // Literal constants have no other binding whose name could drift.
        if (/^(?:true|false|null|undefined)$/.test(value) || /^\d[\d_]*(?:\.\d[\d_]*)?$/.test(value)) continue
        aliases.push(`${file}:${index + 1}: ${line}`)
      }
    }
    expect(aliases).toEqual([])
  })
})
