// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Settings, StatusLine } from '../src/app/Settings.js'

/** A fetch that answers the arming routes from a small script. */
function armingFetch(script: {
  status?: unknown
  statusCode?: number
  begin?: unknown
  beginCode?: number
  complete?: unknown
  completeCode?: number
}) {
  const calls: string[] = []
  const impl = ((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    const answer = (code: number, body: unknown) =>
      Promise.resolve({
        ok: code >= 200 && code < 300,
        status: code,
        json: () => Promise.resolve(body),
      } as unknown as Response)

    if (url === '/api/auth/driver' && (init?.method ?? 'GET') === 'GET') {
      return answer(script.statusCode ?? 200, script.status ?? { state: 'absent', source: 'cli-native' })
    }
    if (url === '/api/auth/driver/begin') return answer(script.beginCode ?? 200, script.begin ?? {})
    if (url === '/api/auth/driver/complete') {
      return answer(script.completeCode ?? 200, script.complete ?? { armed: true })
    }
    return answer(200, {})
  }) as unknown as typeof fetch
  return { impl, calls }
}

const URL_PROMPT = {
  sessionId: 's1',
  mode: 'url+code',
  authorizeUrl: 'https://claude.ai/oauth/authorize',
  inputLabel: 'Paste the code',
}

describe('status line', () => {
  it('does not call a CLI-native setup a problem', () => {
    // Saying "missing" would send someone fixing what already works.
    render(<StatusLine status={{ state: 'absent', source: 'cli-native' }} />)
    expect(screen.getByText(/CLI’s own credentials/)).toBeTruthy()
  })

  it('shows when a managed token was armed', () => {
    render(<StatusLine status={{ state: 'armed', source: 'managed', savedAt: '2026-06-01T00:00:00Z' }} />)
    expect(screen.getByText(/Armed/)).toBeTruthy()
  })

  it('shows the reason a token was refused', () => {
    render(<StatusLine status={{ state: 'invalid', source: 'managed', reason: 'Token revoked' }} />)
    expect(screen.getByText('Token revoked')).toBeTruthy()
  })
})

