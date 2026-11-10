/**
 * Whole-feature checks of `adestia-preuve-tests` (R15, B-12), written from the Livre and the
 * exit criterion alone: the suite is declared in .sdlc.yaml, no workflow plays it on a branch
 * push or a pull request, the image is built only on a `v*` tag behind a job that checks the
 * `tests-complets` attestation of the commit (or of a parent with the same tree), and
 * CLAUDE.md states the rule. The attestation job is RUN here against a fake `gh` and real
 * throwaway git repositories; nothing touches the network.
 *
 * Each test names the change that turns it red.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { cleanTmp, tmpDir } from './support/tmp.js'

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const yml = (p: string): any => parse(read(p))
const publish = '.github/workflows/docker-publish.yml'
const triggers = (wf: any): any => wf.on ?? wf[true as unknown as string]

describe('Adestia declares and attests its suite (R15)', () => {
  it('.sdlc.yaml declares tests: with a command that exists, a report, a known format and a delay', () => {
    // red if tests: is dropped, or its command points at a script that is not there
    const t = yml('.sdlc.yaml').tests
    expect(t).toBeTruthy()
    expect(t.commande).toBe('scripts/suite-attestee.sh')
    expect(existsSync(join(root, t.commande))).toBe(true)
    expect(t.rapport).toBe('resultats.xml')
    expect(['tap', 'junit']).toContain(t.format)
    expect(String(t.delai)).toMatch(/^\d+[mh]$/)
  })

  it('deploiement: is kept next to tests:', () => {
    // red if the migration drops the deployment declaration the chain reads
    const d = yml('.sdlc.yaml').deploiement
    expect(d.images).toEqual(['ghcr.io/antorfr/adestia'])
    expect(d.applis).toEqual(['alfred', 'dobby', 'nestor'])
  })

  it('no workflow runs on a branch push or a pull request, and ci.yml is gone', () => {
    // red if a workflow gets pull_request, push: branches, or ci.yml comes back
    expect(existsSync(join(root, '.github/workflows/ci.yml'))).toBe(false)
    const listed = execFileSync('git', ['ls-files', '.github/workflows'], { cwd: root, encoding: 'utf8' })
      .split('\n').filter(Boolean)
    expect(listed.length).toBeGreaterThan(0)
    for (const f of listed) {
      const on = triggers(parse(read(f)))
      const keys = typeof on === 'string' ? [on] : Array.isArray(on) ? on : Object.keys(on)
      expect(keys, f).not.toContain('pull_request')
      expect(keys, f).not.toContain('pull_request_target')
      if (keys.includes('push')) {
        expect(on.push.branches, f).toBeUndefined()
        expect(on.push['branches-ignore'], f).toBeUndefined()
        expect(on.push.tags, f).toEqual(['v*'])
      }
    }
  })

  it('docker-publish builds on a v* tag (or by hand) only, and publishes no :main image', () => {
    // red if the image is built on main again, or tagged main
    const wf = yml(publish)
    const on = triggers(wf)
    expect(Object.keys(on).sort()).toEqual(['push', 'workflow_dispatch'])
    expect(on.push).toEqual({ tags: ['v*'] })
    const tags: string = wf.jobs.build.steps.find((s: any) => s.id === 'meta').with.tags
    expect(tags).not.toMatch(/type=ref,event=branch/)
    expect(tags).not.toMatch(/value=main/)
  })

  it('the image build waits for the attestation job', () => {
    // red if needs: attestation is dropped from the build job
    const wf = yml(publish)
    expect([wf.jobs.build.needs].flat()).toContain('attestation')
    expect(wf.jobs.attestation).toBeTruthy()
  })

  it('nothing in the repository documents pulling the image from main', () => {
    // red if compose, Dockerfile or README point at the main tag of the image
    for (const f of ['docker-compose.yml', 'Dockerfile', 'README.md']) {
      expect(read(f), f).not.toMatch(/ghcr\.io\/antorfr\/adestia:main/)
    }
  })

  it('CLAUDE.md states the rule: attested, never played by the forge, status set only by attester', () => {
    // red if CLAUDE.md goes back to "CI runs the suite" or drops the command
    const c = read('CLAUDE.md')
    expect(c).toMatch(/R15/)
    expect(c).toMatch(/attester .*--publier/)
    expect(c).toMatch(/tests-complets/)
    expect(c).toMatch(/GitHub Actions plays no suite/)
    expect(c).toMatch(/v\*/)
    expect(c).toMatch(/Never set that\s+status by hand/)
  })
})

// ---- the attestation job, run for real -------------------------------------------------
const work = await tmpDir('attest-')

