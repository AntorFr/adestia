/**
 * The settings of a folder (AD-40) — `<folder>/.folder.md`, front matter only.
 *
 * This module is the ONLY place that names the file. The refusal of dotted
 * names stays everywhere else (`stores.ts` listing, `files.ts`, `watch.ts`,
 * uploads); the exception is narrow by its single exact name and by its two
 * doors: a read for the page index, a write for the settings route and the
 * agent's tool. The file is never a page, never a file, never an attachment.
 *
 * Two rules shape the write, and each has a failure it prevents:
 *
 * - **The six known keys are written as a whole, the others never touched.**
 *   A screen that knows six keys must not erase a seventh an agent or a
 *   person wrote; the file on disk is the source of the unknown ones.
 * - **The revision is the hash of the bytes read.** The screen and the agent
 *   send back what they read; a file changed behind them is a 409, never a
 *   silent overwrite.
 */

import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'

import { CORE_FIELDS } from '@antorfr/adestia-content'
import type { FolderSettings, FolderSettingsEntry } from '@antorfr/adestia-schemas'
import { isMap, parseDocument, type Document } from 'yaml'

import { splitFrontmatter } from './frontmatter.js'
import { gated } from './io.js'
import { candidatesOf, fileIn, type Store } from './stores.js'

/** The one name. Nothing outside this module spells it. */
const FILE = '.folder.md'

/** The six keys the product knows, in the order they are written. */
const FOLDER_SETTING_KEYS = ['title', 'ico', 'couleur', 'app', 'attachments', 'page'] as const

const HUES: readonly string[] =
  CORE_FIELDS.find((field) => field.key === 'couleur')?.values ?? []

/** Whether a logical page path names the settings file (the page routes refuse it). */
export function isFolderSettingsPath(logical: string): boolean {
  return logical.split('/').pop() === FILE
}

const revisionOfBytes = (bytes: string): string =>
  createHash('sha256').update(bytes).digest('hex').slice(0, 32)

/** A value of one known key, or undefined when it is not valid for it. */
function validValue(key: (typeof FOLDER_SETTING_KEYS)[number], value: unknown): string | boolean | undefined {
  if (key === 'attachments') return typeof value === 'boolean' ? value : undefined
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (text === '' || text.length > 200 || /[\r\n\0]/.test(text)) return undefined
  if (key === 'couleur') return HUES.includes(text) ? text : undefined
  if (key === 'page') return text.endsWith('.md') && !text.includes('/') && !text.startsWith('.') ? text : undefined
  return text
}

interface Read {
  readonly settings: FolderSettings
  readonly revision: string
  readonly text: string
}

/** The head of a file as a YAML document; a body found there is ignored. */
function headOf(text: string) {
  const { head } = splitFrontmatter(text)
  return parseDocument(head ?? '')
}

function parseFile(text: string): FolderSettings {
  const document = headOf(text)
  const value = document.toJS({ maxAliasCount: 0 }) as unknown
  const settings: Record<string, string | boolean> = {}
  if (document.errors.length > 0 || value === null || typeof value !== 'object' || Array.isArray(value)) {
    return settings as FolderSettings
  }
  const given = value as Record<string, unknown>
  for (const key of FOLDER_SETTING_KEYS) {
    // A value that does not fit its key is left out: the screen draws the
    // default rather than a hue that does not exist.
    const kept = validValue(key, given[key])
    if (kept !== undefined) settings[key] = kept
  }
  return settings as FolderSettings
}

/** The directories of a logical folder, one per store holding it, precedence order. */
async function holdersOf(stores: readonly Store[], folder: string): Promise<{ store: Store; dir: string }[]> {
  const held: { store: Store; dir: string }[] = []
  for (const store of stores) {
    const dir = folder === store.at ? store.dir : fileIn(store, folder)
    if (!dir) continue
    const info = await stat(dir).catch(() => undefined)
    if (info?.isDirectory()) held.push({ store, dir })
  }
  return held
}

const cache = new Map<string, { key: string; read: Read }>()

async function readIn(dir: string): Promise<Read | undefined> {
  const file = join(dir, FILE)
  const info = await stat(file).catch(() => undefined)
  if (!info?.isFile()) {
    cache.delete(file)
    return undefined
  }
  const key = `${info.mtimeMs}-${info.size}`
  const known = cache.get(file)
  if (known?.key === key) return known.read
  let text: string
  try {
    text = await gated(() => readFile(file, 'utf8'))
  } catch {
    return undefined
  }
  const read: Read = { settings: parseFile(text), revision: revisionOfBytes(text), text }
  cache.set(file, { key, read })
  return read
}

/**
 * The settings of every folder that has a file, keyed by logical folder.
 *
 * `folders` is the list the index already computed (every folder that exists
 * in some store). Where several stores hold a folder, the file read is the
 * first store's that has one.
 */
