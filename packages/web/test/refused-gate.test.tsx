// @vitest-environment jsdom
/**
 * E-1 refused, named: a 401 on /api/instance sends the shell to ask
 * /auth/refused who was refused; a name gives the refused page with it, anything
 * else stays the plain sign-in invitation (P-1 steps 4 and 8).
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from '../src/app/App.js'

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as unknown as Response)

/** /api/instance answers 401; /auth/refused answers as told. */
const server = (refused: () => Promise<Response>) => {
  const asked: string[] = []
  const impl = ((input: RequestInfo | URL) => {
    const url = String(input)
    asked.push(url)
    return url.includes('/auth/refused') ? refused() : reply(401, {})
  }) as unknown as typeof fetch
  return { impl, asked }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the refused page names the account', () => {
  it('shows the name in English with a Sign out form', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US')
    const { impl, asked } = server(() => reply(200, { displayName: 'Visiteur' }))
    const { container } = render(<App fetchImpl={impl} />)
    await waitFor(() => expect(screen.getByText('Not allowed')).toBeTruthy())
    expect(container.textContent).toContain('Signed in as Visiteur — this account does not have access to this instance.')
    expect(container.textContent).not.toContain('%name')
    expect(container.querySelector('form[method="post"][action="/auth/logout"] button')).toBeTruthy()
    expect(container.querySelector('a[href*="/auth/login"]')).toBeNull()
    expect(asked.some((u) => u.includes('/auth/refused'))).toBe(true)
  })

  it('shows the name in French', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR')
    const { impl } = server(() => reply(200, { displayName: 'Visiteur' }))
    const { container } = render(<App fetchImpl={impl} />)
    await waitFor(() => expect(screen.getByText('Accès refusé')).toBeTruthy())
    expect(container.textContent).toContain('Connecté en tant que Visiteur — ce compte n’a pas accès à cette instance.')
    expect(screen.getByText('Se déconnecter')).toBeTruthy()
  })

  it('keeps a name containing the placeholder or regex characters literal', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US')
    const { impl } = server(() => reply(200, { displayName: "$& %name O'Neil" }))
    const { container } = render(<App fetchImpl={impl} />)
    await waitFor(() => expect(screen.getByText('Not allowed')).toBeTruthy())
    expect(container.textContent).toContain("Signed in as $& %name O'Neil — this account")
  })

  it('does not render a name as markup', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US')
    const { impl } = server(() => reply(200, { displayName: '<img src=x onerror=alert(1)>' }))
    const { container } = render(<App fetchImpl={impl} />)
    await waitFor(() => expect(screen.getByText('Not allowed')).toBeTruthy())
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})

describe('without a remembered refusal the 401 stays a sign-in', () => {
  const signin = async (refused: () => Promise<Response>) => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US')
    const { container } = render(<App fetchImpl={server(refused).impl} />)
    await waitFor(() => expect(screen.getByText('Sign in')).toBeTruthy())
    expect(screen.queryByText('Not allowed')).toBeNull()
    expect(container.textContent).not.toContain('Signed in as')
  }

  it('on a 401 from /auth/refused', () => signin(() => reply(401, { error: 'none' })))
  it('when /auth/refused cannot be reached', () => signin(() => Promise.reject(new TypeError('Failed to fetch'))))
  it('when the answer has no name', () => signin(() => reply(200, {})))
  it('when the name is empty', () => signin(() => reply(200, { displayName: '' })))
  it('when the name is not a string', () => signin(() => reply(200, { displayName: 42 })))
})

describe('a direct 403 keeps the old sentence', () => {
  it('does not ask /auth/refused', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US')
    const asked: string[] = []
    const impl = ((input: RequestInfo | URL) => {
      asked.push(String(input))
      return reply(403, {})
    }) as unknown as typeof fetch
    render(<App fetchImpl={impl} />)
    await waitFor(() => expect(screen.getByText(/You are signed in, but your account/)).toBeTruthy())
    expect(asked.some((u) => u.includes('/auth/refused'))).toBe(false)
  })
})
