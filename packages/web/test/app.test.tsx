// @vitest-environment jsdom
/**
 * The shell's boot path.
 *
 * What matters here is what a user sees when something is not right: a status
 * code is never an answer, and "sign in" and "you will never be let in" must
 * not look the same.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from '../src/app/App.js'

const INSTANCE = {
  driver: { label: 'Test CLI', cliVersion: '1.0', capabilities: [] },
  auth: { mode: 'none' },
  user: { userId: 'local', displayName: 'Local user' },
  skin: 'default',
  plugins: [],
  pluginProblems: [],
  turns: { max: 3, running: 0 },
}

function apiFetch(instance: { status?: number; body?: unknown } = {}): typeof fetch {
  return ((url: string) => {
    if (String(url).startsWith('/api/instance')) {
      const status = instance.status ?? 200
      return Promise.resolve({
        ok: status < 400,
        status,
        json: () => Promise.resolve(instance.body ?? INSTANCE),
      } as unknown as Response)
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ pages: [], conversations: [] }),
    } as unknown as Response)
  }) as unknown as typeof fetch
}

describe('boot', () => {
  it('renders the shell once the instance answers', async () => {
    const { container } = render(<App fetchImpl={apiFetch()} />)
    await waitFor(() => expect(container.querySelector('.golem-shell')).toBeTruthy())
    expect(screen.getByText(/Test CLI/)).toBeTruthy()
  })

  it('invites the user to sign in on a 401', async () => {
    // A status code is not an answer: it leaves the user reading a number with
    // no way forward.
    render(<App fetchImpl={apiFetch({ status: 401 })} />)
    await waitFor(() => expect(screen.getByText('Sign in')).toBeTruthy())
    expect(screen.getByText('Sign in').getAttribute('href')).toContain('/auth/login')
  })

  it('says plainly when an account will never be admitted', async () => {
    // 403 is a different fact from 401: sending them back to login would loop
    // them forever.
    render(<App fetchImpl={apiFetch({ status: 403 })} />)
    await waitFor(() => expect(screen.getByText('Not allowed')).toBeTruthy())
    expect(screen.queryByText('Sign in')).toBeNull()
  })

  it('names a failure it cannot interpret rather than rendering nothing', async () => {
    // A blank page makes its user reload forever.
    render(<App fetchImpl={apiFetch({ status: 500 })} />)
    await waitFor(() => expect(screen.getByText(/could not start/)).toBeTruthy())
  })

  it('offers sign-out only where there is a session to end', async () => {
    render(<App fetchImpl={apiFetch()} />)
    await waitFor(() => expect(screen.getByText(/Test CLI/)).toBeTruthy())
    expect(screen.queryByText('Sign out')).toBeNull()
  })

  it('offers sign-out in oidc mode', async () => {
    const body = { ...INSTANCE, auth: { mode: 'oidc' } }
    render(<App fetchImpl={apiFetch({ body })} />)
    await waitFor(() => expect(screen.getByText('Sign out')).toBeTruthy())
  })

  it('surfaces refused extensions where the user will see them', async () => {
    const body = {
      ...INSTANCE,
      pluginProblems: [{ id: 'broken', reason: 'manifest is not valid JSON' }],
    }
    render(<App fetchImpl={apiFetch({ body })} />)
    await waitFor(() => expect(screen.getByText(/not valid JSON/)).toBeTruthy())
  })
})
