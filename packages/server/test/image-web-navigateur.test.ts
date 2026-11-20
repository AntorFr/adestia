/**
 * The image's web browser (AD-web-2, -3, -6), read from the Dockerfile: no Docker in the pods,
 * so the build itself is proved after the delivery tag. These tests pin what the file must say.
 * Each names the change that turns it red.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const docker = read('Dockerfile')
const code = docker
  .split('\n')
  .filter((l) => !l.trim().startsWith('#'))
  .join('\n')
const stages = code.split(/^FROM /m).slice(1)
const build = stages.find((s) => /\bAS build\b/.test(s)) ?? ''
const runtime = stages.find((s) => /\bAS runtime\b/.test(s)) ?? ''

describe('Dockerfile — web browser', () => {
  it('the build stage installs the plugin dependencies without scripts or dev dependencies', () => {
    // red if the npm ci moves to runtime, drops --ignore-scripts (a browser download on the builder's arch) or --omit=dev
    expect(build).toMatch(/cd plugins\/web && npm ci --omit=dev --ignore-scripts/)
    expect(build).toMatch(/COPY plugins\/web\/package\.json plugins\/web\/package-lock\.json/)
  })

  it('the runtime stage installs chromium-headless-shell and its libraries through the plugin playwright-core into /opt/browsers', () => {
    // red if the browser comes from apt/another package, another path, or without install-deps
    expect(code).toMatch(/PLAYWRIGHT_BROWSERS_PATH=\/opt\/browsers/)
    expect(runtime).toMatch(/plugins\/web\/node_modules\/playwright-core\/cli\.js/)
    expect(runtime).toMatch(/install-deps chromium-headless-shell/)
    expect(runtime).toMatch(/"\$cli" install chromium-headless-shell/)
    expect(build).not.toMatch(/chromium-headless-shell/)
  })

  it('install-deps comes before install, and the browser is readable by node (USER node comes after)', () => {
    // red if the order flips or the chmod goes: the non-root user could not read /opt/browsers
    const iDeps = runtime.indexOf('install-deps')
    const inst = runtime.search(/"\$cli" install chromium/)
    expect(iDeps).toBeGreaterThan(-1)
    expect(inst).toBeGreaterThan(iDeps)
    expect(runtime).toMatch(/chmod -R a\+rX \/opt\/browsers/)
    expect(runtime.indexOf('install chromium')).toBeLessThan(runtime.indexOf('\nUSER node'))
  })

  it('it comes after the yt-dlp layer', () => {
    // red if the browser layer moves before yt-dlp (the cache order the Livre fixes)
    expect(runtime.indexOf('yt-dlp')).toBeGreaterThan(-1)
    expect(runtime.indexOf('yt-dlp')).toBeLessThan(runtime.indexOf('install-deps'))
  })

  it('WEB_BROWSER defaults to on, is declared in both stages, and none skips both steps', () => {
    // red if the ARG is missing in a stage (an ARG is stage-local), defaults to none, or a step ignores it
    expect(build).toMatch(/ARG WEB_BROWSER=on/)
    expect(runtime).toMatch(/ARG WEB_BROWSER=on/)
    expect(build).toMatch(/if \[ "\$WEB_BROWSER" != none \]/)
    expect(runtime).toMatch(/if \[ "\$WEB_BROWSER" != none \]/)
    // the install-deps/install lines sit inside that if, before its fi
    const ifAt = runtime.indexOf('if [ "$WEB_BROWSER" != none ]')
    const fiAt = runtime.indexOf('fi;', ifAt)
    expect(runtime.indexOf('install-deps')).toBeGreaterThan(ifAt)
    expect(runtime.indexOf('install-deps')).toBeLessThan(fiAt)
    expect(runtime.search(/"\$cli" install chromium/)).toBeLessThan(fiAt)
  })

  it('WEB_BROWSER=none still leaves the COPY source in place', () => {
    // red if the build stage creates web-deps only inside the if: the runtime COPY would fail
    const mk = build.indexOf('mkdir -p /build/web-deps')
    const ifAt = build.indexOf('if [ "$WEB_BROWSER" != none ]')
    expect(mk).toBeGreaterThan(-1)
    expect(mk).toBeLessThan(ifAt)
    expect(runtime).toMatch(/COPY --from=build \/build\/web-deps \/tmp\/web-deps/)
  })

  it('no Chrome version is written in the Dockerfile', () => {
    // red if a version of Chrome/Chromium or a revision is pinned in the file (the playwright-core pins it)
    expect(docker).not.toMatch(/chrom(e|ium)[-_ @=]*v?\d/i)
    expect(docker).not.toMatch(/\b\d{3}\.0\.\d{4}\.\d+\b/)
    expect(docker).not.toMatch(/PLAYWRIGHT_[A-Z_]*(VERSION|REVISION)/)
  })

  it('the head comment and the sizing note say what the browser changes', () => {
    // red if either comment goes back to saying nothing about the browser
    const head = docker.split('\n\n')[0]
    expect(head).toMatch(/chromium-headless-shell/)
    expect(head).toMatch(/WEB_BROWSER=none/)
    const note = docker.slice(docker.indexOf('OOM-killed'))
    expect(note).toMatch(/Chrome/)
    expect(note).toMatch(/memory/)
  })

  it('nothing is invented: unmeasured in ARCHITECTURE and CHANGELOG, SANS_SANDBOX false', () => {
    // red if a figure replaces the "non mesuré" line, or the flag flips without a measurement
    const arch = read('ARCHITECTURE.md')
    const sec = arch.slice(arch.indexOf('### AD-web-6'), arch.indexOf('### AD-web-7'))
    expect(sec).toMatch(/Not measured — to be measured on the image of the delivery tag/)
    expect(read('CHANGELOG.md')).toMatch(/non mesuré — à mesurer sur l'image du tag de livraison/)
    expect(read('plugins/web/mcp/relais.mjs')).toMatch(/export const SANS_SANDBOX = false/)
  })
})
