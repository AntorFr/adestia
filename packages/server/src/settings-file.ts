/**
 * Editing `adestia.config.yaml` in place, from the browser.
 *
 * The product used to refuse this, and the refusal is worth stating because
 * this file is the answer to it rather than a contradiction of it. Two
 * reasons stood there: that file is hand-written and commented, and a
 * serializer would hand it back stripped; and in the deployment this product
 * is built for it is a mounted file, often read-only, so the button would
 * fail on exactly the instances that matter.
 *
 * The first is dissolved by the tool rather than argued with. `yaml`'s
 * document API is a round trip: it parses to a tree that REMEMBERS its
 * comments and its layout, and re-prints everything it was not asked to
 * change. Measured before this file existed — a comment above a key, a
 * comment beside it, and a `${VAR}` that must not be substituted, all three
 * survive a `setIn` on the key between them.
 *
 * The second is not dissolved, it is REPORTED. `writability` asks the
 * filesystem before a form is drawn, and the screen says "this file is
 * read-only, here is where it lives" instead of offering fields that cannot
 * be saved. On a Kubernetes ConfigMap or a `:ro` bind mount, that is the
 * honest answer and the only one available.
 *
 * What it will never do is write a key the catalogue does not declare. The
 * request names a path; `settingAt` decides whether that path is a setting at
 * all. A general-purpose "write any YAML key" behind a session cookie would
 * be a different, much more dangerous thing — `driver.command` is a binary
 * this server spawns.
 */

