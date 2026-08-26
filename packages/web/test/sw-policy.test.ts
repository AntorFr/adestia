import { describe, expect, it } from 'vitest'

import { isCacheable, strategyFor } from '../src/sw/policy.js'

const ORIGIN = 'https://golem.example'
const ask = (url: string, extra: { method?: string; mode?: string } = {}) =>
  strategyFor({
    method: extra.method ?? 'GET',
    mode: extra.mode ?? 'no-cors',
    url: url.startsWith('http') ? url : `${ORIGIN}${url}`,
    origin: ORIGIN,
  })

describe('what the worker refuses to touch', () => {
  it('never intercepts the API', () => {
    // The turn stream is an SSE body that never ends; a worker holding one
    // holds a promise open for the length of the conversation.
    expect(ask('/api/chat/stream', { mode: 'cors' })).toBe('bypass')
    expect(ask('/api/instance', { mode: 'cors' })).toBe('bypass')
  })

  it('never intercepts the sign-in bounce', () => {
    expect(ask('/auth/login', { mode: 'navigate' })).toBe('bypass')
    expect(ask('/auth/callback?code=abc', { mode: 'navigate' })).toBe('bypass')
  })

  it('leaves anything but a GET alone', () => {
    // A worker may only replay what is safe to replay.
    expect(ask('/pages/garage', { method: 'POST' })).toBe('bypass')
    expect(ask('/pages/garage', { method: 'HEAD' })).toBe('bypass')
  })

  it('leaves another origin alone', () => {
    expect(ask('https://idp.example/authorize', { mode: 'navigate' })).toBe('bypass')
  })

  it('leaves itself alone', () => {
    // Cached, a worker becomes impossible to replace.
    expect(ask('/sw.js')).toBe('bypass')
  })
})

describe('what it serves from where', () => {
  it('goes to the network first for the document', () => {
    // The property this whole file exists for: a cache-first shell runs last
    // week's bundle against this week's API, and no user gesture fixes it.
    expect(ask('/', { mode: 'navigate' })).toBe('network-first')
    expect(ask('/pages/garage', { mode: 'navigate' })).toBe('network-first')
  })

  it('serves a content-addressed chunk from the cache', () => {
    // `app-B3xK9f2p.js` cannot change meaning without changing name, so the
    // cache answers exactly what the network would have.
    expect(ask('/assets/index-B3xK9f2p.js')).toBe('cache-first')
    expect(ask('/assets/index-B3xK9f2p.css')).toBe('cache-first')
  })

  it('goes to the network first for anything whose name outlives its content', () => {
    // Vendored React, a plugin's module, a skin's stylesheet: same address
    // across releases, so the cache is a fallback and never a shortcut.
    expect(ask('/vendor/react.js')).toBe('network-first')
    expect(ask('/plugins/parcours/web/app.js')).toBe('network-first')
    expect(ask('/skin/skin.css')).toBe('network-first')
    expect(ask('/icon-192.png')).toBe('network-first')
    // Not under /assets/, so not content-addressed however it is spelled.
    expect(ask('/uploads/photo-B3xK9f2p.jpg')).toBe('network-first')
  })
})

describe('what may enter the cache', () => {
  const response = (over: Partial<{ ok: boolean; status: number; type: string }> = {}) => ({
    ok: true,
    status: 200,
    type: 'basic',
    ...over,
  })

  it('keeps a plain success', () => {
    expect(isCacheable(response())).toBe(true)
  })

  it('refuses a redirect it did not follow', () => {
    // What an OIDC instance answers a signed-out navigation. Cached, it would
    // be replayed forever as "the shell".
    expect(isCacheable(response({ type: 'opaqueredirect', ok: false, status: 0 }))).toBe(false)
  })

  it('refuses an opaque response, whose success is unreadable', () => {
    expect(isCacheable(response({ type: 'opaque', ok: false, status: 0 }))).toBe(false)
  })

  it('refuses anything that is not a 200', () => {
    // A 404 cached under the shell's address is a product that opens to
    // nothing, offline, until the cache name changes.
    expect(isCacheable(response({ ok: false, status: 404 }))).toBe(false)
    expect(isCacheable(response({ status: 206 }))).toBe(false)
  })
})
