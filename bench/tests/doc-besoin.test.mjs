/**
 * The documentation need (B-4, B-5, P-15, AD-6) checked on the repository's files, from the
 * feature's exit criterion and docs/parcours.md. No server: the product here is the text.
 *
 *   node --test bench/tests/doc-besoin.test.mjs
 *
 * Needs git history with tags for the version checks (a clone without tags reports it and fails,
 * rather than passing silently). The fresh-context `relecteur-depot` pass itself is an agent, not
 * a test: it is not replayed here.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
const read = (p) => readFileSync(join(root, p), 'utf8')
const tracked = git('ls-files').split('\n').filter(Boolean).filter((f) => existsSync(join(root, f)))
const markdown = tracked.filter((f) => f.endsWith('.md'))

const semver = (v) => {
  const m = /^v(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(v)
  assert.ok(m, `not a version: ${v}`)
  return { n: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? '' }
}
const cmp = (a, b) => {
  const x = semver(a), y = semver(b)
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] - y.n[i]
  if (x.pre === y.pre) return 0
  if (x.pre === '') return 1
  if (y.pre === '') return -1
  return x.pre.localeCompare(y.pre, 'en', { numeric: true })
}
const latestTag = () => {
  const tags = git('tag', '--list', 'v*').split('\n').filter((t) => /^v\d+\.\d+\.\d+/.test(t))
  assert.ok(tags.length > 0, 'no git tag in this clone: cannot tell the current version')
  return tags.sort(cmp).at(-1)
}

describe('B-5 — .agent/status.md says the state', () => {
  const status = read('.agent/status.md')

  test('it is under 150 lines', () => {
    assert.ok(status.split('\n').length < 150, `${status.split('\n').length} lines`)
  })

  test('it names the current version, the latest git tag', () => {
    assert.ok(status.includes(latestTag()), `status.md does not mention ${latestTag()}`)
  })

  test('it has the known defects and the traps still true', () => {
    assert.match(status, /^## .*(Défauts connus|Known defects)/m)
    assert.match(status, /^## .*(Pièges|Traps)/m)
  })

  test('it carries no version paragraph: that is the changelog\'s', () => {
    assert.doesNotMatch(status, /^#+ .*\bv0\.\d+\.\d+/m)
  })

  test('no mission or questions file of a closed work is left in .agent', () => {
    const left = readdirSync(join(root, '.agent')).filter((f) => /^(mission|questions)-/.test(f) || f === 'migrate-frame.mjs')
    assert.deepEqual(left, [])
    assert.deepEqual(tracked.filter((f) => /^\.agent\/(mission|questions)-/.test(f)), [])
  })
})

describe('B-5 — CHANGELOG.md is the history, in version order', () => {
  const log = read('CHANGELOG.md')
  const headings = [...log.matchAll(/^## (v\d+\.\d+\.\d+\S*)/gm)].map((m) => m[1])

  test('versions run from the oldest known to the current, oldest first', () => {
    assert.ok(headings.length >= 40, `${headings.length} versions`)
    assert.equal(headings[0], 'v0.61.0')
    for (let i = 1; i < headings.length; i++) {
      assert.ok(cmp(headings[i - 1], headings[i]) < 0, `${headings[i - 1]} then ${headings[i]}`)
    }
  })

  test('the current version (latest tag) is the last of them', () => {
    assert.equal(headings.at(-1), latestTag())
  })

  test('every released tag from v0.61.0 on has its entry', () => {
    const tags = git('tag', '--list', 'v*').split('\n')
      .filter((t) => /^v\d+\.\d+\.\d+(-.+)?$/.test(t) && cmp(t, 'v0.61.0') >= 0)
    const missing = tags.filter((t) => !headings.includes(t))
    assert.deepEqual(missing, [])
  })

  test('what status.md knew from before v0.61.0 sits in a section at the top', () => {
    const first = log.search(/^## /m)
    assert.match(log.slice(first), /^## Earlier than v0\.61\.0/)
  })
})

describe('B-4 — stale phrases and delivery state are gone', () => {
  const phrases = [['three', 'skins'].join(' '), ['Open', 'spikes'].join(' ')]
  for (const phrase of phrases) {
    test(`git grep finds no "${phrase}"`, () => {
      let out = ''
      try { out = git('grep', '-n', '-F', '-e', phrase) } catch { /* exit 1: no match */ }
      assert.equal(out, '')
    })
  }

  test('DESIGN.md has no built / not built section, no spikes section, no "unless marked" header', () => {
    const design = read('DESIGN.md')
    const heads = design.split('\n').filter((l) => /^#+ /.test(l))
    assert.deepEqual(heads.filter((h) => /built|spikes/i.test(h)), [])
    assert.doesNotMatch(design.slice(0, design.indexOf('\n## Decision log')), /not built|unless marked/i)
  })

  test('DESIGN.md decision log is in one order, oldest first', () => {
    const design = read('DESIGN.md')
    const log = design.slice(design.indexOf('\n## Decision log'))
    const dates = [...log.matchAll(/^\*\*(20\d\d-\d\d-\d\d)/gm)].map((m) => m[1])
    assert.ok(dates.length > 30, `${dates.length} dated entries`)
    assert.deepEqual(dates, [...dates].sort())
  })
})

