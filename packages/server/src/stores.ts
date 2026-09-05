/**
 * The stores — the one module that knows where the bytes actually are.
 *
 * Memory stopped being a directory and became a COMPOSITION. A domain is not
 * filed in a store; it is the union of what each store carries under the same
 * logical path. Everything else in this server — the page routes, the file
 * routes, the watcher, the plugin host — asks this module and never holds a
 * root of its own, which is what lets the physical layout change without any
 * of them noticing.
 *
 * Four rules shape every function below, and each has a failure it prevents.
 *
 * **A logical path never names a store.** `domaines/cadeaux/idee-x` is a NAME;
 * the store is a fact of LOCATION. This is what makes moving a card from one
 * circle to another break no wikilink, no favourite, no reference — and
 * without it nothing else here is worth having.
 *
 * **Nor does it name the filesystem.** A store declares WHERE its bytes live
 * (`dir`) and WHERE it appears in the tree (`at`). `/shared/famille/voyage`
 * can surface as `voyages/famille`, and nothing outside this file knows.
 *
 * **Precedence is the default store, then the rest.** The default store is the
 * one this shell writes to: a card there is mine, I made it, it is the one I
 * meant. Between two shared circles no such claim exists, so deciding would be
 * guessing — which is why `candidatesOf` returns them ALL, in order, and lets
 * the caller refuse rather than pick.
 *
 * **The traversal guard applies store by store**, after the mount prefix is
 * stripped. A `../` must not walk out of one store by borrowing the presence
 * of another.
 */

import { readdir, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

/** What an operator writes in the configuration. */
export interface StoreDeclaration {
  readonly id: string
  /** Absolute, or relative to the workspace root. */
  readonly path: string
  /** Mount point in the logical tree. Absent means the root. */
  readonly at?: string | undefined
  readonly label?: string | undefined
  readonly hue?: string | undefined
  readonly default?: boolean | undefined
}

/** What the rest of the server is handed: resolved, ordered, checked. */
export interface Store {
  readonly id: string
  /** What a person reads — the store's own name, falling back to its id. */
  readonly label: string
  /** A hue name a skin may resolve; the card's rim and tab take it. */
  readonly hue?: string | undefined
  /** Absolute directory. */
  readonly dir: string
  /** Normalized mount point: `''` is the root. */
  readonly at: string
  readonly isDefault: boolean
}

/** A logical path, and the store that carries it. */
export interface Candidate {
  readonly store: Store
  /** The absolute file, guard already applied. */
  readonly file: string
}

const clean = (path: string): string => path.replace(/^\/+|\/+$/g, '')

/** Whether a logical path sits under a mount point, at a segment boundary. */
function under(at: string, path: string): boolean {
  if (at === '') return true
  return path === at || path.startsWith(`${at}/`)
}

/** A resolved path that stayed inside the directory it was resolved against. */
function inside(dir: string, target: string): boolean {
  const rel = relative(dir, target)
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(`..${sep}`)
}

/**
 * Declarations to stores, or the reasons why not.
 *
 * Refused at boot rather than repaired: a duplicated id, or a default mounted
 * below the root, produces a tree whose shape nobody can predict — and the
 * repair would have to guess which half the operator meant.
 */
export function resolveStores(
  declared: readonly StoreDeclaration[],
  workspaceRoot: string,
): { stores: readonly Store[]; issues: readonly string[] } {
  const issues: string[] = []
  if (declared.length === 0) return { stores: [], issues: ['workspace.stores is empty'] }

  const seen = new Set<string>()
  for (const one of declared) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(one.id)) {
      issues.push(`workspace.stores: "${one.id}" is not a usable id (letters, digits, - and _)`)
    }
    if (seen.has(one.id)) issues.push(`workspace.stores: two stores are called "${one.id}"`)
    seen.add(one.id)
    if (one.path.trim() === '') issues.push(`workspace.stores.${one.id}: path is empty`)
  }

  const flagged = declared.filter((one) => one.default === true)
  if (flagged.length > 1) {
    issues.push(
      `workspace.stores: ${flagged.map((s) => s.id).join(' and ')} both claim to be the default`,
    )
  }
  // Declared, else the only one, else the first: an operator with a single
  // store never writes `default: true`, and one with several usually means the
  // store written first.
  const chosen = flagged[0] ?? declared[0]
  if (chosen && clean(chosen.at ?? '') !== '') {
    // The default store IS the root of the tree. Mounting it lower would leave
    // the tree with no level zero, and every path would start inside somebody
    // else's subfolder.
    issues.push(`workspace.stores.${chosen.id}: the default store cannot declare "at"`)
  }

  const stores: Store[] = declared.map((one) => ({
    id: one.id,
    label: one.label && one.label !== '' ? one.label : one.id,
    ...(one.hue ? { hue: one.hue } : {}),
    dir: isAbsolute(one.path) ? resolve(one.path) : resolve(workspaceRoot, one.path),
    at: one === chosen ? '' : clean(one.at ?? ''),
    isDefault: one === chosen,
  }))

  // The default first, then declaration order. That order IS the precedence,
  // and it is also the order a legend lists them in.
  return {
    stores: [...stores].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
    issues,
  }
}

