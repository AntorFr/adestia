// @vitest-environment jsdom
/**
 * The reader's DOM for every page of the non-regression corpus, pinned.
 *
 * `packages/content/test/fixtures/corpus/<name>.html` is what the reader of
 * `main` renders for `<name>.md`: the reference the reading task has to keep.
 * Missing snapshots are written only with `CORPUS_WRITE=1`.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { Reader } from '../src/editor/Reader.js'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content', 'test', 'fixtures', 'corpus')
const names = readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
const write = process.env['CORPUS_WRITE'] === '1'
// The day the seeds were taken: some pages carry dates relative to it.
const DAY = Date.UTC(2026, 10, 12, 12, 0, 0)
const fetchImpl = (async () => new Response(JSON.stringify({ files: [] }))) as typeof fetch

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: DAY })
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

it('has pages to render', () => {
  expect(names.length).toBeGreaterThan(0)
})

for (const name of names) {
  it(`${name} renders the DOM main renders`, async () => {
    const markdown = readFileSync(join(dir, name), 'utf8')
    const view = render(<Reader markdown={markdown} fetchImpl={fetchImpl} />)
    await act(async () => {})
    const html = view.container.innerHTML
    const pin = join(dir, name.replace(/\.md$/, '.html'))
    if (write && !existsSync(pin)) writeFileSync(pin, html)
    expect(existsSync(pin), 'no .html pins this fixture').toBe(true)
    expect(html).toBe(readFileSync(pin, 'utf8'))
  })
}