describe('B-4 — every Q-n and R-n is closed or kept with its reason', () => {
  test('docs/ecrans.md: each of the 23 Q-n carries **closed** or **kept: <reason>**', () => {
    const text = read('docs/ecrans.md')
    const start = text.search(/^\d+\. \*\*Q-1 /m)
    assert.ok(start > 0, 'Q-1 not found')
    const blocks = text.slice(start).split(/^(?=\d+\. \*\*Q-\d+ )/m)
    const bad = []
    const seen = []
    for (const block of blocks) {
      const id = /^\d+\. \*\*(Q-\d+)/.exec(block)?.[1]
      if (!id) continue
      seen.push(id)
      if (!/\*\*closed\*\*|\*\*kept: ?[^*\s][^*]*\*\*|\bkept: \S+/.test(block)) bad.push(id)
    }
    assert.equal(seen.length, 23)
    assert.deepEqual(bad, [])
  })

  test('ARCHITECTURE.md: each of the 15 R-n has an Outcome that closes or keeps it with a reason', () => {
    const rows = read('ARCHITECTURE.md').split('\n').filter((l) => /^\| R-\d+ \|/.test(l))
    assert.equal(rows.length, 15)
    const bad = rows.filter((row) => {
      const outcome = row.split('|').slice(1, -1).at(-1).trim()
      return !(/closed/.test(outcome) || /kept: \S{4,}/.test(outcome))
    }).map((r) => r.slice(0, 8))
    assert.deepEqual(bad, [])
  })
})

