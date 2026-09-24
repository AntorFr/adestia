// @vitest-environment jsdom
/**
 * The configuration screen, rendered in jsdom.
 *
 * What is asserted is what an operator must be able to tell apart before they
 * touch anything: a value somebody DECIDED from one nobody wrote; a setting
 * that takes effect now from one that waits for a restart; and an instance
 * that can write its file from one that cannot — which is every deployment
 * where the file is a Kubernetes ConfigMap or a `:ro` bind mount.
 *
 * And the one thing it must never do: rewrite a key the operator did not
 * touch. The request carries the edits, not the form.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SETTING_GROUPS } from '@antorfr/adestia-schemas'

import { Configuration } from '../src/app/Configuration.js'

const PAYLOAD = {
  groups: SETTING_GROUPS,
  values: [
    { path: ['workspace', 'watch', 'enabled'], value: true, source: 'file' },
    { path: ['workspace', 'watch', 'polling'], value: false, source: 'default' },
    { path: ['workspace', 'watch', 'intervalMs'], value: 2000, source: 'file' },
  ],
  file: '/app/adestia.config.yaml',
  writable: true,
  revision: '17-420',
}

/** A fetch that records what was PUT, so the request itself can be asserted. */
function serving(payload: unknown, onPut?: (body: unknown) => { status?: number; body: unknown }) {
  const sent: unknown[] = []
  const impl = vi.fn((_input: unknown, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      sent.push(body)
      const answer = onPut?.(body) ?? { body: { revision: 'new', values: PAYLOAD.values } }
      const status = answer.status ?? 200
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(answer.body),
      } as unknown as Response)
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    } as unknown as Response)
  }) as unknown as typeof fetch
  return { impl, sent }
}

describe('what a field says before it is touched', () => {
  it('names the file it writes, because an operator edits it by hand too', async () => {
    const { impl } = serving(PAYLOAD)
    render(<Configuration fetchImpl={impl} />)
    await waitFor(() => expect(screen.getByText('/app/adestia.config.yaml')).toBeTruthy())
  })

  it('tells a value somebody wrote from one nobody did', async () => {
    // "false" read as a decision when nobody made one is how an operator
    // concludes the setting is wrong rather than unset.
    const { impl } = serving(PAYLOAD)
    const { container } = render(<Configuration fetchImpl={impl} />)
    await waitFor(() => expect(container.querySelector('.adestia-config__field')).toBeTruthy())

    const marks = [...container.querySelectorAll('.adestia-config__from')].map(
      (node) => node.textContent,
    )
    // Exactly one of the three is unset in the payload above.
    expect(marks).toEqual(['default'])
  })

  it('says which settings wait for a restart rather than letting them look broken', async () => {
    const { impl } = serving(PAYLOAD)
    const { container } = render(<Configuration fetchImpl={impl} />)
    await waitFor(() => expect(container.querySelector('.adestia-config__field')).toBeTruthy())
    expect(container.querySelectorAll('.adestia-config__restart').length).toBeGreaterThan(0)
  })
})

describe('an instance that cannot write its own file', () => {
  it('says so at the top, and still shows every value', async () => {
    const { impl } = serving({
      ...PAYLOAD,
      writable: false,
      readOnlyReason: 'the configuration file is not writable by this instance',
    })
    const { container } = render(<Configuration fetchImpl={impl} />)
    await waitFor(() => expect(container.querySelector('.adestia-config__locked')).toBeTruthy())

    // Seeing the instance's own settings is worth the screen on its own —
    // that is the half that was missing before this page existed.
    expect(container.querySelectorAll('.adestia-config__field').length).toBe(3)
    // And no way to pretend otherwise: no save bar, every control inert.
    expect(container.querySelector('.adestia-config__bar')).toBeNull()
    for (const input of container.querySelectorAll('input')) {
      expect((input as HTMLInputElement).disabled).toBe(true)
    }
  })
})

