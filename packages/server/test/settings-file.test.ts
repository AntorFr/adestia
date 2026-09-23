/**
 * Editing the instance's own config file from the browser.
 *
 * The product refused this for two reasons, and the tests below are those two
 * reasons turned into assertions. A serializer would hand the operator their
 * file back stripped of every comment they wrote to explain WHY a value is
 * what it is — so the round trip is checked on a file that carries a comment
 * above a key, one beside it, and a `${VAR}` that must survive unsubstituted.
 * And the file is mounted read-only on the deployments this product is built
 * for — so "cannot write" is a first-class answer, given before a form is
 * drawn rather than after a save that fails.
 *
 * The third case is the one neither reason predicted: the file stays
 * hand-editable, which is the whole point of it remaining the source of
 * truth, so a screen opened ten minutes ago must not silently undo an edit
 * made in a terminal since.
 */

import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { settingAt } from '@antorfr/adestia-schemas'
import {
  applyChanges,
  coerce,
  readDocument,
  replaceContents,
  valueIn,
  writability,
} from '../src/settings-file.js'

const FILE = `# The instance, as its operator wrote it.
name: Adestia
workspace:
  root: ./workspace
  # Live refresh. Set polling when the workspace sits on a mount native file
  # events cannot cross — WSL's /mnt/c, NFS, SMB.
  watch:
    enabled: true
    polling: false # the one that matters here
    intervalMs: 2000

auth:
  mode: oidc
  oidc:
    clientSecret: \${ADESTIA_OIDC_SECRET}
`

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'adestia-settings-'))
  file = join(dir, 'adestia.config.yaml')
  await writeFile(file, FILE, 'utf8')
})

afterEach(async () => {
  await chmod(dir, 0o700).catch(() => undefined)
  await rm(dir, { recursive: true, force: true })
})

const polling = settingAt(['workspace', 'watch', 'polling'])!
const interval = settingAt(['workspace', 'watch', 'intervalMs'])!

