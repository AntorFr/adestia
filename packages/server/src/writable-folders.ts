/**
 * The folders a person could write a page into — an HINT for the shell.
 *
 * A folder is a directory of a store (the store's own root, at its mount point,
 * and every directory below it). A folder that is only the logical parent of a
 * mount is held by no one and never appears. The answer is the shell's cue to
 * draw or withhold a button; the write itself stays the verdict.
 */
import { access, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'

import type { Store } from './stores.js'

/** Same rule as the shell's `absorbs`: a run of segments anywhere in the path. */
function absorbed(declared: string, folder: string): boolean {
  const parts = folder.split('/')
  const wanted = declared.split('/')
  for (let start = 0; start + wanted.length <= parts.length; start += 1) {
    if (wanted.every((segment, offset) => parts[start + offset] === segment)) return true
  }
  return false
}

/**
 * A default store whose directory does not exist yet (a fresh instance) is
 * still one a person can write into: the first write creates it. True when its
 * nearest existing ancestor is a directory this process may write in.
 */
export async function creatableRoot(store: Store): Promise<boolean> {
  if (!store.isDefault) return false
  let dir = store.dir
  for (;;) {
    const info = await stat(dir).catch(() => undefined)
    if (info) {
      if (!info.isDirectory()) return false
      return access(dir, constants.W_OK).then(
        () => true,
        () => false,
      )
    }
    const up = dirname(dir)
    if (up === dir) return false
    dir = up
  }
}

async function collect(
  store: Store,
  from: string,
  into: Set<string>,
  all?: Set<string>,
): Promise<void> {
  const dir = from ? join(store.dir, from) : store.dir
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    if (from === '' && (await creatableRoot(store))) into.add(store.at)
    return
  }
  const logical = [store.at, from].filter((part) => part !== '').join('/')
  const writable = await access(dir, constants.W_OK).then(
    () => true,
    () => false,
  )
  if (writable) into.add(logical)
  if (all && logical !== '') all.add(logical)
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => collect(store, from ? `${from}/${entry.name}` : entry.name, into, all)),
  )
}

export async function writableFolders(
  stores: readonly Store[],
  absorbs: readonly string[],
  order: Intl.Collator,
): Promise<string[]> {
  const found = new Set<string>()
  await Promise.all(stores.map((store) => collect(store, '', found)))
  return [...found]
    .filter((folder) => !absorbs.some((declared) => absorbed(declared, folder)))
    .sort((a, b) => order.compare(a, b))
}

/**
 * Every folder that exists as a directory in some store, empty ones included
 * (`''`, the root, is left out). Not filtered by write access: a read-only
 * folder is still a folder the home and E-3 must show.
 */
export async function allFolders(
  stores: readonly Store[],
  order: Intl.Collator,
): Promise<string[]> {
  const found = new Set<string>()
  const all = new Set<string>()
  await Promise.all(stores.map((store) => collect(store, '', found, all)))
  return [...all].sort((a, b) => order.compare(a, b))
}

/** Whether an active app absorbs the folder (E-36: not writable, not offered). */
export const isAbsorbed = (declared: readonly string[], folder: string): boolean =>
  declared.some((one) => absorbed(one, folder))