describe('settings', () => {
  it('offers nothing to arm when the engine cannot be armed', async () => {
    // A button that can never work is worse than no button.
    const { impl } = armingFetch({ statusCode: 404 })
    render(<Settings fetchImpl={impl} />)
    await waitFor(() => expect(screen.getByText(/nothing to arm here/)).toBeTruthy())
    expect(screen.queryByText('Arm a token')).toBeNull()
  })

  it('walks the user through the flow', async () => {
    const { impl, calls } = armingFetch({ begin: URL_PROMPT })
    render(<Settings fetchImpl={impl} />)

    fireEvent.click(await screen.findByText('Arm a token'))
    await waitFor(() => expect(screen.getByText(/authorisation link/)).toBeTruthy())
    expect(screen.getByText('Paste the code')).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'the-code' } })
    fireEvent.click(screen.getByText('Validate'))

    await waitFor(() => expect(calls).toContain('POST /api/auth/driver/complete'))
  })

  it('renders a device-code flow from the same panel', async () => {
    // The mode decides the wording; the driver's name never reaches here, so
    // a third engine needs no change in this file.
    const { impl } = armingFetch({
      begin: { sessionId: 's1', mode: 'device-code', authorizeUrl: 'https://github.com/login/device', userCode: 'WXYZ-1234' },
    })
    render(<Settings fetchImpl={impl} />)
    fireEvent.click(await screen.findByText('Arm a token'))
    await waitFor(() => expect(screen.getByText('WXYZ-1234')).toBeTruthy())
  })

  it('will not finish a flow until its consent statement is accepted', async () => {
    // The driver reads "finished" as "the user agreed": Copilot's login stops
    // on a question about storing the token unencrypted, and this box is the
    // only place that answer comes from.
    const { impl, calls } = armingFetch({
      begin: {
        sessionId: 's1',
        mode: 'device-code',
        authorizeUrl: 'https://github.com/login/device',
        userCode: 'WXYZ-1234',
        consent: 'Signing in writes the token unencrypted into a file Demeura owns.',
      },
    })
    render(<Settings fetchImpl={impl} />)
    fireEvent.click(await screen.findByText('Arm a token'))

    const finish = await screen.findByText('I have approved — finish')
    expect(screen.getByText(/writes the token unencrypted/)).toBeTruthy()
    expect(finish.closest('button')?.disabled).toBe(true)

    fireEvent.click(screen.getByRole('checkbox'))
    expect(finish.closest('button')?.disabled).toBe(false)
    fireEvent.click(finish)
    await waitFor(() => expect(calls).toContain('POST /api/auth/driver/complete'))
  })

  it('asks for consent again on the next flow', async () => {
    // Consent is given for the login being run now, not stored as a setting.
    const prompt = {
      sessionId: 's1',
      mode: 'device-code',
      userCode: 'WXYZ-1234',
      consent: 'Signing in writes the token unencrypted into a file Demeura owns.',
    }
    const { impl } = armingFetch({ begin: prompt })
    render(<Settings fetchImpl={impl} />)
    fireEvent.click(await screen.findByText('Arm a token'))
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.click(screen.getByText('Cancel'))

    fireEvent.click(await screen.findByText('Arm a token'))
    const checkbox = (await screen.findByRole('checkbox')) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    expect(screen.getByText('I have approved — finish').closest('button')?.disabled).toBe(true)
  })

  it('keeps Validate disabled until a code is typed', async () => {
    const { impl } = armingFetch({ begin: URL_PROMPT })
    render(<Settings fetchImpl={impl} />)
    fireEvent.click(await screen.findByText('Arm a token'))
    await waitFor(() => expect(screen.getByText('Validate')).toBeTruthy())
    expect(screen.getByText('Validate').closest('button')?.disabled).toBe(true)
  })

  it('shows why a code was refused, and lets the user try again', async () => {
    const { impl } = armingFetch({
      begin: URL_PROMPT,
      completeCode: 502,
      complete: { error: 'the code was wrong or expired' },
    })
    render(<Settings fetchImpl={impl} />)
    fireEvent.click(await screen.findByText('Arm a token'))
    await waitFor(() => expect(screen.getByRole('textbox')).toBeTruthy())

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByText('Validate'))

    await waitFor(() => expect(screen.getByText(/wrong or expired/)).toBeTruthy())
    // Back to a state the user can act from, rather than a dead panel.
    expect(screen.getByText('Arm a token')).toBeTruthy()
  })

  it('reports a flow that would not even start', async () => {
    const { impl } = armingFetch({ beginCode: 502, begin: { error: 'the CLI printed no link' } })
    render(<Settings fetchImpl={impl} />)
    fireEvent.click(await screen.findByText('Arm a token'))
    await waitFor(() => expect(screen.getByText('the CLI printed no link')).toBeTruthy())
  })

  it('offers to forget a stored token', async () => {
    const { impl, calls } = armingFetch({ status: { state: 'armed', source: 'managed' } })
    render(<Settings fetchImpl={impl} />)
    fireEvent.click(await screen.findByText('Forget it'))
    await waitFor(() => expect(calls).toContain('DELETE /api/auth/driver'))
  })

  it('cancels a flow the user abandons', async () => {
    const { impl, calls } = armingFetch({ begin: URL_PROMPT })
    render(<Settings fetchImpl={impl} />)
    fireEvent.click(await screen.findByText('Arm a token'))
    fireEvent.click(await screen.findByText('Cancel'))
    await waitFor(() => expect(calls).toContain('POST /api/auth/driver/cancel'))
    expect(screen.getByText('Arm a token')).toBeTruthy()
  })

  it('never shows a token, only a state', async () => {
    // The browser is never given the secret; nothing in this panel could
    // leak one even if a plugin's view went hostile.
    const { impl } = armingFetch({ status: { state: 'armed', source: 'managed', savedAt: '2026-06-01T00:00:00Z' } })
    const { container } = render(<Settings fetchImpl={impl} />)
    await waitFor(() => expect(screen.getByText(/Armed/)).toBeTruthy())
    expect(container.textContent).not.toContain('sk-ant')
  })
})
