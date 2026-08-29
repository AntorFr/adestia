// @vitest-environment jsdom
/**
 * The MCP panel, rendered in jsdom.
 *
 * What is asserted is what an operator must be able to tell apart: a server
 * that is down from one waiting to be signed into, and "this engine cannot
 * report" from "you have no servers". Both distinctions were lost in the
 * shape this panel replaced.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { McpPanel } from '../src/app/Settings.js'

const answering = (status: number, body: unknown): typeof fetch =>
  vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as unknown as Response),
  ) as unknown as typeof fetch

describe('the MCP panel', () => {
  it('names each server and what it is doing', async () => {
    render(
      <McpPanel
        fetchImpl={answering(200, {
          servers: [
            { name: 'home-assistant', state: 'connected' },
            { name: 'notion', state: 'needs-auth' },
          ],
        })}
      />,
    )
    await screen.findByText('home-assistant')
    expect(screen.getByText('connected')).toBeTruthy()
    expect(screen.getByText('needs a sign-in')).toBeTruthy()
  })

  it('does not paint a sign-in as a failure', async () => {
    // Red would send somebody debugging a network while a server waits to be
    // logged into.
    const { container } = render(
      <McpPanel fetchImpl={answering(200, { servers: [{ name: 'notion', state: 'needs-auth' }] })} />,
    )
    await screen.findByText('notion')
    expect(container.querySelector('.adestia-stat--settled')).toBeNull()
    // Waiting on the world — which is exactly what it is.
    expect(container.querySelector('.adestia-stat--waiting')).toBeTruthy()
  })

  it('shows the reason the CLI gave, and never invents one', async () => {
    const { container } = render(
      <McpPanel
        fetchImpl={answering(200, {
          servers: [
            { name: 'broken', state: 'failed', error: 'spawn ENOENT' },
            { name: 'quiet', state: 'failed' },
          ],
        })}
      />,
    )
    await screen.findByText('spawn ENOENT')
    expect(container.querySelectorAll('.adestia-mcp__why')).toHaveLength(1)
  })

  it('renders nothing at all when the driver cannot report', async () => {
    // A 404 and an empty list are different facts, and one empty box cannot
    // say both.
    const { container } = render(<McpPanel fetchImpl={answering(404, { error: 'no' })} />)
    await waitFor(() => expect(container.querySelector('.adestia-mcp')).toBeNull())
  })

  it('renders nothing when there is no server to report on', async () => {
    const { container } = render(<McpPanel fetchImpl={answering(200, { servers: [] })} />)
    await waitFor(() => expect(container.querySelector('.adestia-mcp')).toBeNull())
  })

  it('speaks the instance’s language', async () => {
    render(
      <McpPanel
        fetchImpl={answering(200, { servers: [{ name: 'ha', state: 'connected' }] })}
        t={(key) => (key === 'connected' ? 'connecté' : key)}
      />,
    )
    expect(await screen.findByText('connecté')).toBeTruthy()
  })
})
