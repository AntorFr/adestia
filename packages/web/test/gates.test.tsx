// @vitest-environment jsdom
/**
 * The four gates and the offline start (E-1, E-21): one card each, an icon, the
 * sentence in the browser's language until the instance can speak its own, and
 * the wifi-off icon only for a thrown fetch — never for an HTTP status.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from '../src/app/App.js'

const answer = (status: number, body: unknown): typeof fetch =>
  (() =>
    Promise.resolve({
      ok: status < 400,
      status,
      json: () => (body === undefined ? Promise.reject(new SyntaxError('bad json')) : Promise.resolve(body)),
    } as unknown as Response)) as unknown as typeof fetch

const iconOf = (container: HTMLElement) => container.querySelector('.adestia-gate__icon use')?.getAttribute('href')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('E-21 offline start', () => {
  it('draws the fatal gate with the wifi-off icon and the network error when fetch throws', async () => {
    const down = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch
    const { container } = render(<App fetchImpl={down} />)
    await waitFor(() => expect(screen.getByText('Adestia could not start')).toBeTruthy())
    expect(screen.getByText('Failed to fetch')).toBeTruthy()
    expect(iconOf(container)).toContain('wifi-off')
    expect(container.querySelector('.adestia-gate__card button, .adestia-gate__card a')).toBeNull()
  })

  it('keeps the alert icon, not wifi-off, for an HTTP 500', async () => {
    const { container } = render(<App fetchImpl={answer(500, { error: 'boom' })} />)
    await waitFor(() => expect(screen.getByText('Adestia could not start')).toBeTruthy())
    expect(screen.getByText('boom')).toBeTruthy()
    expect(iconOf(container)).toContain('circle-alert')
    expect(iconOf(container)).not.toContain('wifi-off')
  })

  it('names a 200 whose body is not JSON instead of a blank page', async () => {
    render(<App fetchImpl={answer(200, undefined)} />)
    await waitFor(() => expect(screen.getByText('Adestia could not start')).toBeTruthy())
  })
})

describe('the gates in the browser language', () => {
  const inFrench = () => vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR')

  it('says the loading gate in French', () => {
    inFrench()
    const pending = (() => new Promise(() => {})) as unknown as typeof fetch
    const { container } = render(<App fetchImpl={pending} />)
    expect(screen.getByText('Chargement…')).toBeTruthy()
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(iconOf(container)).toContain('loader-circle')
  })

  it('says the sign-in gate in French, with a lock and one link', async () => {
    inFrench()
    const { container } = render(<App fetchImpl={answer(401, {})} />)
    await waitFor(() => expect(screen.getByText('Se connecter')).toBeTruthy())
    expect(screen.getByText('Cette instance demande une connexion.')).toBeTruthy()
    expect(screen.queryByText('Sign in')).toBeNull()
    expect(iconOf(container)).toContain('lock')
    expect(container.querySelectorAll('.adestia-gate__card a').length).toBe(1)
  })

  it('says the refused gate in French, with a Sign out ghost button', async () => {
    inFrench()
    const { container } = render(<App fetchImpl={answer(403, {})} />)
    await waitFor(() => expect(screen.getByText('Accès refusé')).toBeTruthy())
    expect(screen.getByText('Se déconnecter')).toBeTruthy()
    expect(container.textContent).not.toMatch(/You are signed in|Sign out|Not allowed/)
    expect(iconOf(container)).toContain('circle-alert')
    expect(container.querySelector('form[action="/auth/logout"] .adestia-btn--ghost')).toBeTruthy()
  })

  it('says the fatal gate in French, offline too', async () => {
    inFrench()
    const down = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch
    render(<App fetchImpl={down} />)
    await waitFor(() => expect(screen.getByText('Adestia n’a pas pu démarrer')).toBeTruthy())
    expect(screen.queryByText('Adestia could not start')).toBeNull()
  })

  it('stays in English when the browser speaks English', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US')
    render(<App fetchImpl={answer(403, {})} />)
    await waitFor(() => expect(screen.getByText('Not allowed')).toBeTruthy())
    expect(screen.getByText(/You are signed in, but your account/)).toBeTruthy()
  })
})
