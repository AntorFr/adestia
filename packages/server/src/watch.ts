/**
 * The change feed — how an open shell learns the workspace moved.
 *
 * The agent writes pages with its own native file tools, so no route in this
 * server ever sees those writes happen. Without a feed, a page the agent just
 * created exists everywhere except on the screen of the person who asked for
 * it: the shell's index is a snapshot taken at boot. This is the "light event
 * bus (file watcher → live app refresh)" the design names next to the turn
 * stream.
 *
 * Three decisions shape this file:
 *
 * - **The watcher runs only while somebody is subscribed.** A server nobody is
 *   looking at does no filesystem work — which matters doubly in polling mode,
 *   where watching is a periodic scan of the whole tree.
 * - **Events are debounced into batches.** An agent turn writes in bursts
 *   (a Write, two Edits, a rename); one `pages-changed` frame per burst is a
 *   signal, one per syscall is noise the browser answers with a fetch each.
 * - **Polling is a config choice, not a guess.** Native events cannot cross
 *   some mount boundaries (WSL's /mnt/c, NFS, SMB, some Docker bind mounts);
 *   only the operator knows their workspace sits on one.
 */

import { sep } from 'node:path'

/** What a subscriber is told: the pages whose files changed, batched. */
export interface PagesChangedEvent {
  readonly type: 'pages-changed'
  readonly paths: readonly string[]
}

/**
 * A change worth announcing, from a path relative to the pages root.
 *
 * Same contract as the pages API: markdown only — a `.tmp` mid-save or an
 * attachment sitting next to a page is not a page — and nothing under a
 * dotted segment, which is the workspace's plumbing rather than its content.
 * Returned with forward slashes whatever the platform, because the value is
 * an API path, not a filesystem one.
 */
export function pagePathOf(path: string): string | undefined {
  const rel = path.split(sep).join('/')
  if (rel === '' || rel.startsWith('../') || rel === '..') return undefined
  if (!rel.endsWith('.md')) return undefined
  if (rel.split('/').some((segment) => segment.startsWith('.'))) return undefined
  return rel
}

/**
 * Subscribers and the debounce between the disk and them.
 *
 * `quietMs` of silence flushes a batch; `maxWaitMs` bounds how long a busy
 * burst can hold one back — an agent writing for a minute straight must not
 * leave the shell a minute stale.
 */
export class ChangeFeed {
  #listeners = new Set<(paths: readonly string[]) => void>()
  #pending = new Set<string>()
  #quiet: NodeJS.Timeout | undefined
  #deadline: NodeJS.Timeout | undefined

  constructor(
    private readonly quietMs = 250,
    private readonly maxWaitMs = 1000,
  ) {}

  subscribe(listener: (paths: readonly string[]) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  report(path: string): void {
    this.#pending.add(path)
    if (this.#quiet) clearTimeout(this.#quiet)
    this.#quiet = setTimeout(() => this.#flush(), this.quietMs)
    this.#deadline ??= setTimeout(() => this.#flush(), this.maxWaitMs)
  }

  #flush(): void {
    if (this.#quiet) clearTimeout(this.#quiet)
    if (this.#deadline) clearTimeout(this.#deadline)
    this.#quiet = undefined
    this.#deadline = undefined
    if (this.#pending.size === 0) return
    const paths = [...this.#pending].sort()
    this.#pending.clear()
    for (const listener of this.#listeners) listener(paths)
  }

  close(): void {
    if (this.#quiet) clearTimeout(this.#quiet)
    if (this.#deadline) clearTimeout(this.#deadline)
    this.#listeners.clear()
    this.#pending.clear()
  }
}

// The route registration lives under `routes/`; kept importable from here.
export { registerEvents, type EventsOptions } from './routes/watch.js'
