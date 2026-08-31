/**
 * The queue's own state — and the frontier this file exists to hold.
 *
 * Two things happen in a browser here that are NOT memory: a link pasted into
 * the drop box before anybody decided it was worth keeping, and a candidate
 * waved away. Neither is a judgement worth a page; both would be litter in a
 * workspace somebody actually reads. So they live in the instance's `dataDir`
 * — the same place conversations live — and the pages tree only ever receives
 * what a person or the agent DECIDED to keep.
 *
 * The consequence is deliberate and worth knowing: wipe `dataDir` and you
 * lose the queue, never the library.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

export const emptyState = () => ({ version: 1, dropped: {}, dismissed: {} })

export const stateFile = (dataDir, pluginId = 'listening-post') =>
  join(dataDir, pluginId, 'queue.json')

export async function readState(file) {
  try {
    const state = JSON.parse(await readFile(file, 'utf8'))
    return { ...emptyState(), ...state, dropped: state.dropped ?? {}, dismissed: state.dismissed ?? {} }
  } catch {
    return emptyState()
  }
}

export async function writeState(file, state) {
  await mkdir(dirname(file), { recursive: true })
  // Atomic: a drop and a dismissal can land in the same second from two tabs,
  // and a half-written queue is a queue that comes back empty.
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(state, null, 1))
  await rename(temporary, file)
}

/** Now, to the second. Milliseconds in a state file are noise nobody reads. */
export const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z')