describe('the attestation job of docker-publish', () => {
  afterAll(cleanTmp)

  const script: string = (yml(publish).jobs.attestation?.steps ?? [])
    .map((s: any) => s.run).filter(Boolean)
    .find((r: string) => /tests-complets/.test(r)) ?? "exit 2"

  const bin = join(work, 'bin')
  const statuses = join(work, 'statuses')
  mkdirSync(bin)
  mkdirSync(statuses)
  // fake gh api repos/<r>/commits/<sha>/status: prints "<state> <description>" for the
  // tests-complets lines of statuses/<sha> ("context|state|description" per line), nothing else.
  const shebang = String.fromCharCode(35) + '!/usr/bin/env node'
  const fake = [
    shebang,
    "const fs = require('fs')",
    "const m = /commits\\/([0-9a-f]+)\\/status/.exec(process.argv[3] || '')",
    'const f = ' + JSON.stringify(statuses) + " + '/' + (m ? m[1] : 'none')",
    'if (fs.existsSync(f)) for (const l of fs.readFileSync(f, "utf8").split("\\n")) {',
    "  const [ctx, state, desc] = l.split('|')",
    "  if (ctx === 'tests-complets') console.log(state + ' ' + desc)",
    '}',
    '',
  ]
  writeFileSync(join(bin, 'gh'), fake.join(String.fromCharCode(10)))
  chmodSync(join(bin, 'gh'), 0o755)

  const run = (cwd: string, ...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8' }).trim()

  let n = 0
  const repo = () => {
    const d = join(work, 'r' + ++n)
    mkdirSync(d)
    run(d, 'init', '-q', '-b', 'main')
    writeFileSync(join(d, 'a.txt'), randomUUID() + '\n')
    run(d, 'add', 'a.txt')
    run(d, 'commit', '-q', '-m', 'a')
    return d
  }
  const commit = (d: string, file: string, body: string) => {
    writeFileSync(join(d, file), body)
    run(d, 'add', file)
    run(d, 'commit', '-q', '-m', file)
    return run(d, 'rev-parse', 'HEAD')
  }
  const mark = (sha: string, line: string) => writeFileSync(join(statuses, sha), line + '\n')
  const play = (d: string) =>
    spawnSync('sh', ['-c', script], {
      cwd: d,
      encoding: 'utf8',
      env: { PATH: bin + ':' + process.env.PATH, GITHUB_REPOSITORY: 'AntorFr/adestia', GH_TOKEN: 'x', HOME: work },
    })

  it('passes on a commit that carries a green tests-complets status', () => {
    // red if the job stops reading the own status of the commit
    const d = repo()
    const head = commit(d, 'b.txt', 'b\n')
    mark(head, 'tests-complets|success|vert')
    expect(play(d).status).toBe(0)
  })

  it('fails on a commit without any status', () => {
    // red if the job lets an unattested commit through
    const d = repo()
    commit(d, 'b.txt', 'b\n')
    expect(play(d).status).toBe(1)
  })

  it.each(['failure', 'pending', 'error'])('fails when tests-complets is %s', (state) => {
    // red if any state but success is accepted
    const d = repo()
    const head = commit(d, 'b.txt', 'b\n')
    mark(head, 'tests-complets|' + state + '|x')
    expect(play(d).status).toBe(1)
  })

  it('passes on a merge commit whose tree is that of its attested parent', () => {
    // red if the job requires the status on the merge commit itself
    const d = repo()
    run(d, 'checkout', '-q', '-b', 'feat')
    const attested = commit(d, 'b.txt', 'b\n')
    run(d, 'checkout', '-q', 'main')
    run(d, 'merge', '-q', '--no-ff', '-m', 'merge', 'feat')
    expect(run(d, 'rev-parse', 'HEAD')).not.toBe(attested)
    mark(attested, 'tests-complets|success|vert')
    expect(play(d).status).toBe(0)
  })

  it('fails on a merge commit whose tree differs from every attested parent', () => {
    // red if a green parent is accepted although the content is not the attested one
    const d = repo()
    run(d, 'checkout', '-q', '-b', 'feat')
    const attested = commit(d, 'b.txt', 'b\n')
    run(d, 'checkout', '-q', 'main')
    const mainHead = commit(d, 'c.txt', 'c\n')
    run(d, 'merge', '-q', '--no-ff', '-m', 'merge', 'feat')
    mark(attested, 'tests-complets|success|vert')
    mark(mainHead, 'tests-complets|success|vert')
    expect(play(d).status).toBe(1)
  })

  it('fails on a child commit of an attested commit (a new tree needs a new attestation)', () => {
    // red if the job accepts a green status from an ancestor with other content
    const d = repo()
    const prev = commit(d, 'b.txt', 'b\n')
    mark(prev, 'tests-complets|success|vert')
    commit(d, 'c.txt', 'c\n')
    expect(play(d).status).toBe(1)
  })
})