/**
 * The absolute file a logical path names inside ONE store, or undefined.
 *
 * The guard lives here, and it is per store: the mount prefix is stripped
 * first, and the result must still resolve inside that store's own directory.
 */
export function fileIn(store: Store, logical: string): string | undefined {
  // A NUL truncates a path at the syscall boundary: `a.md\0.png` reaches the
  // kernel as `a.md`, so a check made on the whole string would have approved
  // something other than what gets opened.
  if (logical.includes('\0')) return undefined
  const path = clean(logical)
  if (path === '' || !under(store.at, path)) return undefined
  const rest = store.at === '' ? path : path.slice(store.at.length + 1)
  if (rest === '') return undefined
  const target = resolve(store.dir, `./${rest}`)
  return inside(store.dir, target) ? target : undefined
}

/** The reverse: an absolute file back to the name the whole product speaks. */
export function logicalOf(stores: readonly Store[], file: string): string | undefined {
  const target = resolve(file)
  for (const store of stores) {
    if (!inside(store.dir, target)) continue
    const path = relative(store.dir, target).split(sep).join('/')
    return store.at === '' ? path : `${store.at}/${path}`
  }
  return undefined
}

/**
 * Every store that actually carries a logical path, in precedence order.
 *
 * ALL of them, never just the first: reading is where a collision must not be
 * settled in silence, and only the caller knows whether this is a read that
 * may fall back to precedence or one that must refuse and show the choice.
 */
export async function candidatesOf(
  stores: readonly Store[],
  logical: string,
): Promise<readonly Candidate[]> {
  const found: Candidate[] = []
  for (const store of stores) {
    const file = fileIn(store, logical)
    if (!file) continue
    const info = await stat(file).catch(() => undefined)
    if (info?.isFile()) found.push({ store, file })
  }
  return found
}

export interface Listed {
  /** The name the whole product speaks. */
  readonly path: string
  readonly store: Store
  readonly file: string
}