describe('writing one key into a hand-written file', () => {
  it('leaves every comment where its author put it', async () => {
    const done = await applyChanges(file, [{ path: polling.path, value: true }], undefined)
    expect('refusal' in done).toBe(false)

    const after = await readFile(file, 'utf8')
    expect(after).toContain('# The instance, as its operator wrote it.')
    expect(after).toContain("events cannot cross — WSL's /mnt/c, NFS, SMB.")
    expect(after).toContain('the one that matters here')
    expect(after).toMatch(/polling: true/)
  })

  it('never substitutes a ${VAR} it was not asked to touch', async () => {
    // The config reader resolves those at boot. A round trip that resolved
    // them would write the SECRET into the file, in clear, from a screen that
    // said it had changed a checkbox.
    await applyChanges(file, [{ path: polling.path, value: true }], undefined)
    expect(await readFile(file, 'utf8')).toContain('${ADESTIA_OIDC_SECRET}')
  })

  it('writes a number as a number, not as the string an input handed over', async () => {
    // A quoted interval is a file the config reader refuses at boot, from a
    // screen that reported success.
    await applyChanges(file, [{ path: interval.path, value: '5000' }], undefined)
    const after = await readFile(file, 'utf8')
    expect(after).toMatch(/intervalMs: 5000\b/)
    expect(after).not.toMatch(/intervalMs: ['"]/)
  })

  it('creates the parents of a key the file never mentioned', async () => {
    await writeFile(file, 'name: Adestia\n', 'utf8')
    await applyChanges(file, [{ path: polling.path, value: true }], undefined)
    const read = await readDocument(file)
    expect('refusal' in read).toBe(false)
    if ('refusal' in read) return
    expect(valueIn(read.doc, polling)).toEqual({ value: true, source: 'file' })
  })
})

describe('what a value on screen is allowed to claim', () => {
  it('tells a value somebody DECIDED from one nobody wrote', async () => {
    // "false" and "default, which happens to be false" are different
    // statements, and an operator who reads the first believes somebody chose
    // it. They have to stay tellable apart on the screen.
    const read = await readDocument(file)
    if ('refusal' in read) throw new Error(read.refusal.reason)
    expect(valueIn(read.doc, polling)).toEqual({ value: false, source: 'file' })
    expect(valueIn(read.doc, settingAt(['workspace', 'watch', 'enabled'])!)).toEqual({
      value: true,
      source: 'file',
    })

    await writeFile(file, 'name: Adestia\n', 'utf8')
    const bare = await readDocument(file)
    if ('refusal' in bare) throw new Error(bare.refusal.reason)
    expect(valueIn(bare.doc, polling)).toEqual({ value: false, source: 'default' })
  })

  it('reports the default rather than overwriting a key of the wrong shape', async () => {
    // Somebody wrote a mapping where this screen expects a switch. Blind
    // overwriting would destroy whatever they actually meant.
    await writeFile(file, 'workspace:\n  watch:\n    polling:\n      when: friday\n', 'utf8')
    const read = await readDocument(file)
    if ('refusal' in read) throw new Error(read.refusal.reason)
    expect(valueIn(read.doc, polling)).toEqual({ value: false, source: 'default' })
  })
})

describe('what it refuses, and without touching the file', () => {
  it('refuses a key the catalogue does not declare', async () => {
    // `driver.command` is a binary this server spawns. The catalogue is the
    // list of what a browser may touch, and everything else is not a typo to
    // be forgiving about.
    const before = await readFile(file, 'utf8')
    const done = await applyChanges(file, [{ path: ['driver', 'command'], value: '/bin/sh' }], undefined)
    expect('refusal' in done && done.refusal.kind).toBe('invalid')
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('refuses a number outside its declared bounds', async () => {
    const before = await readFile(file, 'utf8')
    const done = await applyChanges(file, [{ path: interval.path, value: 10 }], undefined)
    expect('refusal' in done && done.refusal.kind).toBe('invalid')
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('refuses the whole batch when one change is bad', async () => {
    // Half-applied settings are worse than none: the operator reads an error
    // and cannot tell which half landed.
    const before = await readFile(file, 'utf8')
    const done = await applyChanges(
      file,
      [
        { path: polling.path, value: true },
        { path: interval.path, value: 'often' },
      ],
      undefined,
    )
    expect('refusal' in done && done.refusal.kind).toBe('invalid')
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('refuses when the file changed since the screen read it', async () => {
    const read = await readDocument(file)
    if ('refusal' in read) throw new Error(read.refusal.reason)
    // Somebody edits it in a terminal while the form is open.
    await writeFile(file, `${FILE}locale: fr\n`, 'utf8')

    const done = await applyChanges(file, [{ path: polling.path, value: true }], read.revision)
    expect('refusal' in done && done.refusal.kind).toBe('stale')
    // And the terminal's edit is still there, which is the point.
    expect(await readFile(file, 'utf8')).toContain('locale: fr')
  })

  it('refuses a file that no longer parses rather than re-printing a guess', async () => {
    await writeFile(file, 'workspace:\n  watch:\n   - polling: [unclosed\n', 'utf8')
    const done = await applyChanges(file, [{ path: polling.path, value: true }], undefined)
    expect('refusal' in done && done.refusal.kind).toBe('unreadable')
  })
})

describe('a file this instance cannot write', () => {
  it('says so before a form is drawn, and names the reason', async () => {
    // The deployments this product is built for mount it read-only: a
    // Kubernetes ConfigMap, a `:ro` bind mount. Discovering that at save time
    // is discovering it too late.
    await chmod(file, 0o444)
    const can = await writability(file)
    // Root ignores the mode bits, so the assertion is on what `access` says
    // rather than on the platform behaving one way.
    if (can.writable) return
    expect(can.reason).toMatch(/not writable/)

    const done = await applyChanges(file, [{ path: polling.path, value: true }], undefined)
    expect('refusal' in done && done.refusal.kind).toBe('read-only')
  })
})

describe('how the new contents get onto the disk', () => {
  it('renames a temporary over the target, and leaves no debris', async () => {
    // A config file is the file the instance BOOTS from: a truncated write
    // leaves a server that will not start.
    const done = await replaceContents(file, 'name: Adestia\n')
    expect(done).toEqual({ how: 'renamed' })
    expect(await readFile(file, 'utf8')).toBe('name: Adestia\n')
    expect((await readdir(dir)).filter((entry) => entry.endsWith('.tmp'))).toEqual([])
  })

  it('writes THROUGH the file when it is a mount point', async () => {
    // The shape this product actually ships in: `adestia.config.yaml` is
    // bind-mounted as a single file, and a bind-mounted file cannot be
    // replaced by rename — EBUSY, measured against node:22-alpine. Writing
    // through it works, and the host file changes.
    const busy = () => {
      const error = new Error('EBUSY: resource busy or locked') as NodeJS.ErrnoException
      error.code = 'EBUSY'
      return Promise.reject(error)
    }
    const done = await replaceContents(file, 'name: Monté\n', busy)
    expect(done).toEqual({ how: 'in-place' })
    expect(await readFile(file, 'utf8')).toBe('name: Monté\n')
    // And the temporary it gave up on is not left lying beside it.
    expect((await readdir(dir)).filter((entry) => entry.endsWith('.tmp'))).toEqual([])
  })

  it('does NOT truncate the file over a failure it does not understand', async () => {
    // EBUSY and EXDEV mean "this target cannot be renamed onto". Anything
    // else is a real failure, and retrying through a path that truncates
    // first would turn a failed save into a destroyed config.
    const broken = () => {
      const error = new Error('EIO: i/o error') as NodeJS.ErrnoException
      error.code = 'EIO'
      return Promise.reject(error)
    }
    const before = await readFile(file, 'utf8')
    const done = await replaceContents(file, 'name: Perdu\n', broken)
    expect('error' in done).toBe(true)
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('writes in place when the DIRECTORY forbids the temporary', async () => {
    await chmod(dir, 0o555)
    const done = await replaceContents(file, 'name: Adestia\n')
    await chmod(dir, 0o700)
    // Skipped where the process ignores mode bits (root in a container).
    if ('error' in done) return
    expect(done.how).toBe('in-place')
  })
})

describe('coercion, before anything reaches the disk', () => {
  it('takes a number typed into a text input', () => {
    const issues: string[] = []
    expect(coerce(interval, '2500', issues)).toBe(2500)
    expect(issues).toEqual([])
  })

  it('refuses a fraction where the setting is a whole number of milliseconds', () => {
    const issues: string[] = []
    expect(coerce(interval, 2500.5, issues)).toBeUndefined()
    expect(issues[0]).toMatch(/whole number/)
  })

  it('refuses a toggle that arrived as the string "true"', () => {
    // It would serialise as a quoted scalar and read back as a string the
    // config parser then rejects — from a screen that said it had saved.
    const issues: string[] = []
    expect(coerce(polling, 'true', issues)).toBeUndefined()
    expect(issues[0]).toMatch(/true or false/)
  })
})