describe('saving', () => {
  it('sends only what was touched, with the revision it was shown', async () => {
    // A form that posted every field would rewrite keys the operator never
    // looked at — and a key written explicitly is no longer a default, which
    // is a change to the file nobody asked for.
    const { impl, sent } = serving(PAYLOAD)
    const { container } = render(<Configuration fetchImpl={impl} />)
    await waitFor(() => expect(container.querySelector('.adestia-config__field')).toBeTruthy())

    const polling = container.querySelector('#setting-workspace\\.watch\\.polling') as HTMLInputElement
    fireEvent.click(polling)
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(sent.length).toBe(1))
    expect(sent[0]).toEqual({
      changes: [{ path: ['workspace', 'watch', 'polling'], value: true }],
      revision: '17-420',
    })
  })

  it('marks an edit as unsaved until it is written', async () => {
    const { impl } = serving(PAYLOAD)
    const { container } = render(<Configuration fetchImpl={impl} />)
    await waitFor(() => expect(container.querySelector('.adestia-config__field')).toBeTruthy())

    fireEvent.click(container.querySelector('#setting-workspace\\.watch\\.polling') as HTMLInputElement)
    expect(container.querySelector('.adestia-config__from--edited')?.textContent).toBe('not saved yet')
  })

  it('tells the operator to reload when the file moved under them', async () => {
    // The file stays hand-editable — that is the point of it remaining the
    // source of truth — so "try again" would be the wrong advice: it would
    // undo whatever the terminal just wrote.
    const { impl } = serving(PAYLOAD, () => ({
      status: 409,
      body: { error: 'the configuration file changed since this screen read it', kind: 'stale' },
    }))
    const { container } = render(<Configuration fetchImpl={impl} />)
    await waitFor(() => expect(container.querySelector('.adestia-config__field')).toBeTruthy())

    fireEvent.click(container.querySelector('#setting-workspace\\.watch\\.polling') as HTMLInputElement)
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Reload/))
  })

  it('drops the edits on discard, without asking the server anything', async () => {
    const { impl, sent } = serving(PAYLOAD)
    const { container } = render(<Configuration fetchImpl={impl} />)
    await waitFor(() => expect(container.querySelector('.adestia-config__field')).toBeTruthy())

    fireEvent.click(container.querySelector('#setting-workspace\\.watch\\.polling') as HTMLInputElement)
    fireEvent.click(screen.getByText('Discard'))
    expect(container.querySelector('.adestia-config__from--edited')).toBeNull()
    expect(sent).toEqual([])
  })
})

describe('the restart bar', () => {
  /** A fetch that also answers the restart route and the health probe. */
  function withRestart(restart: { status?: number; body: unknown }) {
    const calls: string[] = []
    const impl = vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input)
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url === '/api/restart') {
        const status = restart.status ?? 202
        return Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(restart.body),
        } as unknown as Response)
      }
      if (url === '/api/health') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as unknown as Response)
      }
      if (init?.method === 'PUT') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ revision: 'new', values: PAYLOAD.values }),
        } as unknown as Response)
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(PAYLOAD) } as unknown as Response)
    }) as unknown as typeof fetch
    return { impl, calls }
  }

  async function savedSomethingSlow(impl: typeof fetch) {
    const view = render(<Configuration fetchImpl={impl} />)
    await waitFor(() => expect(view.container.querySelector('.adestia-config__field')).toBeTruthy())
    fireEvent.click(
      view.container.querySelector('#setting-workspace\\.watch\\.polling') as HTMLInputElement,
    )
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() =>
      expect(view.container.querySelector('.adestia-config__restart-bar')).toBeTruthy(),
    )
    return view
  }

  it('stays away until a restart is actually owed', async () => {
    // A button that is always there is a button nobody reads. It appears
    // because something is pending, not because the setting exists.
    const { impl } = withRestart({ body: { restarting: true } })
    const { container } = render(<Configuration fetchImpl={impl} />)
    await waitFor(() => expect(container.querySelector('.adestia-config__field')).toBeTruthy())
    expect(container.querySelector('.adestia-config__restart-bar')).toBeNull()
  })

  it('appears once a restart-pending value has been written', async () => {
    const { impl } = withRestart({ body: { restarting: true } })
    const { container } = await savedSomethingSlow(impl)
    expect(container.querySelector('.adestia-config__restart-bar')?.textContent).toMatch(
      /waiting for a restart/,
    )
  })

  it('waits for the instance to answer again, then re-reads it', async () => {
    // The server answers 202 and only THEN closes, so the moment after the
    // click is a gap where nothing is listening. Polling health is what turns
    // that gap into a state rather than a failed fetch nobody can read.
    const { impl, calls } = withRestart({ body: { restarting: true } })
    const { container } = await savedSomethingSlow(impl)

    fireEvent.click(screen.getByText('Restart now'))
    await waitFor(() => expect(container.querySelector('.adestia-config__restart-bar')).toBeNull(), {
      timeout: 5000,
    })
    expect(calls).toContain('POST /api/restart')
    expect(calls).toContain('GET /api/health')
  })

  it('does not restart under a running turn, and offers to overrule', async () => {
    const { impl } = withRestart({ status: 409, body: { error: '2 turns are running', running: 2 } })
    await savedSomethingSlow(impl)

    fireEvent.click(screen.getByText('Restart now'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/2 turn/))
    // The overrule is a second, deliberate press — never the first one.
    expect(screen.getByText('Restart anyway')).toBeTruthy()
  })
})

describe('an instance that does not offer the screen', () => {
  it('states the fact rather than rendering an empty form', async () => {
    const impl = vi.fn(() =>
      Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as unknown as Response),
    ) as unknown as typeof fetch
    render(<Configuration fetchImpl={impl} />)
    await waitFor(() =>
      expect(screen.getByText('This instance does not expose its configuration.')).toBeTruthy(),
    )
  })
})