export async function folderSettingsOf(
  stores: readonly Store[],
  folders: readonly string[],
): Promise<Record<string, FolderSettingsEntry>> {
  const out: Record<string, FolderSettingsEntry> = {}
  await Promise.all(
    folders.map(async (folder) => {
      for (const { dir } of await holdersOf(stores, folder)) {
        const read = await readIn(dir)
        if (read) {
          out[folder] = { ...read.settings, revision: read.revision }
          return
        }
      }
    }),
  )
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

type FolderSettingsResult =
  | { readonly ok: true; readonly settings: FolderSettings; readonly revision: string }
  | { readonly ok: false; readonly status: 400 | 403 | 404 | 409; readonly error: string; readonly revision?: string }

const refuse = (status: 400 | 403 | 404 | 409, error: string, revision?: string): FolderSettingsResult => ({
  ok: false,
  status,
  error,
  ...(revision === undefined ? {} : { revision }),
})

const writable = (path: string): Promise<boolean> =>
  access(path, constants.W_OK).then(
    () => true,
    () => false,
  )

function validFolder(folder: unknown): folder is string {
  if (typeof folder !== 'string' || folder === '' || folder.includes('\0')) return false
  return folder.split('/').every((part) => part !== '' && !part.startsWith('.'))
}

/**
 * Validate and write one folder's settings — the whole of the route's rules,
 * so the screen and the agent's tool share one code path.
 *
 * `request` is the raw body: `{path, settings, revision?}` and nothing else
 * (a `body`, `markdown` or `content` key is a body, and refused).
 */
export async function writeFolderSettings(stores: readonly Store[], request: unknown): Promise<FolderSettingsResult> {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    return refuse(400, 'a JSON object is required')
  }
  const given = request as Record<string, unknown>
  for (const key of Object.keys(given)) {
    if (!['path', 'settings', 'revision'].includes(key)) {
      return refuse(400, `${key} is not accepted: ${FILE} holds settings only, never content`)
    }
  }
  const folder = given['path']
  if (!validFolder(folder)) return refuse(400, 'path is required')
  const asked = given['settings']
  if (asked === null || typeof asked !== 'object' || Array.isArray(asked)) {
    return refuse(400, 'settings is required')
  }
  const revision = given['revision']
  if (revision !== undefined && typeof revision !== 'string') return refuse(400, 'revision must be a string')

  const wanted: Record<string, string | boolean> = {}
  for (const [key, value] of Object.entries(asked as Record<string, unknown>)) {
    if (!(FOLDER_SETTING_KEYS as readonly string[]).includes(key)) {
      return refuse(400, `${key} is not a folder setting`)
    }
    const kept = validValue(key as (typeof FOLDER_SETTING_KEYS)[number], value)
    if (kept === undefined) return refuse(400, `${key} has an invalid value`)
    wanted[key] = kept
  }

  const held = await holdersOf(stores, folder)
  if (held.length === 0) return refuse(404, 'no such folder')

  // The file read is the first store's that has one; the write goes to that
  // same store, so the revision returned is always the one of the file read.
  let current: Read | undefined
  let target: { store: Store; dir: string } | undefined
  for (const one of held) {
    const read = await readIn(one.dir)
    if (read) {
      current = read
      target = one
      break
    }
  }
  if (!target) {
    for (const one of held) {
      if (await writable(one.dir)) {
        target = one
        break
      }
    }
  }
  if (!target || !(await writable(target.dir))) return refuse(403, 'write refused')

  const page = wanted['page']
  if (typeof page === 'string') {
    const found = await candidatesOf(stores, `${folder}/${page}`)
    if (found.length === 0) return refuse(400, 'page is not a page of this folder')
  }

  const now = current?.revision ?? ''
  if (revision !== undefined && revision !== now) {
    return refuse(409, 'the settings changed since they were read', now)
  }

  const document: Document = current ? headOf(current.text) : parseDocument('')
  if (document.errors.length > 0 || !(document.contents === null || isMap(document.contents))) {
    // A head the product cannot read as a map is not ours to merge into.
    return refuse(409, 'the file cannot be read as settings', now)
  }
  if (document.contents === null) document.contents = document.createNode({})
  for (const key of FOLDER_SETTING_KEYS) {
    if (key in wanted) document.set(key, wanted[key])
    else document.delete(key)
  }
  const empty = !isMap(document.contents) || document.contents.items.length === 0
  const head = empty ? '' : document.toString({ lineWidth: 0 })
  const text = `---\n${head}---\n`

  const file = join(target.dir, FILE)
  const temporary = join(target.dir, `.${FILE}.${randomUUID()}.tmp`)
  try {
    await mkdir(target.dir, { recursive: true })
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, file)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') return refuse(403, 'write refused')
    throw error
  }
  cache.delete(file)
  return { ok: true, settings: parseFile(text), revision: revisionOfBytes(text) }
}