import { constants } from 'node:fs'
import { access, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

import { parseDocument, type Document } from 'yaml'

import { settingAt, settingKey, type SettingSpec } from '@antorfr/adestia-schemas'

/** One proposed change: a declared key path, and the value to put there. */
export interface SettingChange {
  readonly path: readonly string[]
  readonly value: unknown
}

export interface WriteRefusal {
  readonly reason: string
  /** Which of the two kinds of no this is, so the route can pick its status. */
  readonly kind: 'invalid' | 'stale' | 'read-only' | 'unreadable'
}

/**
 * Whether the file can be rewritten, and why not when it cannot.
 *
 * The FILE's own mode is the whole question, and that is a correction: an
 * earlier version also demanded a writable DIRECTORY, because the safe write
 * renames a sibling over the target. It would have refused the one shape this
 * product actually ships in — see `replaceContents` — where the directory is
 * beside the point because the rename is impossible anyway.
 */
export async function writability(
  file: string,
): Promise<{ writable: boolean; reason?: string }> {
  try {
    await access(file, constants.W_OK)
  } catch {
    return { writable: false, reason: 'the configuration file is not writable by this instance' }
  }
  return { writable: true }
}

/**
 * Replacing the file's contents — the safe way where it is possible, the only
 * way where it is not.
 *
 * A config file is the file an instance BOOTS from, so the write is a
 * temporary file renamed over the target: a truncated write leaves a server
 * that will not start. That is the path taken whenever the directory allows
 * it.
 *
 * It is not allowed in the shape this product ships in, and the failure is
 * silent enough to be worth writing down. `adestia.config.yaml` is mounted as
 * a SINGLE FILE — `./adestia.config.yaml:/app/adestia.config.yaml` in the
 * compose file, a ConfigMap key in Kubernetes — and a bind-mounted file is a
 * mount point: renaming a sibling over it is refused with EBUSY, measured
 * 2026-09-23 against `node:22-alpine`. Writing THROUGH it works, and the host
 * file changes, which is the whole point of mounting it.
 *
 * So the fallback is a plain truncate-and-write, and what it costs is stated
 * rather than discovered: a process killed between the truncate and the last
 * byte leaves a short file. The window is one `write` of a few kilobytes, and
 * the alternative on that mount is no editing at all.
 */
export async function replaceContents(
  file: string,
  text: string,
  renameImpl: (from: string, to: string) => Promise<void> = rename,
): Promise<{ how: 'renamed' | 'in-place' } | { error: string }> {
  const directory = dirname(file)
  let canRename = true
  try {
    await access(directory, constants.W_OK)
  } catch {
    canRename = false
  }

  if (canRename) {
    const temporary = join(directory, `.adestia.config.${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, text, 'utf8')
      await renameImpl(temporary, file)
      return { how: 'renamed' }
    } catch (error) {
      await unlink(temporary).catch(() => undefined)
      const code = (error as NodeJS.ErrnoException).code
      // EBUSY is the mounted file; EXDEV is the same answer from a different
      // layout. Anything else is a real failure and is NOT retried through a
      // path that truncates first.
      if (code !== 'EBUSY' && code !== 'EXDEV') {
        return { error: `could not replace ${file}: ${(error as Error).message}` }
      }
    }
  }

  try {
    await writeFile(file, text, 'utf8')
    return { how: 'in-place' }
  } catch (error) {
    return { error: `could not write ${file}: ${(error as Error).message}` }
  }
}

/** The file's revision, same shape as a page's: mtime and size. */
export async function revisionOfFile(file: string): Promise<string | undefined> {
  try {
    const info = await stat(file)
    return `${Math.trunc(info.mtimeMs)}-${info.size}`
  } catch {
    return undefined
  }
}

/**
 * A value coerced to what its spec says it is, or refused.
 *
 * The browser sends JSON, and JSON's `true` is not YAML's `true` by luck —
 * it is by this function. A number arriving as `"2000"` from an input is
 * accepted and stored as a number, because a YAML file with a quoted interval
 * in it would be a file the config reader then refuses at boot, from a screen
 * that said it had saved.
 */
export function coerce(spec: SettingSpec, value: unknown, issues: string[]): unknown {
  const key = settingKey(spec.path)
  if (spec.kind === 'toggle') {
    if (typeof value !== 'boolean') {
      issues.push(`${key} must be true or false`)
      return undefined
    }
    return value
  }
  if (spec.kind === 'number') {
    const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
    if (typeof parsed !== 'number' || !Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      issues.push(`${key} must be a whole number`)
      return undefined
    }
    if (spec.min !== undefined && parsed < spec.min) {
      issues.push(`${key} must be at least ${spec.min}`)
      return undefined
    }
    if (spec.max !== undefined && parsed > spec.max) {
      issues.push(`${key} must be at most ${spec.max}`)
      return undefined
    }
    return parsed
  }
  if (spec.kind === 'choice') {
    if (typeof value !== 'string' || !(spec.choices ?? []).some((one) => one.value === value)) {
      issues.push(`${key} must be one of: ${(spec.choices ?? []).map((one) => one.value).join(', ')}`)
      return undefined
    }
    return value
  }
  if (typeof value !== 'string') {
    issues.push(`${key} must be text`)
    return undefined
  }
  return value
}

/**
 * The value a document currently holds for a setting, and where it came from.
 *
 * `undefined` in the document is not a missing answer: it means the file says
 * nothing and the instance runs the catalogue's fallback. The screen draws
 * that as "default", which is a different statement from "set to false" and
 * has to stay tellable apart — an operator who sees "false" believes somebody
 * decided it.
 */
export function valueIn(
  doc: Document,
  spec: SettingSpec,
): { value: boolean | number | string; source: 'file' | 'default' } {
  const held = doc.getIn(spec.path)
  if (held === undefined || held === null) return { value: spec.fallback, source: 'default' }
  if (typeof held === 'boolean' || typeof held === 'number' || typeof held === 'string') {
    return { value: held, source: 'file' }
  }
  // A mapping or a sequence where a scalar belongs: the file is not what this
  // screen thinks it is, and overwriting it blind would destroy whatever the
  // operator actually meant. Reported as the default, and left alone.
  return { value: spec.fallback, source: 'default' }
}

/** The parsed document, or the reason it cannot be offered for editing. */
export async function readDocument(
  file: string,
): Promise<{ doc: Document; revision: string } | { refusal: WriteRefusal }> {
  let source: string
  try {
    source = await readFile(file, 'utf8')
  } catch {
    return { refusal: { kind: 'unreadable', reason: `cannot read ${file}` } }
  }
  const doc = parseDocument(source)
  if (doc.errors.length > 0) {
    // Hand-edited into something that no longer parses. Refusing to write is
    // the only safe answer: `setIn` on a broken document would re-print a
    // guess at what the operator meant, over the file that holds the truth.
    return {
      refusal: {
        kind: 'unreadable',
        reason: `${file} is not valid YAML (${doc.errors[0]?.message ?? 'parse error'})`,
      },
    }
  }
  const revision = (await revisionOfFile(file)) ?? ''
  return { doc, revision }
}

/**
 * Applies changes to the file, atomically, or refuses without touching it.
 *
 * The revision guard is not ceremony. The file stays hand-editable — that is
 * the point of it remaining the source of truth — so a form opened ten
 * minutes ago must not silently undo an edit made in a terminal since. The
 * caller passes the revision the screen was shown; a mismatch is a refusal
 * the screen turns into "the file changed, reload".
 */
export async function applyChanges(
  file: string,
  changes: readonly SettingChange[],
  expectedRevision: string | undefined,
): Promise<{ revision: string } | { refusal: WriteRefusal }> {
  if (changes.length === 0) return { refusal: { kind: 'invalid', reason: 'no change was proposed' } }

  const issues: string[] = []
  const staged: { spec: SettingSpec; value: unknown }[] = []
  for (const change of changes) {
    const spec = settingAt(change.path)
    if (!spec) {
      // Not "unknown key": the catalogue is the list of what a browser may
      // touch, and a path outside it is refused for a reason worth naming.
      issues.push(`${settingKey(change.path)} is not a setting this screen may change`)
      continue
    }
    const value = coerce(spec, change.value, issues)
    if (value !== undefined) staged.push({ spec, value })
  }
  if (issues.length > 0) return { refusal: { kind: 'invalid', reason: issues.join('; ') } }

  const can = await writability(file)
  if (!can.writable) {
    return { refusal: { kind: 'read-only', reason: can.reason ?? 'the configuration file is read-only' } }
  }

  const read = await readDocument(file)
  if ('refusal' in read) return read
  if (expectedRevision !== undefined && expectedRevision !== read.revision) {
    return {
      refusal: {
        kind: 'stale',
        reason: 'the configuration file changed since this screen read it',
      },
    }
  }

  for (const { spec, value } of staged) setValue(read.doc, spec.path, value)

  const written = await replaceContents(file, String(read.doc))
  if ('error' in written) return { refusal: { kind: 'read-only', reason: written.error } }
  return { revision: (await revisionOfFile(file)) ?? '' }
}

/**
 * `setIn`, with the parents it needs.
 *
 * `yaml` creates missing parents on its own, and it creates them as the kind
 * of collection the path implies — which is a map here, every setting being
 * named. Kept as its own function so the one place a document is mutated is
 * one line long and has a name.
 */
function setValue(doc: Document, path: readonly string[], value: unknown): void {
  doc.setIn([...path], value)
}
