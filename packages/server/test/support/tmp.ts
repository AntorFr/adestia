/**
 * Throwaway directories, removed together. A file registers `afterEach(cleanTmp)`;
 * one that builds its tree once, in a `beforeAll`, registers `afterAll(cleanTmp)`.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const made = new Set<string>()

/** `mkdtemp` under the OS temp directory, remembered for `cleanTmp`. */
export async function tmpDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  made.add(dir)
  return dir
}

/** Removes every directory `tmpDir` made since the last call. */
export async function cleanTmp(): Promise<void> {
  const dirs = [...made]
  made.clear()
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
}