async function walk(
  store: Store,
  from: string,
  prefix: string,
  into: Listed[],
  keep: ((name: string) => boolean) | undefined,
  deep: boolean,
): Promise<void> {
  let entries
  try {
    entries = await readdir(join(store.dir, from), { withFileTypes: true })
  } catch {
    // A store whose directory is missing or unreadable contributes nothing and
    // breaks nothing: one circle unmounted must not take the others down.
    return
  }
  for (const entry of entries) {
    // Dotfiles are the workspace's plumbing and the agent's business, not the
    // content this composes.
    if (entry.name.startsWith('.')) continue
    const next = from ? `${from}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      // Two homonymous FOLDERS are not a collision: they merge. That is the
      // whole point of composing rather than filing.
      if (deep) await walk(store, next, prefix, into, keep, deep)
      continue
    }
    if (keep && !keep(entry.name)) continue
    into.push({
      path: prefix ? `${prefix}/${next}` : next,
      store,
      file: join(store.dir, next),
    })
  }
}

/**
 * The union of every store, as logical paths.
 *
 * Returns EVERY copy — precedence order, so the first occurrence of a path is
 * the one a bare address resolves to — plus the paths more than one store
 * carries. Showing both and naming the clash is deliberate: the predecessor
 * hid the loser, and a card believed corrected while another was read is a
 * failure that only surfaces afterwards.
 *
 * With a single store the answer is that store's tree, in that store's order.
 * That identity is what the byte-for-byte witness exists to hold.
 */
export async function listAll(
  stores: readonly Store[],
  options: {
    readonly under?: string | undefined
    /** Which file names count. Absent, every file does. */
    readonly keep?: ((name: string) => boolean) | undefined
    /**
     * Whether to descend. A page's own companions are the files in ITS folder
     * and nothing below it — a project folder would otherwise show every
     * child's documents as its own — while `assets/` is taken whole.
     */
    readonly deep?: boolean | undefined
  } = {},
): Promise<{ entries: readonly Listed[]; collisions: readonly string[] }> {
  const wanted = clean(options.under ?? '')
  const keep = options.keep
  const deep = options.deep !== false

  const entries: Listed[] = []
  for (const store of stores) {
    // Three ways a requested folder meets a mount point, and only the third is
    // a miss: the folder sits inside the store, the store sits inside the
    // folder (a store mounted at `voyages/famille` answers `?under=voyages`),
    // or the two are unrelated.
    let from: string
    if (wanted === '' || under(wanted, store.at)) from = ''
    else if (under(store.at, wanted)) from = store.at === '' ? wanted : wanted.slice(store.at.length + 1)
    else continue

    // A traversal attempt is a miss for THIS store, not a shortcut into it.
    if (from !== '' && !fileIn(store, store.at === '' ? from : `${store.at}/${from}`)) continue
    await walk(store, from, store.at, entries, keep, deep)
  }

  const seen = new Set<string>()
  const collisions = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.path)) collisions.add(entry.path)
    seen.add(entry.path)
  }
  return { entries, collisions: [...collisions].sort() }
}

/**
 * Where a write goes — deduced, or refused.
 *
 * An existing page goes back to its own store; a new one in a folder a single
 * store carries goes there; a new one in a folder several stores carry is
 * REFUSED with the candidates named. That last case is the only one nobody can
 * deduce, and a silent choice there is how a card lands in somebody else's
 * circle.
 */
export type WriteTarget =
  | { readonly kind: 'store'; readonly store: Store; readonly file: string }
  | { readonly kind: 'ambiguous'; readonly stores: readonly Store[] }

export async function targetFor(
  stores: readonly Store[],
  logical: string,
): Promise<WriteTarget> {
  const existing = await candidatesOf(stores, logical)
  const carrier = existing[0]
  if (carrier) return { kind: 'store', store: carrier.store, file: carrier.file }

  const folder = clean(logical).split('/').slice(0, -1).join('/')
  const holders: Store[] = []
  for (const store of stores) {
    if (folder === '') {
      // The tree's root belongs to the default store: it is the only one
      // mounted there.
      if (store.isDefault) holders.push(store)
      continue
    }
    const dir = fileIn(store, folder)
    if (!dir) continue
    const info = await stat(dir).catch(() => undefined)
    if (info?.isDirectory()) holders.push(store)
  }

  if (holders.length > 1) return { kind: 'ambiguous', stores: holders }
  // A folder nobody carries yet is a folder about to be created, and it is
  // created where this shell writes.
  const target = holders[0] ?? stores.find((one) => one.isDefault) ?? stores[0]
  const file = target ? fileIn(target, logical) : undefined
  return target && file
    ? { kind: 'store', store: target, file }
    : { kind: 'ambiguous', stores: [] }
}
