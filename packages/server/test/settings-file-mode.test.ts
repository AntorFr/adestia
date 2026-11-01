/**
 * Saving the configuration must not relax the file's mode (P-10, B-13).
 * A file kept at 0600 holds an instance's secrets; the rename path used to
 * hand it back in the umask's default mode.
 */

import { chmod, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { replaceContents } from '../src/settings-file.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

const modeOf = async (file: string) => (await stat(file)).mode & 0o777

const ebusy = () => {
  const error = new Error('EBUSY') as NodeJS.ErrnoException
  error.code = 'EBUSY'
  return Promise.reject(error)
}

describe('the configuration file keeps its mode across a save', () => {
  it('keeps 0600 through the rename path', async () => {
    // Fails if the chmod of the temporary before the rename is removed.
    const file = join(await tmpDir('adestia-mode-'), 'adestia.config.yaml')
    await writeFile(file, 'name: A\n')
    await chmod(file, 0o600)
    const done = await replaceContents(file, 'name: B\n')
    expect(done).toEqual({ how: 'renamed' })
    expect(await readFile(file, 'utf8')).toBe('name: B\n')
    expect(await modeOf(file)).toBe(0o600)
  })

  it('keeps 0600 through the in-place path', async () => {
    const file = join(await tmpDir('adestia-mode-'), 'adestia.config.yaml')
    await writeFile(file, 'name: A\n')
    await chmod(file, 0o600)
    const done = await replaceContents(file, 'name: B\n', ebusy)
    expect(done).toEqual({ how: 'in-place' })
    expect(await modeOf(file)).toBe(0o600)
  })

  it('carries a non-default mode too (0640), not just 0600', async () => {
    const file = join(await tmpDir('adestia-mode-'), 'adestia.config.yaml')
    await writeFile(file, 'name: A\n')
    await chmod(file, 0o640)
    await replaceContents(file, 'name: B\n')
    expect(await modeOf(file)).toBe(0o640)
  })

  it('leaves an absent target at the default mode and still writes it', async () => {
    const file = join(await tmpDir('adestia-mode-'), 'adestia.config.yaml')
    const done = await replaceContents(file, 'name: B\n')
    expect(done).toEqual({ how: 'renamed' })
    expect(await readFile(file, 'utf8')).toBe('name: B\n')
    expect(await modeOf(file)).toBe(0o666 & ~process.umask())
  })
})