describe('B-4 — no token used without a definition', () => {
  test('every var(--x) of the shell and plugin CSS is defined, in CSS or by a skin or script', () => {
    const css = tracked.filter((f) => f.endsWith('.css') && (f.startsWith('packages/web/src/') || /^plugins\/[^/]+\/web\//.test(f)))
    const used = new Map()
    const defined = new Set()
    for (const f of css) {
      const text = read(f).replace(/\/\*[\s\S]*?\*\//g, '')
      for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) used.set(m[1], f)
      for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1])
    }
    for (const f of tracked.filter((p) => /\.(css|js|mjs|ts|tsx)$/.test(p) && /^(packages\/web\/src|plugins|skins)\//.test(p))) {
      const text = read(f).replace(/\/\*[\s\S]*?\*\//g, '')
      for (const m of text.matchAll(/['"`](--[\w-]+)['"`]\s*[,:]|(--[\w-]+)\s*:/g)) defined.add(m[1] ?? m[2])
    }
    assert.ok(css.length > 10 && used.size > 50, `${css.length} files, ${used.size} tokens`)
    const orphans = [...used].filter(([k]) => !defined.has(k)).map(([k, f]) => `${k} (${f})`)
    assert.deepEqual(orphans, [])
  })
})

describe('B-4 — what README, CLAUDE.md and the docs name exists', () => {
  test('every relative link of every tracked markdown file lands on a file', () => {
    const broken = []
    const docs = markdown.filter((f) => !/^(spikes\/.+\/|packages\/.*\/test\/|skills\/)/.test(f))
    for (const f of docs) {
      const text = read(f).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
      for (const m of text.matchAll(/\]\((?!https?:|mailto:|#)([^)\s#]+)(?:#[^)]*)?\)/g)) {
        if (!existsSync(resolve(root, dirname(f), decodeURIComponent(m[1])))) broken.push(`${f} -> ${m[1]}`)
      }
    }
    assert.deepEqual(broken, [])
  })

  test('every `npm run <script>` of README.md and CLAUDE.md is a script of the root or a workspace', () => {
    const scripts = new Set()
    for (const p of ['package.json', ...tracked.filter((f) => /^packages\/[^/]+\/package\.json$/.test(f))]) {
      for (const k of Object.keys(JSON.parse(read(p)).scripts ?? {})) scripts.add(k)
    }
    const missing = []
    for (const f of ['README.md', 'CLAUDE.md']) {
      for (const m of read(f).matchAll(/npm run ([\w:-]+)/g)) if (!scripts.has(m[1])) missing.push(`${f}: ${m[1]}`)
    }
    assert.deepEqual(missing, [])
  })

  test('every `bench/...` or `scripts/...` file named in README.md, CLAUDE.md, parcours and bench/README exists', () => {
    const missing = []
    for (const f of ['README.md', 'CLAUDE.md', 'docs/parcours.md', 'bench/README.md']) {
      for (const m of read(f).matchAll(/(?<![\w/.-])((?:bench|scripts)\/[\w./-]*\w\.(?:mjs|js|sh|md|json|yaml))/g)) {
        if (m[1].includes('my-change')) continue // the README's placeholder name
        if (!existsSync(join(root, m[1]))) missing.push(`${f}: ${m[1]}`)
      }
    }
    assert.deepEqual(missing, [])
  })

  test('README.md says how to launch, test, run on the fake engine and capture the screens', () => {
    const readme = read('README.md')
    for (const word of ['npm ci', 'npm test', '--engine fake', 'bench/sweep.mjs', 'CLAUDE_CODE_OAUTH_TOKEN']) {
      assert.ok(readme.includes(word), `README.md lacks "${word}"`)
    }
  })

  test('CLAUDE.md carries the commands, and names the five packages', () => {
    const claude = read('CLAUDE.md')
    for (const word of ['npm test', 'npm run typecheck', 'npm run lint', 'npm run build',
      'packages/content', 'packages/drivers', 'packages/schemas', 'packages/server', 'packages/web']) {
      assert.ok(claude.includes(word), `CLAUDE.md lacks "${word}"`)
    }
  })

  test('each package and each of plugins/ and spikes/ keeps a README', () => {
    for (const p of ['plugins/README.md', 'spikes/README.md', 'packages/schemas/CHANGELOG.md',
      ...['content', 'drivers', 'schemas', 'server', 'web'].map((n) => `packages/${n}/README.md`)]) {
      assert.ok(existsSync(join(root, p)), p)
    }
  })

  test('the number of skins the docs state is the number of skins there are', () => {
    const skins = readdirSync(join(root, 'skins'), { withFileTypes: true }).filter((d) => d.isDirectory()).length
    assert.equal(skins, 4)
    assert.match(read('docs/parcours.md') + read('README.md'), /\b(four|4) (bundled )?skins\b/i)
  })
})
